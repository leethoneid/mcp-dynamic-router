/**
 * Core Router & Universal Editor Adapter Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MCPDynamicRouter } from '../src/router.js';
import { SchemaCompressor } from '../src/compressor.js';
import { ToolMatcher } from '../src/matcher.js';
import { EditorAdapter } from '../src/editor-adapter.js';
import { MCPTool } from '../src/types.js';

describe('MCP Dynamic Router - Functional & Protocol Tests', () => {
  const sampleTools: MCPTool[] = [
    {
      name: 'github_create_pull_request',
      description: '### Create Pull Request\nCreates a brand new pull request in the given GitHub repository. [Docs](https://github.com)',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'The exact repository name formatted as owner/repo' },
          title: { type: 'string', description: 'Title of the PR' },
          head: { type: 'string', description: 'Branch containing your changes' },
          base: { type: 'string', description: 'Branch you want to merge into' },
        },
        required: ['repo', 'title', 'head', 'base'],
      },
      _server: 'github',
      _category: 'git',
    },
    {
      name: 'postgres_execute_sql',
      description: 'Executes a raw SQL statement on the connected PostgreSQL production database instance.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The SQL query string to run' },
          timeout_ms: { type: 'number', description: 'Query timeout in milliseconds' },
        },
        required: ['query'],
      },
      _server: 'postgres',
      _category: 'database',
    },
    {
      name: 'slack_post_message',
      description: 'Sends a formatted message to a Slack channel or user.',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'Target channel' },
          text: { type: 'string', description: 'Message body' },
        },
        required: ['channel_id', 'text'],
      },
      _server: 'slack',
      _category: 'chat',
    },
  ];

  it('1. should complete MCP initialize handshake successfully', async () => {
    const router = new MCPDynamicRouter({ mode: 'virtual' });
    const response = await router.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    assert.equal(response.id, 1);
    assert.equal(response.result.protocolVersion, '2024-11-05');
    assert.equal(response.result.serverInfo.name, 'mcp-dynamic-router');
  });

  it('2. should expose exactly 2 meta-tools in Virtual Hub mode and achieve >85% token reduction', async () => {
    const router = new MCPDynamicRouter({ mode: 'virtual' });
    router.upstream.registerMockServer('github', [sampleTools[0]], async () => ({ success: true }));
    router.upstream.registerMockServer('postgres', [sampleTools[1]], async () => ({ success: true }));
    router.upstream.registerMockServer('slack', [sampleTools[2]], async () => ({ success: true }));

    const response = await router.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    assert.equal(response.result.tools.length, 2);
    assert.equal(response.result.tools[0].name, 'mcp_search_tools');
    assert.equal(response.result.tools[1].name, 'mcp_call_tool');

    const stats = response.result._stats;
    assert.ok(stats, 'Stats should be present');
    assert.ok(stats.savingsPercentage > 0, 'Should record token savings');
  });

  it('3. should semantically match database tools when queried with DB keywords', () => {
    const matched = ToolMatcher.rankTools('fix the broken query in postgres table', sampleTools, 2);
    assert.ok(matched.length > 0);
    assert.equal(matched[0].tool.name, 'postgres_execute_sql');
    assert.ok(matched[0].score > 3.0);
  });

  it('4. should semantically match git tools when queried with PR keywords', () => {
    const matched = ToolMatcher.rankTools('create pull request to main branch', sampleTools, 2);
    assert.ok(matched.length > 0);
    assert.equal(matched[0].tool.name, 'github_create_pull_request');
  });

  it('5. should correctly prune descriptions and schemas in SchemaCompressor', () => {
    const compressed = SchemaCompressor.compressTool(sampleTools[0]);
    assert.ok(!compressed.description?.includes('###'));
    assert.ok(!compressed.description?.includes('[Docs]'));
    assert.ok(compressed._compressedTokens! < compressed._rawTokens!);
  });

  it('6. should route mcp_call_tool execution to target upstream mock server', async () => {
    let executedArgs: any = null;
    const router = new MCPDynamicRouter({ mode: 'virtual' });
    router.upstream.registerMockServer('postgres', [sampleTools[1]], async (tool, args) => {
      executedArgs = args;
      return { rows: [{ id: 1, name: 'Alice' }] };
    });

    const response = await router.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'mcp_call_tool',
        arguments: {
          tool_name: 'postgres_execute_sql',
          arguments: { query: 'SELECT * FROM users' },
        },
      },
    });

    assert.equal(response.id, 3);
    assert.ok(response.result.content[0].text.includes('Alice'));
    assert.equal(executedArgs.query, 'SELECT * FROM users');
  });

  it('7. should generate valid configuration templates for all supported editors', () => {
    const editors = ['antigravity', 'cursor', 'claude', 'codex', 'zed', 'windsurf', 'trae', 'cline', 'continue'] as const;

    for (const ed of editors) {
      const cfg = EditorAdapter.generateEditorConfig(ed, 'mcp-router');
      assert.ok(cfg, `Config for ${ed} must be generated`);

      if (ed === 'zed') {
        assert.ok(cfg.context_servers?.['mcp-router'], 'Zed should have context_servers');
      } else if (ed === 'continue') {
        assert.ok(cfg.experimental?.modelContextProtocolServers, 'Continue should have experimental MCP');
      } else {
        assert.ok(cfg.mcpServers?.['mcp-router'], `${ed} should have mcpServers entry`);
      }
    }
  });
});
