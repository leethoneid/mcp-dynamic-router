/**
 * Deep Security Audit & Execution Guard
 * Mitigates MCPoison (CVE-2025-54136), CurXecute (CVE-2025-54135), and environment leakage.
 */
import { SecurityPolicy, MCPServerConfig, MCPTool, AuditReport } from './types.js';
export declare class SecurityGuard {
    private policy;
    constructor(policy?: Partial<SecurityPolicy>);
    /**
     * Sanitizes environment variables passed to upstream MCP servers:
     * - Preserves user's explicit server-level configured variables (so tools don't break).
     * - Prevents leaking unrelated host system environment secrets (process.env) to untrusted upstream servers.
     */
    scrubEnvironment(hostEnv: Record<string, string | undefined>, explicitServerEnv?: Record<string, string>): Record<string, string>;
    /**
     * Validates tool execution request before dispatching to upstream server.
     * Throws Error if validation fails.
     */
    validateToolExecution(toolName: string, args: Record<string, any>, serverConfig?: MCPServerConfig): void;
    /**
     * Recursively scans object properties for path traversal or malicious injection patterns.
     * L3 Fix: Command chaining only flags execution tools so normal markdown or query text is not blocked.
     * Path checking includes bare '..', normalized traversal, and Windows/Unix sensitive system paths.
     */
    private sanitizeObject;
    /**
     * Comprehensive security audit on connected servers and exposed tools.
     */
    auditConfiguration(servers: Record<string, MCPServerConfig>, tools?: MCPTool[]): AuditReport;
}
