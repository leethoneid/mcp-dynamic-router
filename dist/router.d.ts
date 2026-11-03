/**
 * MCP Dynamic Router - Core Engine
 * Standard Model Context Protocol JSON-RPC Proxy with Dynamic RAG & Virtual Tooling.
 */
import { MCPRouterConfig, JSONRPCRequest, JSONRPCResponse, RoutingMode } from './types.js';
import { SecurityGuard } from './security.js';
import { UpstreamManager } from './upstream.js';
export interface RouterMetrics {
    totalRequests: number;
    toolsListCalls: number;
    toolsExecCalls: number;
    averageLatencyMs: number;
    totalTokensSaved: number;
    lastActiveQuery?: string;
}
export declare class MCPDynamicRouter {
    config: MCPRouterConfig;
    upstream: UpstreamManager;
    security: SecurityGuard;
    private activeQuery;
    private metrics;
    private latencyHistory;
    constructor(config?: Partial<MCPRouterConfig>);
    /**
     * Initializes all configured upstream servers.
     */
    init(): Promise<void>;
    /**
     * Sets the active task context for dynamic RAG routing.
     */
    setActiveQuery(query: string): void;
    /**
     * Set dynamic routing mode (virtual, dynamic, compressed, passthrough).
     */
    setMode(mode: RoutingMode): void;
    /**
     * Dispatches an incoming JSON-RPC request and returns a JSON-RPC response.
     */
    handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse>;
    /**
     * Handle MCP initialize handshake.
     */
    private handleInitialize;
    /**
     * Handle tools/list based on current routing mode.
     */
    private handleToolsList;
    /**
     * Handle tools/call execution.
     */
    private handleToolsCall;
    /**
     * Virtual Hub meta-tools definition (only 2 tools, ~450 tokens total).
     */
    private getMetaTools;
    /**
     * Query switcher tool for dynamic mode.
     */
    private getQuerySwitcherTool;
    private recordLatency;
    getMetrics(): RouterMetrics & {
        p50LatencyMs: number;
        p99LatencyMs: number;
    };
}
