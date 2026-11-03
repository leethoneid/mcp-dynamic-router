/**
 * Upstream MCP Server Manager & Process Orchestrator
 * Spawns, initializes, and routes JSON-RPC calls to real or simulated MCP servers.
 */
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { SecurityGuard } from './security.js';
export class UpstreamManager {
    sessions = new Map();
    mockServers = new Map();
    nextRequestId = 1;
    constructor() { }
    /**
     * Register a simulated/in-memory server (for fast testing, mocks, or internal tools).
     */
    registerMockServer(name, tools, handler) {
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
    async startServer(config, envOverride) {
        if (this.mockServers.has(config.name)) {
            return this.sessions.get(config.name);
        }
        if (config.disabled) {
            const session = {
                config,
                tools: [],
                isReady: false,
                pendingRequests: new Map(),
            };
            this.sessions.set(config.name, session);
            return session;
        }
        // H1 Fix: Use the explicitly scrubbed environment (passed via envOverride).
        // If not provided, fallback to scrubbing host environment on-the-fly.
        // Do NOT spread raw process.env here, as that re-injects sensitive keys!
        const env = envOverride || new SecurityGuard().scrubEnvironment(process.env, config.env || {});
        const isWindows = process.platform === 'win32';
        const isCmdScript = isWindows && (config.command.toLowerCase().endsWith('.cmd') ||
            config.command.toLowerCase().endsWith('.bat') ||
            ['npx', 'npm', 'pnpm', 'yarn', 'deno'].includes(config.command.toLowerCase()));
        const proc = spawn(config.command, config.args || [], {
            env,
            cwd: config.cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: isCmdScript,
        });
        // M6 Fix: Drain stderr continuously to prevent pipe buffer saturation (>64KB) from deadlocking child process
        if (proc.stderr) {
            proc.stderr.resume();
        }
        const session = {
            config,
            process: proc,
            tools: [],
            isReady: false,
            pendingRequests: new Map(),
        };
        this.sessions.set(config.name, session);
        // Setup line reader on stdout for JSON-RPC
        const rl = readline.createInterface({
            input: proc.stdout,
            terminal: false,
        });
        rl.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('{'))
                return;
            try {
                const response = JSON.parse(trimmed);
                if (response.id !== undefined && session.pendingRequests.has(response.id)) {
                    const { resolve, reject, timeoutTimer } = session.pendingRequests.get(response.id);
                    clearTimeout(timeoutTimer);
                    session.pendingRequests.delete(response.id);
                    if (response.error) {
                        reject(new Error(response.error.message || 'JSON-RPC Error'));
                    }
                    else {
                        resolve(response.result);
                    }
                }
            }
            catch (e) {
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
            const rawTools = toolsResult?.tools || [];
            session.tools = rawTools.map((t) => ({
                ...t,
                _server: config.name,
                _category: config.category || config.name,
            }));
            session.isReady = true;
        }
        catch (e) {
            console.warn(`[mcp-router] Failed to initialize '${config.name}':`, e.message);
            session.isReady = false;
        }
        return session;
    }
    /**
     * Send a JSON-RPC request to an upstream process with a timeout.
     */
    sendRequest(session, method, params, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            if (!session.process || !session.process.stdin?.writable) {
                return reject(new Error(`Server process for '${session.config.name}' is not running.`));
            }
            const id = this.nextRequestId++;
            const req = {
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
    sendNotification(session, method, params) {
        if (!session.process || !session.process.stdin?.writable)
            return;
        const notif = { jsonrpc: '2.0', method, params };
        session.process.stdin.write(JSON.stringify(notif) + '\n');
    }
    /**
     * Call a tool on an upstream server.
     */
    async callTool(serverName, toolName, args) {
        // 1. Check Mock Servers
        if (this.mockServers.has(serverName)) {
            const mock = this.mockServers.get(serverName);
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
    getAllTools() {
        const all = [];
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
    async shutdownAll() {
        for (const [name, session] of this.sessions.entries()) {
            for (const [id, req] of session.pendingRequests.entries()) {
                clearTimeout(req.timeoutTimer);
                req.reject(new Error(`Server '${name}' is shutting down.`));
            }
            session.pendingRequests.clear();
            if (session.process) {
                try {
                    session.process.kill();
                }
                catch (e) { }
            }
        }
        this.sessions.clear();
        this.mockServers.clear();
    }
}
