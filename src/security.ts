/**
 * Deep Security Audit & Execution Guard
 * Mitigates MCPoison (CVE-2025-54136), CurXecute (CVE-2025-54135), and environment leakage.
 */

import crypto from 'node:crypto';
import { SecurityPolicy, MCPServerConfig, MCPTool, AuditReport, AuditIssue } from './types.js';

export class SecurityGuard {
  private policy: SecurityPolicy;

  constructor(policy?: Partial<SecurityPolicy>) {
    this.policy = {
      enableStrictSanitization: true,
      blockPathTraversal: true,
      blockCommandChaining: true,
      scrubSensitiveEnv: true,
      sensitiveEnvPatterns: [
        'API_KEY',
        'SECRET',
        'TOKEN',
        'PASSWORD',
        'PRIVATE_KEY',
        'AWS_SECRET',
        'GITHUB_TOKEN',
        'CREDENTIAL',
        'ACCESS_KEY',
        'AUTH',
      ],
      maxPayloadBytes: 10 * 1024 * 1024, // 10MB
      enforceConfigChecksum: true,
      ...policy,
    };
  }

  /**
   * Sanitizes environment variables passed to upstream MCP servers:
   * - Preserves user's explicit server-level configured variables (so tools don't break).
   * - Prevents leaking unrelated host system environment secrets (process.env) to untrusted upstream servers.
   */
  scrubEnvironment(hostEnv: Record<string, string | undefined>, explicitServerEnv: Record<string, string> = {}): Record<string, string> {
    const safeEnv: Record<string, string> = {};

    // 1. Pass safe non-sensitive host system variables (like PATH, HOME, TEMP, LANG)
    if (this.policy.scrubSensitiveEnv) {
      for (const [key, value] of Object.entries(hostEnv)) {
        if (!value) continue;
        const isSensitive = this.policy.sensitiveEnvPatterns.some((pattern) =>
          key.toUpperCase().includes(pattern)
        );
        if (!isSensitive) {
          safeEnv[key] = value;
        }
      }
    } else {
      for (const [k, v] of Object.entries(hostEnv)) {
        if (v !== undefined) safeEnv[k] = v;
      }
    }

    // 2. Explicitly configured server environment variables provided by user are ALWAYS preserved
    // so legitimate tools (GitHub tokens, DB credentials) operate 100% normally.
    for (const [key, value] of Object.entries(explicitServerEnv)) {
      safeEnv[key] = value;
    }

    return safeEnv;
  }

  /**
   * Validates tool execution request before dispatching to upstream server.
   * Throws Error if validation fails.
   */
  validateToolExecution(toolName: string, args: Record<string, any>, serverConfig?: MCPServerConfig): void {
    // 1. Check Allowlist / Denylist
    if (serverConfig?.security?.denyTools?.includes(toolName)) {
      throw new Error(`Security Violation: Tool '${toolName}' is in the server denylist.`);
    }

    if (serverConfig?.security?.allowTools && serverConfig.security.allowTools.length > 0) {
      if (!serverConfig.security.allowTools.includes(toolName)) {
        throw new Error(`Security Violation: Tool '${toolName}' is not permitted by allowlist.`);
      }
    }

    if (this.policy.toolDenylist?.includes(toolName)) {
      throw new Error(`Security Violation: Tool '${toolName}' is globally denylisted.`);
    }

    // 2. Deep sanitize arguments
    if (this.policy.enableStrictSanitization && args && typeof args === 'object') {
      this.sanitizeObject(args);
    }
  }

  /**
   * Recursively scans object properties for path traversal or malicious injection patterns.
   */
  private sanitizeObject(obj: any): void {
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        // Path traversal check
        if (this.policy.blockPathTraversal) {
          if (val.includes('../') || val.includes('..\\') || val.startsWith('/etc/') || val.includes('~/.ssh')) {
            throw new Error(`Security Violation: Suspicious path traversal detected in argument '${key}': ${val}`);
          }
        }

        // Command chaining check in execution tools
        if (this.policy.blockCommandChaining) {
          const dangerousChaining = [
            /;\s*rm\s+-rf/i,
            /\|\s*curl\s+/i,
            /\|\s*bash/i,
            /;\s*cat\s+~?\//i,
            /`.*`/s,
            /\$\(.*\)/s,
            /&\s*powershell/i,
          ];
          for (const pattern of dangerousChaining) {
            if (pattern.test(val)) {
              throw new Error(`Security Violation: Dangerous command chaining / injection pattern detected in '${key}'.`);
            }
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        this.sanitizeObject(val);
      }
    }
  }

