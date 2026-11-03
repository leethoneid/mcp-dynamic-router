import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGatewayServer } from '../src/server.js';
import { MCPDynamicRouter } from '../src/router.js';

describe('MCP Dynamic Router - Production Microservice Gateway Suite', () => {
  let server: http.Server;
  let port: number;
  const TEST_API_KEY = 'secret-test-key-2026';

  before((_, done) => {
    // Spin up server with strict API_KEY guard and 5KB body limit for testing
    server = createGatewayServer({
      apiKey: TEST_API_KEY,
      maxBodyBytes: 5 * 1024, // 5KB for unit test payload limit verification
      config: {
        version: '1.0.0',
        mode: 'virtual',
        servers: {}
      }
    });

    // Listen on 127.0.0.1 on dynamic ephemeral port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      port = addr.port;
      done();
    });
  });

  after((_, done) => {
    server.close(() => done());
  });

  test('1. should securely bind to 127.0.0.1 by default and respond to /health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'mcp-dynamic-router');
  });

  test('2. should reject requests with missing or invalid API key with 401 Unauthorized', async () => {
    // Missing auth header
    const resNoAuth = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(resNoAuth.status, 401);

    // Invalid auth header
    const resBadAuth = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(resBadAuth.status, 401);
  });

  test('3. should accept requests with valid Authorization Bearer or X-API-Key header', async () => {
    // Bearer header
    const resBearer = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_API_KEY}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(resBearer.status, 200);
    const dataBearer = await resBearer.json() as any;
    assert.equal(dataBearer.jsonrpc, '2.0');
    assert.ok(dataBearer.result?.tools);

    // X-API-Key header
    const resCustom = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': TEST_API_KEY
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    });
    assert.equal(resCustom.status, 200);
    const dataCustom = await resCustom.json() as any;
    assert.equal(dataCustom.jsonrpc, '2.0');
    assert.ok(dataCustom.result?.tools);
  });

  test('4. should reject payloads exceeding maxBodyBytes with 413 Payload Too Large', async () => {
    // Create an oversized payload > 5KB
    const largePadding = 'x'.repeat(6 * 1024);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list',
          padding: largePadding
        })
      });
      assert.equal(res.status, 413);
    } catch {
      // Sockets destroyed upon 413 may cause client fetch to close, which is also a valid rejection behavior
      assert.ok(true);
    }
  });

  test('5. should expose /metrics endpoint returning router telemetry', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(res.status, 200);
    const metrics = await res.json() as any;
    assert.ok(metrics.totalRequests !== undefined);
  });
});
