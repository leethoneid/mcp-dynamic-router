#!/usr/bin/env node
/**
 * MCP Dynamic Router - Command Line Interface
 */
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { MCPDynamicRouter } from './router.js';
import { EditorAdapter } from './editor-adapter.js';
import { SecurityGuard } from './security.js';
import { assertCommercialLicense, getMachineFingerprint } from './commercial/index.js';
import { createGatewayServer } from './server.js';
const program = new Command();
program
    .name('mcp-router')
    .description('Universal MCP Dynamic Router & Context Trimmer for Antigravity, Cursor, Claude Code, Codex, Zed, etc.')
    .version('1.0.0');
/**
 * Helper to load or create default router configuration.
 */
function loadConfig(configPath) {
    const resolved = configPath
        ? path.resolve(configPath)
        : path.resolve(process.cwd(), 'mcp-router.json');
    if (fs.existsSync(resolved)) {
        try {
            const content = fs.readFileSync(resolved, 'utf-8');
            return JSON.parse(content);
        }
        catch (e) {
            console.error(`[mcp-router] Error loading config from ${resolved}:`, e.message);
        }
    }
    // Fallback default config
    return {
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
    };
}
/**
 * SERVE COMMAND: Starts the MCP JSON-RPC Stdio Server
 */
program
    .command('serve')
    .description('Run standard stdio MCP proxy server')
    .option('-c, --config <path>', 'Path to mcp-router.json')
    .option('-m, --mode <mode>', 'Routing mode: virtual | dynamic | compressed | passthrough')
    .action(async (options) => {
    const config = loadConfig(options.config);
    if (options.mode) {
        config.mode = options.mode;
    }
    const router = new MCPDynamicRouter(config);
    await router.init();
    // Log diagnostic to stderr so stdout is 100% clean for JSON-RPC
    console.error(`[mcp-router] Server started in [${config.mode.toUpperCase()}] mode.`);
    console.error(`[mcp-router] Upstream servers active: ${Object.keys(config.servers).length}`);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{'))
            return;
        try {
            const req = JSON.parse(trimmed);
            const res = await router.handleRequest(req);
            process.stdout.write(JSON.stringify(res) + '\n');
        }
        catch (err) {
            const errorRes = {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: `Parse error: ${err.message}` },
            };
            process.stdout.write(JSON.stringify(errorRes) + '\n');
        }
    });
    process.on('SIGINT', async () => {
        console.error('[mcp-router] Shutting down...');
        await router.upstream.shutdownAll();
        process.exit(0);
    });
});
/**
 * INIT COMMAND: Create a starter configuration file
 */
program
    .command('init')
    .description('Initialize a new mcp-router.json config file')
    .option('-p, --path <path>', 'Output file path', 'mcp-router.json')
    .action((options) => {
    const targetPath = path.resolve(options.path);
    if (fs.existsSync(targetPath)) {
        console.log(`Config file already exists at ${targetPath}`);
        return;
    }
    const template = {
        version: '1.0.0',
        mode: 'virtual',
        topK: 5,
        security: {
            enableStrictSanitization: true,
            blockPathTraversal: true,
            blockCommandChaining: true,
            scrubSensitiveEnv: true,
            sensitiveEnvPatterns: ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PRIVATE_KEY'],
            maxPayloadBytes: 10485760,
            enforceConfigChecksum: true,
        },
        servers: {
            github: {
                name: 'github',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
                category: 'git',
            },
            filesystem: {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
                category: 'filesystem',
            },
        },
    };
    fs.writeFileSync(targetPath, JSON.stringify(template, null, 2), 'utf-8');
    console.log(`[mcp-router] Initialized starter configuration at ${targetPath}`);
});
/**
 * IMPORT COMMAND: Import existing servers from Cursor, Antigravity, Claude Code, Zed, etc.
 */
program
    .command('import')
    .description('Import existing MCP servers from installed AI editor configurations')
    .option('-e, --editor <editor>', 'Source editor: antigravity, cursor, claude, codex, zed, windsurf, trae, cline')
    .option('-f, --file <path>', 'Custom configuration file path')
    .option('-o, --output <path>', 'Output router config path', 'mcp-router.json')
    .action((options) => {
    const editor = (options.editor || 'cursor');
    console.log(`[mcp-router] Scanning configurations for editor: ${editor}...`);
    const imported = EditorAdapter.importServersFromEditor(editor, options.file);
    const count = Object.keys(imported).length;
    if (count === 0) {
        console.log(`[mcp-router] No existing MCP servers found for ${editor}.`);
        return;
    }
    console.log(`[mcp-router] Successfully discovered ${count} upstream servers:`);
    for (const name of Object.keys(imported)) {
        console.log(`  - ${name} (${imported[name].command} ${(imported[name].args || []).join(' ')})`);
    }
    const existingConfig = loadConfig(options.output);
    existingConfig.servers = {
        ...existingConfig.servers,
        ...imported,
    };
    fs.writeFileSync(path.resolve(options.output), JSON.stringify(existingConfig, null, 2), 'utf-8');
    console.log(`[mcp-router] Updated ${options.output} with ${count} imported servers.`);
});
/**
 * AUDIT COMMAND: Run deep security check on connected servers
 */