  /**
   * Generates a deterministic SHA-256 hash for an MCP configuration file to prevent silent TOCTOU tampers.
   */
  static calculateConfigChecksum(config: any): string {
    const serialized = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Comprehensive security audit on connected servers and exposed tools.
   */
  auditConfiguration(servers: Record<string, MCPServerConfig>, tools: MCPTool[] = []): AuditReport {
    const issues: AuditIssue[] = [];

    for (const [serverName, server] of Object.entries(servers)) {
      // Rule 1: Command integrity
      if (!server.command) {
        issues.push({
          severity: 'CRITICAL',
          serverName,
          rule: 'SEC-01-EMPTY-COMMAND',
          description: `Server '${serverName}' has no executable command specified.`,
          recommendation: 'Specify a valid command or binary path.',
        });
      }

      // Rule 2: Insecure shell wrappers
      if (['sh', 'bash', 'cmd.exe', 'powershell.exe', 'powershell'].includes(server.command.toLowerCase())) {
        issues.push({
          severity: 'HIGH',
          serverName,
          rule: 'SEC-02-SHELL-WRAPPER',
          description: `Server '${serverName}' is invoked directly via raw shell wrapper (${server.command}), exposing high injection risk.`,
          recommendation: 'Invoke binaries or node scripts directly without shell interpolation.',
        });
      }

      // Rule 3: Unrestricted sensitive environment variables
      if (server.env) {
        for (const [k, v] of Object.entries(server.env)) {
          if (this.policy.sensitiveEnvPatterns.some((p) => k.toUpperCase().includes(p)) && !v.startsWith('[PROTECTED')) {
            issues.push({
              severity: 'MEDIUM',
              serverName,
              rule: 'SEC-03-LEAKED-ENV',
              description: `Server '${serverName}' contains plain-text secret token in env key '${k}'.`,
              recommendation: 'Enable env scrubbing or pass credentials via secure credential vaults.',
            });
          }
        }
      }
    }

    // Rule 4: Audit tools for dangerous permissions
    for (const tool of tools) {
      const lowerName = tool.name.toLowerCase();
      const lowerDesc = (tool.description || '').toLowerCase();

      if (lowerName.includes('eval') || lowerName.includes('exec_command') || lowerName.includes('shell')) {
        issues.push({
          severity: 'HIGH',
          serverName: tool._server || 'unknown',
          toolName: tool.name,
          rule: 'SEC-04-ARBITRARY-CODE-EXEC',
          description: `Tool '${tool.name}' exposes arbitrary shell execution capabilities.`,
          recommendation: 'Add strict parameter validation or place behind user confirmation prompts.',
        });
      }

      if (lowerName.includes('delete') || lowerDesc.includes('drop database') || lowerDesc.includes('truncate')) {
        issues.push({
          severity: 'MEDIUM',
          serverName: tool._server || 'unknown',
          toolName: tool.name,
          rule: 'SEC-05-DESTRUCTIVE-OPERATION',
          description: `Tool '${tool.name}' allows destructive write/deletion operations.`,
          recommendation: 'Ensure workspace permissions and backups are active before calling.',
        });
      }
    }

    // Calculate health score (100 base)
    let penalty = 0;
    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') penalty += 35;
      else if (issue.severity === 'HIGH') penalty += 15;
      else if (issue.severity === 'MEDIUM') penalty += 5;
      else penalty += 2;
    }
    const score = Math.max(0, 100 - penalty);

    return {
      timestamp: new Date().toISOString(),
      totalServers: Object.keys(servers).length,
      totalTools: tools.length,
      issues,
      passed: score >= 80,
      score,
    };
  }
}
