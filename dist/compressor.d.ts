/**
 * High-Density Schema Compressor
 * Strips redundant metadata, verbose prose, and examples while retaining 100% type integrity for LLMs.
 */
import { MCPTool, MCPToolInputSchema, CompressionStats } from './types.js';
export declare class SchemaCompressor {
    /**
     * Fast rule-based token estimator for JSON schema (~3.8 chars per token for code/JSON).
     */
    static estimateTokens(data: any): number;
    /**
     * Prune and compress a single tool definition.
     */
    static compressTool(tool: MCPTool): MCPTool;
    /**
     * Compress description: removes markdown banners, redundant greetings, limits length.
     */
    static compressDescription(desc: string): string;
    /**
     * Recursively compresses a JSON schema object.
     */
    static compressInputSchema(schema: MCPToolInputSchema): MCPToolInputSchema;
    /**
     * Prunes a single property schema.
     * M4 Fix: Preserves anyOf/oneOf/allOf/$ref intact without forcing string type.
     * Retains critical constraints: format, pattern, minimum, maximum, enum, default.
     */
    private static compressProperty;
    /**
     * Calculate overall compression statistics for a set of tools.
     */
    static calculateStats(originalTools: MCPTool[], exposedTools: MCPTool[]): CompressionStats;
}
