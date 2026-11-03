/**
 * Upstream MCP Server Manager & Process Orchestrator
 * Spawns, initializes, and routes JSON-RPC calls to real or simulated MCP servers.
 */
import { ChildProcess } from 'node:child_process';
import { MCPServerConfig, MCPTool } from './types.js';
export interface UpstreamServerSession {
    config: MCPServerConfig;
    process?: ChildProcess;
    tools: MCPTool[];
    isReady: boolean;
    pendingRequests: Map<string | number, {
        resolve: (res: any) => void;
        reject: (err: any) => void;
        timeoutTimer: NodeJS.Timeout;
    }>;
}
export declare class UpstreamManager {
    private sessions;
    private mockServers;
    private nextRequestId;
    constructor();
    /**
     * Register a simulated/in-memory server (for fast testing, mocks, or internal tools).
     */
    registerMockServer(name: string, tools: MCPTool[], handler: (tool: string, args: any) => Promise<any>): void;
    /**
     * Start and initialize an external MCP server process via stdio.
     */
    startServer(config: MCPServerConfig, envOverride?: Record<string, string>): Promise<UpstreamServerSession>;
    /**
     * Send a JSON-RPC request to an upstream process with a timeout.
     */
    private sendRequest;
    /**
     * Send a JSON-RPC notification (fire-and-forget).
     */
    private sendNotification;
    /**
     * Call a tool on an upstream server.
     */
    callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any>;
    /**
     * Get all aggregated tools from all active upstream servers.
     */
    getAllTools(): MCPTool[];
    /**
     * Gracefully terminate all active upstream processes.
     */
    shutdownAll(): Promise<void>;
}
