/**
 * Universal AI Editor Adapter & Configuration Engine
 * Seamlessly integrates with Google Antigravity, Cursor, Claude Code, Codex, Zed/Zcode, Windsurf, Trae, Cline & Continue.
 */
import { EditorType, MCPServerConfig } from './types.js';
export interface EditorInfo {
    type: EditorType;
    displayName: string;
    defaultConfigPath: string;
    configFormat: 'standard-mcp' | 'zed-context-servers' | 'continue-experimental';
    docsUrl: string;
}
export declare class EditorAdapter {
    private static readonly HOME;
    private static readonly APPDATA;
    /**
     * Registry of all supported AI editors globally and domestically.
     */
    static readonly EDITORS: Record<EditorType, EditorInfo>;
    /**
     * Generates the configuration snippet to register mcp-dynamic-router into the specified editor.
     */
    static generateEditorConfig(editor: EditorType, routerBinaryPath?: string, configPath?: string): any;
    /**
     * Auto-detect which AI editors are installed on the local machine.
     */
    static detectInstalledEditors(): Array<{
        editor: EditorInfo;
        detectedPath?: string;
        exists: boolean;
    }>;
    /**
     * Scans and imports upstream server configurations from an existing editor config file.
     * L1 Fix: Supports 'all' to loop through and import all detected editors.
     */
    static importServersFromEditor(editor: EditorType | 'all', customFilePath?: string): Record<string, MCPServerConfig>;
}
