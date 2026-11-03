/**
 * Semantic Tool Matcher & Intent Router
 * Sub-millisecond TF-IDF + BM25 keyword matching with domain synonym expansion.
 */
import { MCPTool } from './types.js';
export interface MatchScore {
    tool: MCPTool;
    score: number;
    matchedKeywords: string[];
}
export declare class ToolMatcher {
    /**
     * Domain-specific synonym dictionary to dramatically increase intent detection accuracy.
     */
    private static readonly SYNONYMS;
    /**
     * Tokenize text into normalized lowercase alphanumeric words.
     */
    static tokenize(text: string): string[];
    /**
     * Expand tokens with domain synonyms.
     */
    static expandTokens(tokens: string[]): Set<string>;
    /**
     * Score and rank tools against a natural language query or prompt.
     */
    static rankTools(query: string, tools: MCPTool[], topK?: number): MatchScore[];
    /**
     * Filter tools belonging to a specific category or tag.
     */
    static filterByCategory(category: string, tools: MCPTool[]): MCPTool[];
}
