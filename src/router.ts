/**
 * MCP Dynamic Router - Core Engine
 * Standard Model Context Protocol JSON-RPC Proxy with Dynamic RAG & Virtual Tooling.
 */

import {
  MCPRouterConfig,
  MCPTool,
  JSONRPCRequest,
  JSONRPCResponse,
  RoutingMode,
  CompressionStats,
} from './types.js';
import { SchemaCompressor } from './compressor.js';
import { ToolMatcher } from './matcher.js';
import { SecurityGuard } from './security.js';
import { UpstreamManager } from './upstream.js';
import { LicenseValidator } from './license.js';

export interface RouterMetrics {
  totalRequests: number;
  toolsListCalls: number;
  toolsExecCalls: number;
  averageLatencyMs: number;
  totalTokensSaved: number;
  lastActiveQuery?: string;
}

export class MCPDynamicRouter {
  public config: MCPRouterConfig;
  public upstream: UpstreamManager;
  public security: SecurityGuard;
  private activeQuery: string = '';
  private metrics: RouterMetrics = {
    totalRequests: 0,
    toolsListCalls: 0,
    toolsExecCalls: 0,
    averageLatencyMs: 0,
    totalTokensSaved: 0,
  };
  private latencyHistory: number[] = [];

  constructor(config?: Partial<MCPRouterConfig>) {
    this.config = {
      version: '1.0.0',
      mode: 'virtual',
      topK: 5,
      security: {
        enableStrictSanitization: true,
        blockPathTraversal: true,
        blockCommandChaining: true,
        scrubSensitiveEnv: true,
        sensitiveEnvPatterns: ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PRIVATE_KEY'],
        maxPayloadBytes: 10 * 1024 * 1024,
        enforceConfigChecksum: true,
      },
      servers: {},
      ...config,
    };

    this.upstream = new UpstreamManager();
    this.security = new SecurityGuard(this.config.security);
  }

  /**
   * Initializes all configured upstream servers.
   */
  async init(): Promise<void> {
    for (const [name, serverCfg] of Object.entries(this.config.servers)) {
      if (!serverCfg.disabled) {
        const scrubbedEnv = this.security.scrubEnvironment(process.env as any, serverCfg.env || {});
        await this.upstream.startServer(serverCfg, scrubbedEnv);
      }
    }
  }

  /**
   * Sets the active task context for dynamic RAG routing.
   */
  setActiveQuery(query: string): void {
    this.activeQuery = query;
    this.metrics.lastActiveQuery = query;
  }

  /**
   * Set dynamic routing mode (virtual, dynamic, compressed, passthrough).
   */
  setMode(mode: RoutingMode): void {
    this.config.mode = mode;
  }

