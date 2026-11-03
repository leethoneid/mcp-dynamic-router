/**
 * MCP Dynamic Router - Production Hardened HTTP Microservice Gateway
 * Implements strict host binding (127.0.0.1), API_KEY auth guard, and payload size defense.
 */

import http from 'node:http';
import path from 'node:path';
import { MCPDynamicRouter } from './router.js';
import { MCPRouterConfig } from './types.js';

export interface ServerOptions {
  maxBodyBytes?: number;
  apiKey?: string;
  config?: MCPRouterConfig;
}

export function createGatewayServer(options: ServerOptions = {}, routerInstance?: MCPDynamicRouter): http.Server {
  const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024; // 10 MB payload limit
  const apiKey = options.apiKey ?? process.env.API_KEY;

  const router = routerInstance ?? new MCPDynamicRouter(options.config ?? {
    version: '1.0.0',
    mode: 'virtual',
    servers: {}
  });

  let initialized = false;
  const initPromise = router.init().then(() => {
    initialized = true;
  });

  const server = http.createServer(async (req, res) => {
    // CORS headers for local web tools
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'mcp-dynamic-router',
        version: '1.0.0',
        mode: router.config.mode,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Metrics endpoint
    if (req.method === 'GET' && req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(router.getMetrics()));
      return;
    }

    // JSON-RPC HTTP POST Gateway
    if (req.method === 'POST' && (req.url === '/mcp' || req.url === '/rpc')) {
      // 1. API Key Authentication Guard
      if (apiKey) {
        const authHeader = req.headers['authorization'];
        const customKey = req.headers['x-api-key'];
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : (typeof customKey === 'string' ? customKey.trim() : undefined);

        if (!token || token !== apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32000, message: 'Unauthorized: Invalid or missing API key.' }
          }));
          return;
        }
      }

      // 2. Payload size limiter & UTF-8 chunk buffering
      let totalBytes = 0;
      const chunks: Buffer[] = [];
      let isExceeded = false;

      req.on('error', () => {
        // Safe guard against destroyed/aborted sockets
      });

      req.on('data', (chunk: Buffer) => {
        if (isExceeded) return;
        totalBytes += chunk.length;
        if (totalBytes > maxBodyBytes) {
          isExceeded = true;
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32001, message: 'Payload Too Large: Exceeded maxBodyBytes limit.' }
          }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', async () => {
        if (isExceeded) return;
        if (!initialized) {
          await initPromise;
        }

        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          const rpcReq = JSON.parse(body);
          const rpcRes = await router.handleRequest(rpcReq);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rpcRes));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: `Parse error: ${err.message}` }
          }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  return server;
}

const isDirectRun = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))
);

if (isDirectRun) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3008;
  // Strict rule: Default HOST MUST be 127.0.0.1, never 0.0.0.0
  const HOST = process.env.HOST || '127.0.0.1';
  const server = createGatewayServer();

  server.listen(PORT, HOST, () => {
    console.log(`[mcp-router] HTTP Microservice Gateway listening securely on http://${HOST}:${PORT}`);
    console.log(`[mcp-router] Endpoints: GET /health | GET /metrics | POST /mcp`);
  });
}
