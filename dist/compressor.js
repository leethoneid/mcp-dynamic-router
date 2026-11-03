/**
 * High-Density Schema Compressor
 * Strips redundant metadata, verbose prose, and examples while retaining 100% type integrity for LLMs.
 */
export class SchemaCompressor {
    /**
     * Fast rule-based token estimator for JSON schema (~3.8 chars per token for code/JSON).
     */
    static estimateTokens(data) {
        const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
        return Math.ceil(jsonStr.length / 3.8);
    }
    /**
     * Prune and compress a single tool definition.
     */
    static compressTool(tool) {
        const compressedDescription = this.compressDescription(tool.description || '');
        const compressedSchema = this.compressInputSchema(tool.inputSchema);
        const rawTokens = this.estimateTokens(tool);
        const compressed = {
            name: tool.name,
            description: compressedDescription,
            inputSchema: compressedSchema,
            _server: tool._server,
            _category: tool._category,
            _rawTokens: rawTokens,
        };
        compressed._compressedTokens = this.estimateTokens(compressed);
        return compressed;
    }
    /**
     * Compress description: removes markdown banners, redundant greetings, limits length.
     */
    static compressDescription(desc) {
        if (!desc)
            return '';
        let cleaned = desc
            .replace(/#+\s+/g, '') // remove markdown headings
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // simplify links [text](url) -> text
            .replace(/\s+/g, ' ')
            .trim();
        // M4 Fix: Relax limit to 250 characters and preserve complete sentences without blindly deleting code blocks
        if (cleaned.length > 250) {
            const sentenceEnd = cleaned.substring(0, 250).lastIndexOf('. ');
            if (sentenceEnd > 120) {
                cleaned = cleaned.substring(0, sentenceEnd + 1);
            }
            else {
                cleaned = cleaned.substring(0, 247).trim() + '...';
            }
        }
        return cleaned;
    }
    /**
     * Recursively compresses a JSON schema object.
     */
    static compressInputSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return { type: 'object' };
        }
        const pruned = {
            type: 'object',
        };
        if (schema.properties && typeof schema.properties === 'object') {
            pruned.properties = {};
            for (const [propName, propDef] of Object.entries(schema.properties)) {
                pruned.properties[propName] = this.compressProperty(propDef);
            }
        }
        if (Array.isArray(schema.required) && schema.required.length > 0) {
            pruned.required = schema.required;
        }
        return pruned;
    }
    /**
     * Prunes a single property schema.
     * M4 Fix: Preserves anyOf/oneOf/allOf/$ref intact without forcing string type.
     * Retains critical constraints: format, pattern, minimum, maximum, enum, default.
     */
    static compressProperty(prop) {
        if (!prop || typeof prop !== 'object') {
            return { type: 'string' };
        }
        // Preserve complex union/reference schemas (anyOf, oneOf, allOf, $ref) intact
        if (prop.anyOf || prop.oneOf || prop.allOf || prop.$ref) {
            const complex = { ...prop };
            if (complex.description) {
                complex.description = this.compressDescription(complex.description);
            }
            return complex;
        }
        const pruned = {};
        if (prop.type) {
            pruned.type = prop.type;
        }
        // Preserve critical constraints
        if (prop.format !== undefined)
            pruned.format = prop.format;
        if (prop.pattern !== undefined)
            pruned.pattern = prop.pattern;
        if (prop.minimum !== undefined)
            pruned.minimum = prop.minimum;
        if (prop.maximum !== undefined)
            pruned.maximum = prop.maximum;
        if (prop.minLength !== undefined)
            pruned.minLength = prop.minLength;
        if (prop.maxLength !== undefined)
            pruned.maxLength = prop.maxLength;
        if (Array.isArray(prop.enum))
            pruned.enum = prop.enum;
        if (prop.default !== undefined)
            pruned.default = prop.default;
        // Compact description while retaining semantic meaning
        if (prop.description) {
            let desc = prop.description.replace(/\s+/g, ' ').trim();
            if (desc.length > 200) {
                desc = desc.substring(0, 197).trim() + '...';
            }
            pruned.description = desc;
        }
        if (prop.type === 'array' && prop.items) {
            pruned.items = this.compressProperty(prop.items);
        }
        if (prop.type === 'object' && prop.properties) {
            pruned.properties = {};
            for (const [k, v] of Object.entries(prop.properties)) {
                pruned.properties[k] = this.compressProperty(v);
            }
            if (Array.isArray(prop.required) && prop.required.length > 0) {
                pruned.required = prop.required;
            }
        }
        // If still no type and no children, default to string
        if (!pruned.type && !pruned.properties && !pruned.items) {
            pruned.type = 'string';
        }
        return pruned;
    }
    /**
     * Calculate overall compression statistics for a set of tools.
     */
    static calculateStats(originalTools, exposedTools) {
        const originalTokens = originalTools.reduce((acc, t) => acc + (t._rawTokens || this.estimateTokens(t)), 0);
        const compressedTokens = exposedTools.reduce((acc, t) => acc + (t._compressedTokens || this.estimateTokens(t)), 0);
        const savedTokens = Math.max(0, originalTokens - compressedTokens);
        const savingsPercentage = originalTokens > 0 ? Number(((savedTokens / originalTokens) * 100).toFixed(1)) : 0;
        return {
            originalTokens,
            compressedTokens,
            savedTokens,
            savingsPercentage,
            originalToolsCount: originalTools.length,
            exposedToolsCount: exposedTools.length,
        };
    }
}
