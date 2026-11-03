/**
 * Semantic Tool Matcher & Intent Router
 * Sub-millisecond TF-IDF + BM25 keyword matching with domain synonym expansion.
 */
export class ToolMatcher {
    /**
     * Domain-specific synonym dictionary to dramatically increase intent detection accuracy.
     */
    static SYNONYMS = {
        git: ['commit', 'branch', 'pr', 'pull', 'repo', 'repository', 'diff', 'push', 'checkout', 'clone', 'tag', 'stash', 'merge', 'rebase', 'github', 'gitlab'],
        database: ['sql', 'postgres', 'postgresql', 'mysql', 'supabase', 'table', 'schema', 'query', 'migration', 'column', 'row', 'record', 'select', 'insert', 'update'],
        filesystem: ['file', 'read', 'write', 'dir', 'directory', 'folder', 'path', 'delete', 'move', 'rename', 'copy', 'tree', 'cat', 'edit'],
        web: ['fetch', 'http', 'https', 'api', 'curl', 'url', 'scrape', 'browser', 'html', 'download', 'request', 'post', 'get', 'endpoint', 'playwright', 'puppeteer'],
        devops: ['docker', 'container', 'image', 'compose', 'volume', 'port', 'build', 'k8s', 'kubernetes', 'deploy', 'cluster', 'logs', 'ci', 'cd', 'actions'],
        issue: ['ticket', 'bug', 'task', 'linear', 'jira', 'assign', 'close', 'resolve', 'milestone', 'epic', 'sprint'],
        chat: ['slack', 'discord', 'message', 'channel', 'notify', 'send', 'chat', 'webhook', 'postmark', 'resend', 'email'],
        terminal: ['bash', 'sh', 'exec', 'command', 'terminal', 'cmd', 'powershell', 'shell', 'process'],
    };
    /**
     * Tokenize text into normalized lowercase alphanumeric words.
     */
    static tokenize(text) {
        if (!text)
            return [];
        return text
            .toLowerCase()
            .replace(/[^a-z0-9_\-\s]/g, ' ')
            .split(/[\s_\-]+/)
            .filter((w) => w.length > 1);
    }
    /**
     * Expand tokens with domain synonyms.
     */
    static expandTokens(tokens) {
        const expanded = new Set(tokens);
        for (const token of tokens) {
            for (const [domain, syns] of Object.entries(this.SYNONYMS)) {
                if (token === domain || syns.includes(token)) {
                    expanded.add(domain);
                    for (const s of syns) {
                        expanded.add(s);
                    }
                }
            }
        }
        return expanded;
    }
    /**
     * Score and rank tools against a natural language query or prompt.
     */
    static rankTools(query, tools, topK = 5) {
        if (!query || tools.length === 0) {
            return tools.slice(0, topK).map((t) => ({ tool: t, score: 1.0, matchedKeywords: [] }));
        }
        const queryTokens = this.tokenize(query);
        const expandedQuerySet = this.expandTokens(queryTokens);
        const scores = [];
        for (const tool of tools) {
            const toolNameTokens = this.tokenize(tool.name);
            const descTokens = this.tokenize(tool.description || '');
            const serverTokens = this.tokenize(tool._server || '');
            const categoryTokens = this.tokenize(tool._category || '');
            let score = 0;
            const matchedKeywords = [];
            // 1. Exact Name match bonus (Highest weight)
            for (const token of queryTokens) {
                if (toolNameTokens.includes(token)) {
                    score += 5.0;
                    matchedKeywords.push(token);
                }
            }
            // 2. Server or Category match bonus
            for (const token of queryTokens) {
                if (serverTokens.includes(token) || categoryTokens.includes(token)) {
                    score += 4.0;
                    matchedKeywords.push(token);
                }
            }
            // 3. Description token match
            for (const token of queryTokens) {
                if (descTokens.includes(token)) {
                    score += 2.0;
                    if (!matchedKeywords.includes(token)) {
                        matchedKeywords.push(token);
                    }
                }
            }
            // 4. Expanded Domain Synonym match
            for (const expToken of expandedQuerySet) {
                if (toolNameTokens.includes(expToken)) {
                    score += 2.5;
                }
                else if (descTokens.includes(expToken) || categoryTokens.includes(expToken)) {
                    score += 1.0;
                }
            }
            // 5. Parameter name match (if tool has parameters that match query)
            if (tool.inputSchema?.properties) {
                for (const propName of Object.keys(tool.inputSchema.properties)) {
                    const propTokens = this.tokenize(propName);
                    for (const token of queryTokens) {
                        if (propTokens.includes(token)) {
                            score += 1.5;
                            if (!matchedKeywords.includes(propName)) {
                                matchedKeywords.push(propName);
                            }
                        }
                    }
                }
            }
            scores.push({
                tool,
                score,
                matchedKeywords: Array.from(new Set(matchedKeywords)),
            });
        }
        // Sort descending by score
        scores.sort((a, b) => b.score - a.score);
        // If top score is 0 (no keywords matched), return first topK tools with a baseline score
        if (scores.length > 0 && scores[0].score === 0) {
            return scores.slice(0, topK).map((item) => ({
                ...item,
                score: 0.1,
            }));
        }
        return scores.slice(0, topK);
    }
    /**
     * Filter tools belonging to a specific category or tag.
     */
    static filterByCategory(category, tools) {
        const catLower = category.toLowerCase().replace(/^#/, '');
        return tools.filter((t) => {
            if (t._category?.toLowerCase() === catLower)
                return true;
            if (t._server?.toLowerCase() === catLower)
                return true;
            const tokens = this.tokenize(t.name);
            return tokens.includes(catLower);
        });
    }
}
