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
     */
    private sanitizeObject;
    /**
     * Generates a deterministic SHA-256 hash for an MCP configuration file to prevent silent TOCTOU tampers.
     */
    static calculateConfigChecksum(config: any): string;
    /**
     * Comprehensive security audit on connected servers and exposed tools.
     */
    auditConfiguration(servers: Record<string, MCPServerConfig>, tools?: MCPTool[]): AuditReport;
}
