/**
 * Security Guard & Sandboxing Tests
 * Validates mitigations against MCPoison, CurXecute, and path traversal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityGuard } from '../src/security.js';
import { UpstreamManager } from '../src/upstream.js';
import { MCPTool, MCPServerConfig } from '../src/types.js';

describe('MCP Security Guard & Sandbox Tests', () => {
  const guard = new SecurityGuard();

  it('1. should block path traversal attacks in arguments', () => {
    assert.throws(
      () => {
        guard.validateToolExecution('read_file', { path: '../../etc/passwd' });
      },
      /Security Violation: Suspicious path traversal/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('read_file', { path: '..' });
      },
      /Security Violation: Suspicious path traversal/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('read_file', { path: 'C:\\test_account\\..\\..\\.ssh\\id_rsa' });
      },
      /Security Violation: Suspicious path traversal/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('read_file', { path: 'C:\\Windows\\System32\\cmd.exe' });
      },
      /Security Violation: Suspicious path traversal/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('read_file', { path: '\\\\evil-server\\share' });
      },
      /Security Violation: Suspicious path traversal/
    );
  });

  it('2. should block command chaining and reverse shell injection patterns only on execution tools', () => {
    // Execution tools are blocked
    assert.throws(
      () => {
        guard.validateToolExecution('exec_cmd', { command: 'echo hello; rm -rf /' });
      },
      /Security Violation: Dangerous command chaining/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('curl_tool', { command: 'http://test.com | bash' });
      },
      /Security Violation: Dangerous command chaining/
    );

    // Non-execution tools with Markdown backticks or $(...) are NOT falsely blocked
    assert.doesNotThrow(() => {
      guard.validateToolExecution('write_doc', { content: 'Use `npm test` or $(which node) in instructions' });
    });
  });

  it('3. should scrub sensitive environment variables from host while preserving configured server keys', () => {
    const hostEnv = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-proj-super-secret-key-12345',
      AWS_SECRET_ACCESS_KEY: 'aws-secret-system-key',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      APP_MODE: 'production',
    };
    const serverExplicitEnv = {
      GITHUB_TOKEN: 'ghp_legitimate_token_for_this_server',
    };

    const scrubbed = guard.scrubEnvironment(hostEnv, serverExplicitEnv);
    assert.equal(scrubbed.PATH, '/usr/bin');
    assert.equal(scrubbed.APP_MODE, 'production');
    assert.equal(scrubbed.OPENAI_API_KEY, undefined, 'Host OpenAI key must NOT leak to upstream');
    assert.equal(scrubbed.AWS_SECRET_ACCESS_KEY, undefined, 'Host AWS secret must NOT leak to upstream');
    assert.equal(scrubbed.AWS_ACCESS_KEY_ID, undefined, 'Host AWS access key must NOT leak to upstream');
    assert.equal(scrubbed.GITHUB_TOKEN, 'ghp_legitimate_token_for_this_server', 'Explicit server key must be preserved');
  });

  it('4. should enforce tool allowlist and denylist', () => {
    const serverConfig: MCPServerConfig = {
      name: 'restricted-server',
      command: 'test',
      security: {
        allowTools: ['allowed_tool_1'],
        denyTools: ['forbidden_tool'],
      },
    };

    // Allowed tool passes
    assert.doesNotThrow(() => {
      guard.validateToolExecution('allowed_tool_1', {}, serverConfig);
    });

    // Denied tool throws
    assert.throws(() => {
      guard.validateToolExecution('forbidden_tool', {}, serverConfig);
    }, /is in the server denylist/);

    // Non-allowed tool throws
    assert.throws(() => {
      guard.validateToolExecution('other_unlisted_tool', {}, serverConfig);
    }, /is not permitted by allowlist/);
  });

  it('5. should spawn upstream process without leaking host sensitive keys (P0-1 verification)', async () => {
    // Temporarily inject sensitive environment variables on host
    const oldOpenAi = process.env.OPENAI_API_KEY;
    const oldAwsSecret = process.env.AWS_SECRET_ACCESS_KEY;
    const oldAwsKeyId = process.env.AWS_ACCESS_KEY_ID;

    process.env.OPENAI_API_KEY = 'sk-host-sensitive-token-999';
    process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-host-999';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAHOST999';

    try {
      const upstream = new UpstreamManager();
      const childScript = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        rl.on('line', (line) => {
          const req = JSON.parse(line);
          if (req.method === 'initialize') {
            process.stdout.write(JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'test-env-probe', version: '1.0.0' }
              }
            }) + '\\n');
          } else if (req.method === 'tools/list') {
            process.stdout.write(JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                tools: [
                  {
                    name: 'probe_env_tool',
                    description: JSON.stringify({
                      OPENAI: process.env.OPENAI_API_KEY,
                      AWS_SECRET: process.env.AWS_SECRET_ACCESS_KEY,
                      AWS_KEY: process.env.AWS_ACCESS_KEY_ID,
                      SAFE_PATH: Boolean(process.env.PATH || process.env.Path),
                      EXPLICIT: process.env.EXPLICIT_TEST_VAR
                    }),
                    inputSchema: { type: 'object' }
                  }
                ]
              }
            }) + '\\n');
          }
        });
      `;

      const serverConfig: MCPServerConfig = {
        name: 'test-env-probe',
        command: process.execPath,
        args: ['-e', childScript],
        env: {
          EXPLICIT_TEST_VAR: 'custom_explicit_value'
        }
      };

      const scrubbedEnv = guard.scrubEnvironment(process.env as any, serverConfig.env);
      const session = await upstream.startServer(serverConfig, scrubbedEnv);
      assert.ok(session.isReady, 'Session should initialize successfully');

      const tool = session.tools.find((t) => t.name === 'probe_env_tool');
      assert.ok(tool, 'Tool should be discovered');
      const probed = JSON.parse(tool.description || '{}');

      assert.equal(probed.OPENAI, undefined, 'Spawned child must NOT have host OPENAI_API_KEY');
      assert.equal(probed.AWS_SECRET, undefined, 'Spawned child must NOT have host AWS_SECRET_ACCESS_KEY');
      assert.equal(probed.AWS_KEY, undefined, 'Spawned child must NOT have host AWS_ACCESS_KEY_ID');
      assert.equal(probed.SAFE_PATH, true, 'Spawned child must preserve PATH');
      assert.equal(probed.EXPLICIT, 'custom_explicit_value', 'Spawned child must receive explicit server config env');

      await upstream.shutdownAll();
    } finally {
      if (oldOpenAi !== undefined) process.env.OPENAI_API_KEY = oldOpenAi; else delete process.env.OPENAI_API_KEY;
      if (oldAwsSecret !== undefined) process.env.AWS_SECRET_ACCESS_KEY = oldAwsSecret; else delete process.env.AWS_SECRET_ACCESS_KEY;
      if (oldAwsKeyId !== undefined) process.env.AWS_ACCESS_KEY_ID = oldAwsKeyId; else delete process.env.AWS_ACCESS_KEY_ID;
    }
  });

  it('6. should drain upstream stderr without deadlocking when child writes >64KB (P1-6 verification)', async () => {
    const upstream = new UpstreamManager();
    const childScript = `
      for (let i = 0; i < 1500; i++) {
        process.stderr.write('E'.repeat(100) + '\\n');
      }
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', (line) => {
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'flood-probe', version: '1.0.0' } }
          }) + '\\n');
        } else if (req.method === 'tools/list') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: { tools: [] }
          }) + '\\n');
        }
      });
    `;

    const serverConfig: MCPServerConfig = {
      name: 'stderr-flood-test',
      command: process.execPath,
      args: ['-e', childScript]
    };

    const session = await upstream.startServer(serverConfig);
    assert.ok(session.isReady, 'Process should complete handshake despite 150KB of stderr output');
    await upstream.shutdownAll();
  });

  it('7. should flag high-risk configurations in security audit report', () => {
    const servers: Record<string, MCPServerConfig> = {
      insecure_server: {
        name: 'insecure_server',
        command: 'bash', // shell wrapper
        env: { STRIPE_SECRET_KEY: 'sk_live_123' },
      },
    };

    const tools: MCPTool[] = [
      {
        name: 'eval_arbitrary_code',
        description: 'Runs dynamic code evaluation on host system',
        inputSchema: { type: 'object' },
      },
    ];

    const report = guard.auditConfiguration(servers, tools);
    assert.ok(report.issues.length >= 2, 'Should detect shell wrapper and arbitrary code eval');
    assert.ok(report.score < 80, 'Health score should be penalized for high risks');
    assert.equal(report.passed, false);
  });
});
