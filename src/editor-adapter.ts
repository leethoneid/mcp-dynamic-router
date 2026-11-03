/**
 * Universal AI Editor Adapter & Configuration Engine
 * Seamlessly integrates with Google Antigravity, Cursor, Claude Code, Codex, Zed/Zcode, Windsurf, Trae, Cline & Continue.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EditorType, MCPServerConfig } from './types.js';

export interface EditorInfo {
  type: EditorType;
  displayName: string;
  defaultConfigPath: string;
  configFormat: 'standard-mcp' | 'zed-context-servers' | 'continue-experimental';
  docsUrl: string;
}

export class EditorAdapter {
  private static readonly HOME = os.homedir();
  private static readonly APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  /**
   * Registry of all supported AI editors globally and domestically.
   */
  static readonly EDITORS: Record<EditorType, EditorInfo> = {
    antigravity: {
      type: 'antigravity',
      displayName: 'Google Antigravity',
      defaultConfigPath: path.join(this.HOME, '.gemini', 'antigravity', 'mcp_settings.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://antigravity.google',
    },
    cursor: {
      type: 'cursor',
      displayName: 'Cursor',
      defaultConfigPath: path.join(this.HOME, '.cursor', 'mcp.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://docs.cursor.com/context/model-context-protocol',
    },
    claude: {
      type: 'claude',
      displayName: 'Claude Code / Desktop',
      defaultConfigPath: process.platform === 'win32'
        ? path.join(this.APPDATA, 'Claude', 'claude_desktop_config.json')
        : process.platform === 'darwin'
        ? path.join(this.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : path.join(this.HOME, '.config', 'Claude', 'claude_desktop_config.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://docs.anthropic.com/claude/docs/mcp',
    },
    codex: {
      type: 'codex',
      displayName: 'OpenAI Codex / CLI',
      defaultConfigPath: path.join(this.HOME, '.codex', 'mcp.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://platform.openai.com/docs',
    },
    zed: {
      type: 'zed',
      displayName: 'Zed / Zcode',
      defaultConfigPath: process.platform === 'win32'
        ? path.join(this.APPDATA, 'Zed', 'settings.json')
        : path.join(this.HOME, '.config', 'zed', 'settings.json'),
      configFormat: 'zed-context-servers',
      docsUrl: 'https://zed.dev/docs/assistant/model-context-protocol',
    },
    windsurf: {
      type: 'windsurf',
      displayName: 'Windsurf (Codeium)',
      defaultConfigPath: path.join(this.HOME, '.codeium', 'windsurf', 'mcp_config.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://codeium.com/windsurf',
    },
    trae: {
      type: 'trae',
      displayName: 'Trae (ByteDance)',
      defaultConfigPath: path.join(this.HOME, '.trae', 'mcp.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://trae.ai',
    },
    cline: {
      type: 'cline',
      displayName: 'Roo Code / Cline',
      defaultConfigPath: path.join(this.HOME, '.cline', 'mcp_settings.json'),
      configFormat: 'standard-mcp',
      docsUrl: 'https://github.com/cline/cline',
    },
    continue: {
      type: 'continue',
      displayName: 'Continue.dev',
      defaultConfigPath: path.join(this.HOME, '.continue', 'config.json'),
      configFormat: 'continue-experimental',
      docsUrl: 'https://docs.continue.dev',
    },
    generic: {
      type: 'generic',
      displayName: 'Generic Stdio MCP Client',
      defaultConfigPath: 'mcp.json',
      configFormat: 'standard-mcp',
      docsUrl: 'https://modelcontextprotocol.io',
    },
  };

  /**
   * Generates the configuration snippet to register mcp-dynamic-router into the specified editor.
   */
  static generateEditorConfig(
    editor: EditorType,
    routerBinaryPath: string = 'mcp-router',
    configPath?: string
  ): any {
    const info = this.EDITORS[editor] || this.EDITORS.generic;
    const args = ['serve'];
    if (configPath) {
      args.push('--config', configPath);
    }

    switch (info.configFormat) {
      case 'zed-context-servers':
        return {
          context_servers: {
            'mcp-router': {
              command: {
                path: routerBinaryPath,
                args,
              },
            },
          },
        };

      case 'continue-experimental':
        return {
          experimental: {
            modelContextProtocolServers: [
              {
                transport: {
                  type: 'stdio',
                  command: routerBinaryPath,
                  args,
                },
              },
            ],
          },
        };

      case 'standard-mcp':
      default:
        return {
          mcpServers: {
            'mcp-router': {
              command: routerBinaryPath,
              args,
            },
          },
        };
    }
  }

  /**
   * Auto-detect which AI editors are installed on the local machine.
   */
  static detectInstalledEditors(): Array<{ editor: EditorInfo; detectedPath?: string; exists: boolean }> {
    const results = [];
    for (const info of Object.values(this.EDITORS)) {
      if (info.type === 'generic') continue;
      const exists = fs.existsSync(info.defaultConfigPath) || fs.existsSync(path.dirname(info.defaultConfigPath));
      results.push({
        editor: info,
        detectedPath: info.defaultConfigPath,
        exists,
      });
    }
    return results;
  }

  /**
   * Scans and imports upstream server configurations from an existing editor config file.
   */
  static importServersFromEditor(editor: EditorType, customFilePath?: string): Record<string, MCPServerConfig> {
    const targetPath = customFilePath || this.EDITORS[editor]?.defaultConfigPath;
    if (!targetPath || !fs.existsSync(targetPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(content);
      const imported: Record<string, MCPServerConfig> = {};

      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        for (const [name, cfg] of Object.entries(parsed.mcpServers as Record<string, any>)) {
          if (name === 'mcp-router') continue; // Skip self
          imported[name] = {
            name,
            command: cfg.command,
            args: cfg.args || [],
            env: cfg.env || {},
          };
        }
      } else if (parsed.context_servers && typeof parsed.context_servers === 'object') {
        for (const [name, cfg] of Object.entries(parsed.context_servers as Record<string, any>)) {
          if (name === 'mcp-router') continue;
          imported[name] = {
            name,
            command: cfg.command?.path || cfg.command,
            args: cfg.command?.args || cfg.args || [],
            env: cfg.env || {},
          };
        }
      }

      return imported;
    } catch (e: any) {
      console.warn(`[mcp-router] Could not parse config at ${targetPath}:`, e.message);
      return {};
    }
  }
}
