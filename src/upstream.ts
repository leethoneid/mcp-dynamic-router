/**
 * Upstream MCP Server Manager & Process Orchestrator
 * Spawns, initializes, and routes JSON-RPC calls to real or simulated MCP servers.
 */

import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { MCPServerConfig, MCPTool, JSONRPCRequest, JSONRPCResponse } from './types.js';

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

export class UpstreamManager {
  private sessions: Map<string, UpstreamServerSession> = new Map();
  private mockServers: Map<string, { tools: MCPTool[]; handler: (tool: string, args: any) => Promise<any> }> = new Map();
  private nextRequestId = 1;

  constructor() {}

  /**
   * Register a simulated/in-memory server (for fast testing, mocks, or internal tools).
   */
  registerMockServer(name: string, tools: MCPTool[], handler: (tool: string, args: any) => Promise<any>): void {
    const taggedTools = tools.map((t) => ({
      ...t,
      _server: name,
      _category: t._category || name,
    }));
    this.mockServers.set(name, { tools: taggedTools, handler });
    this.sessions.set(name, {
      config: { name, command: 'mock' },
      tools: taggedTools,
      isReady: true,
      pendingRequests: new Map(),
    });
  }

  /**
   * Start and initialize an external MCP server process via stdio.
   */
  async startServer(config: MCPServerConfig, envOverride?: Record<string, string>): Promise<UpstreamServerSession> {
    if (this.mockServers.has(config.name)) {
      return this.sessions.get(config.name)!;
    }

    if (config.disabled) {
      const session: UpstreamServerSession = {
        config,
        tools: [],
        isReady: false,
        pendingRequests: new Map(),
      };
      this.sessions.set(config.name, session);
      return session;
    }

    const env = {
      ...process.env,
      ...(config.env || {}),
      ...(envOverride || {}),
    };

    const isWindows = process.platform === 'win32';
    const isCmdScript = isWindows && (
      config.command.toLowerCase().endsWith('.cmd') ||
      config.command.toLowerCase().endsWith('.bat') ||
      ['npx', 'npm', 'pnpm', 'yarn', 'deno'].includes(config.command.toLowerCase())
    );

    const proc = spawn(config.command, config.args || [], {
      env,
      cwd: config.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isCmdScript,
    });

    const session: UpstreamServerSession = {
      config,
      process: proc,
      tools: [],
      isReady: false,
      pendingRequests: new Map(),
    };
    this.sessions.set(config.name, session);

    // Setup line reader on stdout for JSON-RPC
    const rl = readline.createInterface({
      input: proc.stdout!,
      terminal: false,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return;
      try {
        const response: JSONRPCResponse = JSON.parse(trimmed);
        if (response.id !== undefined && session.pendingRequests.has(response.id)) {
          const { resolve, reject, timeoutTimer } = session.pendingRequests.get(response.id)!;
          clearTimeout(timeoutTimer);
          session.pendingRequests.delete(response.id);
          if (response.error) {
            reject(new Error(response.error.message || 'JSON-RPC Error'));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        // Ignore unparseable log lines
      }
    });

    proc.on('error', (err) => {
      console.error(`[mcp-router] Upstream server '${config.name}' error:`, err.message);
    });

    // 1. Send MCP Initialize Handshake
    try {
      await this.sendRequest(session, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'mcp-dynamic-router', version: '1.0.0' },
      }, 5000);

      // Send initialized notification
      this.sendNotification(session, 'notifications/initialized', {});

      // 2. Fetch tools list
      const toolsResult = await this.sendRequest(session, 'tools/list', {}, 5000);
      const rawTools: MCPTool[] = toolsResult?.tools || [];

      session.tools = rawTools.map((t) => ({
        ...t,
        _server: config.name,
        _category: config.category || config.name,
      }));
      session.isReady = true;
    } catch (e: any) {
      console.warn(`[mcp-router] Failed to initialize '${config.name}':`, e.message);
      session.isReady = false;
    }

    return session;
  }

  /**
   * Send a JSON-RPC request to an upstream process with a timeout.
   */
  private sendRequest(session: UpstreamServerSession, method: string, params: any, timeoutMs: number = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!session.process || !session.process.stdin?.writable) {
        return reject(new Error(`Server process for '${session.config.name}' is not running.`));
      }

      const id = this.nextRequestId++;
      const req: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeoutTimer = setTimeout(() => {
        session.pendingRequests.delete(id);
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for '${session.config.name}' method '${method}'`));
      }, timeoutMs);

      session.pendingRequests.set(id, { resolve, reject, timeoutTimer });
      session.process.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  /**
   * Send a JSON-RPC notification (fire-and-forget).
   */
  private sendNotification(session: UpstreamServerSession, method: string, params: any): void {
    if (!session.process || !session.process.stdin?.writable) return;
    const notif = { jsonrpc: '2.0', method, params };
    session.process.stdin.write(JSON.stringify(notif) + '\n');
  }

  /**
   * Call a tool on an upstream server.
   */
  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    // 1. Check Mock Servers
    if (this.mockServers.has(serverName)) {
      const mock = this.mockServers.get(serverName)!;
      return await mock.handler(toolName, args);
    }

    // 2. Check Process Servers
    const session = this.sessions.get(serverName);
    if (!session) {
      throw new Error(`Upstream server '${serverName}' is not registered.`);
    }

    if (!session.isReady) {
      throw new Error(`Upstream server '${serverName}' is not ready.`);
    }

    return await this.sendRequest(session, 'tools/call', {
      name: toolName,
      arguments: args,
    });
  }

  /**
   * Get all aggregated tools from all active upstream servers.
   */
  getAllTools(): MCPTool[] {
    const all: MCPTool[] = [];
    for (const session of this.sessions.values()) {
      if (session.isReady && session.tools) {
        all.push(...session.tools);
      }
    }
    return all;
  }

  /**
   * Gracefully terminate all active upstream processes.
   */
  async shutdownAll(): Promise<void> {
    for (const [name, session] of this.sessions.entries()) {
      for (const [id, req] of session.pendingRequests.entries()) {
        clearTimeout(req.timeoutTimer);
        req.reject(new Error(`Server '${name}' is shutting down.`));
      }
      session.pendingRequests.clear();

      if (session.process) {
        try {
          session.process.kill();
        } catch (e) {}
      }
    }
    this.sessions.clear();
    this.mockServers.clear();
  }
}