program
    .command('audit')
    .description('Perform deep security audit on all configured servers and tools (Mitigate MCPoison/CurXecute)')
    .option('-c, --config <path>', 'Path to mcp-router.json')
    .action((options) => {
    const config = loadConfig(options.config);
    const guard = new SecurityGuard(config.security);
    const report = guard.auditConfiguration(config.servers);
    console.log('\n======================================================');
    console.log('       MCP SECURITY AUDIT & INTEGRITY REPORT          ');
    console.log('======================================================');
    console.log(`Timestamp:      ${report.timestamp}`);
    console.log(`Total Servers:  ${report.totalServers}`);
    console.log(`Total Tools:    ${report.totalTools}`);
    console.log(`Health Score:   ${report.score} / 100  [${report.passed ? 'PASSED' : 'NEEDS ATTENTION'}]`);
    console.log('------------------------------------------------------');
    if (report.issues.length === 0) {
        console.log('No security vulnerabilities or configuration risks detected.');
    }
    else {
        console.log(`Found ${report.issues.length} potential issue(s):`);
        for (const issue of report.issues) {
            console.log(`\n[${issue.severity}] ${issue.rule} (${issue.serverName}${issue.toolName ? ' -> ' + issue.toolName : ''})`);
            console.log(`  Description:    ${issue.description}`);
            console.log(`  Recommendation: ${issue.recommendation}`);
        }
    }
    console.log('======================================================\n');
});
/**
 * DOCTOR COMMAND: Inspect environment and installed editors
 */
program
    .command('doctor')
    .description('Diagnose environment and detect supported AI editor installations')
    .action(() => {
    console.log('\n[mcp-router] Diagnosing AI Editor Environments:');
    const detections = EditorAdapter.detectInstalledEditors();
    for (const d of detections) {
        const status = d.exists ? '[DETECTED]' : '[NOT FOUND]';
        console.log(`  ${status.padEnd(12)} ${d.editor.displayName} (${d.editor.type})`);
        if (d.exists) {
            console.log(`               Path: ${d.detectedPath}`);
        }
    }
    console.log('\n[mcp-router] System is ready to route tools for detected editors.\n');
});
/**
 * ACTIVATE COMMAND: Activate commercial license key or offline token
 */
program
    .command('activate')
    .description('Activate and bind commercial license key or offline Ed25519 token to this machine')
    .argument('<licenseKey>', 'Commercial License Key or MCPLIC.* token')
    .action(async (key) => {
    try {
        console.log('[mcp-router] Verifying commercial license...');
        const res = await assertCommercialLicense({ licenseKey: key });
        console.log('\n======================================================');
        console.log('       COMMERCIAL LICENSE ACTIVATION SUCCESSFUL       ');
        console.log('======================================================');
        console.log(`Buyer:               ${res.buyerId}`);
        console.log(`Tier:                ${res.tier || 'SOLO_PRO'}`);
        console.log(`Machine Fingerprint: ${getMachineFingerprint()}`);
        console.log('Hardware binding saved to ~/.mcp-router/license-cache.json.');
        console.log('You are now authorized to use all Commercial Pro features offline.');
        console.log('======================================================\n');
    }
    catch (err) {
        console.error(err?.message || err);
        process.exit(1);
    }
});
/**
 * GATEWAY COMMAND: Run HTTP Microservice Gateway
 */
program
    .command('gateway')
    .description('Run production-hardened HTTP Microservice Gateway for MCP')
    .option('-p, --port <port>', 'Listening port', '3008')
    .option('-h, --host <host>', 'Listening host (default 127.0.0.1)', '127.0.0.1')
    .option('-c, --config <path>', 'Path to mcp-router.json')
    .option('-k, --api-key <key>', 'Require Bearer/X-API-Key authentication')
    .action(async (options) => {
    const config = loadConfig(options.config);
    const port = parseInt(options.port, 10);
    // Strict adherence to AGENTS.md 2.4: default host is 127.0.0.1
    const host = options.host || process.env.HOST || '127.0.0.1';
    const server = createGatewayServer({
        apiKey: options.apiKey || process.env.API_KEY,
        config
    });
    server.listen(port, host, () => {
        console.error(`[mcp-router] HTTP Gateway listening securely on http://${host}:${port}`);
        console.error(`[mcp-router] Direct POST MCP JSON-RPC to: http://${host}:${port}/mcp`);
    });
});
program.parse(process.argv);