  /**
   * Dispatches an incoming JSON-RPC request and returns a JSON-RPC response.
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      let result: any;

      switch (request.method) {
        case 'initialize':
          result = this.handleInitialize(request.params);
          break;

        case 'notifications/initialized':
          result = {};
          break;

        case 'tools/list':
          this.metrics.toolsListCalls++;
          result = await this.handleToolsList();
          break;

        case 'tools/call':
          this.metrics.toolsExecCalls++;
          result = await this.handleToolsCall(request.params);
          break;

        case 'router/metrics':
          result = this.getMetrics();
          break;

        case 'router/audit':
          result = this.security.auditConfiguration(this.config.servers, this.upstream.getAllTools());
          break;

        case 'router/switch_mode':
          if (request.params?.mode) {
            this.setMode(request.params.mode);
            result = { mode: this.config.mode, message: `Switched to ${this.config.mode} mode` };
          } else {
            throw new Error('Missing mode parameter');
          }
          break;

        case 'router/set_query':
          if (request.params?.query !== undefined) {
            this.setActiveQuery(request.params.query);
            result = { query: this.activeQuery, message: `Active query updated` };
          }
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }

      const elapsed = Date.now() - startTime;
      this.recordLatency(elapsed);

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      this.recordLatency(elapsed);

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: err.message || 'Internal Router Error',
        },
      };
    }
  }

  /**
   * Handle MCP initialize handshake.
   */
  private handleInitialize(params: any): any {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
      serverInfo: {
        name: 'mcp-dynamic-router',
        version: this.config.version,
        description: `Universal MCP Router [Mode: ${this.config.mode.toUpperCase()}]`,
      },
    };
  }

  /**
   * Handle tools/list based on current routing mode.
   */
  private async handleToolsList(): Promise<{ tools: MCPTool[]; _stats?: CompressionStats }> {
    const rawTools = this.upstream.getAllTools();

    // Mode 1: Virtual Hub Mode (Only 2 meta-tools, 99% saving)
    if (this.config.mode === 'virtual') {
      const metaTools = this.getMetaTools();
      const stats = SchemaCompressor.calculateStats(rawTools, metaTools);
      this.metrics.totalTokensSaved += stats.savedTokens;
      return {
        tools: metaTools,
        _stats: stats,
      };
    }

    // Mode 2: Dynamic RAG Mode (Top-K relevant tools matching active query)
    if (this.config.mode === 'dynamic') {
      const ranked = ToolMatcher.rankTools(this.activeQuery, rawTools, this.config.topK);
      const selectedTools = ranked.map((r) => SchemaCompressor.compressTool(r.tool));

      // Append meta switcher tool so agent can switch context on the fly
      selectedTools.push(this.getQuerySwitcherTool());

      const stats = SchemaCompressor.calculateStats(rawTools, selectedTools);
      this.metrics.totalTokensSaved += stats.savedTokens;
      return {
        tools: selectedTools,
        _stats: stats,
      };
    }

    // Mode 3: Compressed Mode (All tools with pruned JSON Schemas)
    if (this.config.mode === 'compressed') {
      const compressedTools = rawTools.map((t) => SchemaCompressor.compressTool(t));
      const stats = SchemaCompressor.calculateStats(rawTools, compressedTools);
      this.metrics.totalTokensSaved += stats.savedTokens;
      return {
        tools: compressedTools,
        _stats: stats,
      };
    }

    // Mode 4: Passthrough (Raw tools unmodified)
    return { tools: rawTools };
  }

  /**
   * Handle tools/call execution.
   */
  private async handleToolsCall(params: any): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { name, arguments: args = {} } = params || {};

    if (!name) {
      throw new Error('Tool execution error: Missing tool name.');
    }

    // A. Meta Tool: mcp_search_tools
    if (name === 'mcp_search_tools') {
      const query = args.query || '';
      const category = args.category;
      const topK = args.top_k || 5;

      let pool = this.upstream.getAllTools();
      if (category) {
        pool = ToolMatcher.filterByCategory(category, pool);
      }

      const ranked = ToolMatcher.rankTools(query, pool, topK);
      const summary = ranked.map((r) => ({
        tool: r.tool.name,
        server: r.tool._server,
        category: r.tool._category,
        description: r.tool.description,
        score: Number(r.score.toFixed(2)),
        matchedKeywords: r.matchedKeywords,
        inputSchema: SchemaCompressor.compressInputSchema(r.tool.inputSchema),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              totalMatched: ranked.length,
              query,
              tools: summary,
              usageHint: "To execute any of these tools, invoke 'mcp_call_tool' with tool_name and arguments.",
            }, null, 2),
          },
        ],
      };
    }

    // B. Meta Tool: mcp_call_tool
    if (name === 'mcp_call_tool') {
      const targetToolName = args.tool_name;
      const targetArgs = args.arguments || {};
      const targetServer = args.server;

      if (!targetToolName) {
        throw new Error("Missing required 'tool_name' in mcp_call_tool invocation.");
      }

      const allTools = this.upstream.getAllTools();
      const toolDef = allTools.find((t) =>
        t.name === targetToolName && (!targetServer || t._server === targetServer)
      );

      if (!toolDef) {
        throw new Error(`Tool '${targetToolName}' not found in any connected MCP server.`);
      }

      const serverName = toolDef._server || targetServer!;
      const serverConfig = this.config.servers[serverName];

      // Security check
      this.security.validateToolExecution(targetToolName, targetArgs, serverConfig);

      // Execute on upstream
      const execResult = await this.upstream.callTool(serverName, targetToolName, targetArgs);

      return {
        content: [
          {
            type: 'text',
            text: typeof execResult === 'string' ? execResult : JSON.stringify(execResult, null, 2),
          },
        ],
      };
    }

    // C. Meta Tool: mcp_switch_query
    if (name === 'mcp_switch_query') {
      const newQuery = args.query;
      this.setActiveQuery(newQuery);
      return {
        content: [
          {
            type: 'text',
            text: `Active task query updated to: '${newQuery}'. Call tools/list to refresh loaded tools.`,
          },
        ],
      };
    }

    // D. Direct Tool Call (in dynamic, compressed or passthrough modes)
    const allTools = this.upstream.getAllTools();
    const toolDef = allTools.find((t) => t.name === name);

    if (!toolDef) {
      throw new Error(`Tool '${name}' not recognized by router.`);
    }

    const serverName = toolDef._server!;
    const serverConfig = this.config.servers[serverName];

    // Security check
    this.security.validateToolExecution(name, args, serverConfig);

    // Call upstream
    const execResult = await this.upstream.callTool(serverName, name, args);

    return {
      content: [
        {
          type: 'text',
          text: typeof execResult === 'string' ? execResult : JSON.stringify(execResult, null, 2),
        },
      ],
    };
  }

  /**
   * Virtual Hub meta-tools definition (only 2 tools, ~450 tokens total).
   */
  private getMetaTools(): MCPTool[] {
    return [
      {
        name: 'mcp_search_tools',
        description: 'Semantic search for available MCP tools across all connected servers. Returns matching tools and schemas.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query describing the capability needed (e.g. "git commit", "postgres query").',
            },
            category: {
              type: 'string',
              description: 'Optional category filter (e.g. "git", "database", "filesystem", "web").',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of tools to return (default 5).',
            },
          },
          required: ['query'],
        },
        _server: 'router',
      },
      {
        name: 'mcp_call_tool',
        description: 'Universal execution proxy. Dispatches execution to the appropriate upstream MCP server.',
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: 'Exact name of the tool to invoke.',
            },
            arguments: {
              type: 'object',
              description: 'Parameters required by the tool.',
            },
            server: {
              type: 'string',
              description: 'Optional target server name if ambiguous.',
            },
          },
          required: ['tool_name', 'arguments'],
        },
        _server: 'router',
      },
    ];
  }

  /**
   * Query switcher tool for dynamic mode.
   */
  private getQuerySwitcherTool(): MCPTool {
    return {
      name: 'mcp_switch_query',
      description: 'Switch the active task intent to dynamically reload relevant MCP tools in dynamic mode.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'New task context or intent description.',
          },
        },
        required: ['query'],
      },
      _server: 'router',
    };
  }

  private recordLatency(ms: number): void {
    this.latencyHistory.push(ms);
    if (this.latencyHistory.length > 500) {
      this.latencyHistory.shift();
    }
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageLatencyMs = Number((sum / this.latencyHistory.length).toFixed(2));
  }

  getMetrics(): RouterMetrics & { p50LatencyMs: number; p99LatencyMs: number } {
    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1] || 0;

    return {
      ...this.metrics,
      p50LatencyMs: p50,
      p99LatencyMs: p99,
    };
  }
}
