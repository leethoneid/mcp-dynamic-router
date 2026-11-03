/**
 * Cross-Platform Compatibility Test Suite (Windows, Linux, macOS)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EditorAdapter } from '../src/editor-adapter.js';
import { MCPDynamicRouter } from '../src/router.js';

describe('MCP Dynamic Router - Cross-Platform Compatibility (Win/Linux/Mac)', () => {
  it('1. should resolve correct editor paths for Windows, macOS, and Linux', () => {
    const editors = ['antigravity', 'cursor', 'claude', 'codex', 'zed', 'windsurf', 'trae', 'cline', 'continue'] as const;

    for (const ed of editors) {
      const info = EditorAdapter.EDITORS[ed];
      assert.ok(info.defaultConfigPath, `${ed} must have a valid default config path`);
      // Path must not contain illegal undefined segments
      assert.ok(!info.defaultConfigPath.includes('undefined'), `Path for ${ed} must not contain undefined`);
    }
  });

  it('2. should parse line feeds and CRLF transparently from stdio', async () => {
    const router = new MCPDynamicRouter({ mode: 'virtual' });
    const crlfReq = '{\r\n  "jsonrpc": "2.0",\r\n  "id": "crlf-1",\r\n  "method": "initialize",\r\n  "params": {}\r\n}';
    const parsed = JSON.parse(crlfReq);
    const res = await router.handleRequest(parsed);

    assert.equal(res.id, 'crlf-1');
    assert.equal(res.result.serverInfo.name, 'mcp-dynamic-router');
  });

  it('3. should verify both Windows (.cmd) and Linux/macOS bash launchers exist in commercial release', () => {
    const root = process.cwd();
    const relDir = path.join(root, 'release-commercial');

    if (fs.existsSync(relDir)) {
      const batLauncher = path.join(relDir, 'mcp-router.cmd');
      const shLauncher = path.join(relDir, 'mcp-router');

      assert.ok(fs.existsSync(batLauncher), 'Windows launcher mcp-router.cmd should exist');
      assert.ok(fs.existsSync(shLauncher), 'Linux/macOS launcher mcp-router should exist');

      const batContent = fs.readFileSync(batLauncher, 'utf-8');
      assert.ok(batContent.includes('bin\\mcp-router.js'), 'bat launcher should point to bin');

      const shContent = fs.readFileSync(shLauncher, 'utf-8');
      assert.ok(shContent.includes('bin/mcp-router.js'), 'sh launcher should point to bin');
    }
  });

  it('4. should correctly sanitize Windows and POSIX path traversal strings', () => {
    const router = new MCPDynamicRouter();
    
    // Windows backslash traversal
    assert.throws(() => {
      router.security.validateToolExecution('test_tool', { file: 'C:\\test_account\\..\\..\\secrets.txt' });
    }, /Suspicious path traversal/);

    // POSIX forward slash traversal
    assert.throws(() => {
      router.security.validateToolExecution('test_tool', { file: '/var/www/../../etc/shadow' });
    }, /Suspicious path traversal/);

    // Home directory traversal
    assert.throws(() => {
      router.security.validateToolExecution('test_tool', { file: '~/.ssh/authorized_keys' });
    }, /Suspicious path traversal/);
  });
});
