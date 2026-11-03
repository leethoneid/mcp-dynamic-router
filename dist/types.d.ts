/**
 * MCP Dynamic Router & Context Trimmer - Type Definitions
 * Universal compatibility for Antigravity, Cursor, Claude Code, Codex, Zed/Zcode, Windsurf, Trae, etc.
 */
export type EditorType = 'antigravity' | 'cursor' | 'claude' | 'codex' | 'zed' | 'windsurf' | 'trae' | 'cline' | 'continue' | 'generic';
export type RoutingMode = 'virtual' | 'dynamic' | 'compressed' | 'passthrough';
export interface JSONRPCRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, any>;
}
export interface JSONRPCResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}
export interface JSONRPCNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, any>;
}
export interface MCPToolProperty {
    type?: string;
    description?: string;
    enum?: string[];
    items?: MCPToolProperty;
    properties?: Record<string, MCPToolProperty>;
    required?: string[];
    default?: any;
    [key: string]: any;
}
export interface MCPToolInputSchema {
    type: 'object';
    properties?: Record<string, MCPToolProperty>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: any;
}
export interface MCPTool {
    name: string;
    description?: string;
    inputSchema: MCPToolInputSchema;
    /** Internal metadata added by the router */
    _server?: string;
    _category?: string;
    _rawTokens?: number;
    _compressedTokens?: number;
}
export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    disabled?: boolean;
    category?: string;
    security?: {
        allowTools?: string[];
        denyTools?: string[];
        stripEnv?: boolean;
    };
}
export interface SecurityPolicy {
    enableStrictSanitization: boolean;
    blockPathTraversal: boolean;
    blockCommandChaining: boolean;
    scrubSensitiveEnv: boolean;
    sensitiveEnvPatterns: string[];
    toolAllowlist?: string[];
    toolDenylist?: string[];
    maxPayloadBytes: number;
}
export interface MCPRouterConfig {
    version: string;
    mode: RoutingMode;
    topK: number;
    editor?: EditorType;
    port?: number;
    security: SecurityPolicy;
    servers: Record<string, MCPServerConfig>;
    categories?: Record<string, string[]>;
}
export interface CompressionStats {
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savingsPercentage: number;
    originalToolsCount: number;
    exposedToolsCount: number;
}
export interface AuditIssue {
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    serverName: string;
    toolName?: string;
    rule: string;
    description: string;
    recommendation: string;
}
export interface AuditReport {
    timestamp: string;
    totalServers: number;
    totalTools: number;
    issues: AuditIssue[];
    passed: boolean;
    score: number;
}
