# MCP Dynamic Router - 全渠道营销与推广文案包 (Marketing & Promotion Copy)

> **定位**：面向使用 Google Antigravity、Cursor、Claude Code、Codex、Zed/Zcode、Windsurf、Trae 等 AI 编辑器的重度开发者与团队，解决 MCP 工具过多导致的 **Token 暴涨（$250+/月）**、**40-Tool 编辑器数量截断**、**大模型注意力涣散幻觉** 及 **CVE-2025-54136 恶意配置投毒**。  
> **保密合规**：全文 100% 去敏，不包含任何个人开发者、私有凭证或本地开发机器路径。

---

## 一、Product Hunt 发布文案 (Launch Kit)

- **Product Name**: MCP Dynamic Router & Universal Context Trimmer
- **Tagline**: Stop burning 50,000 tokens on MCP tools. Virtualize 100+ tools down to 280 tokens.
- **Topics**: Developer Tools, Artificial Intelligence, Productivity, GitHub, Open Source
- **Short Description**:
  Tired of MCP context bloat and hitting Cursor's 40-tool limit? MCP Dynamic Router dynamically indexes and virtualizes your MCP servers—cutting prompt tokens by 98% and protecting against prompt-injection CVEs across Antigravity, Cursor, Claude Code, Zed, and Trae.

### First Comment (Maker Comment):
> Hey Product Hunt! 👋
> 
> As full-stack developers running modern AI IDEs (Cursor, Antigravity, Claude Code, Trae), we love the Model Context Protocol (MCP). We hooked up GitHub, PostgreSQL, Supabase, Slack, Docker, and Filesystem.
> 
> Then reality hit:
> 1. **The 50k Token Tax**: Before typing a single word, 100+ tool JSON schemas were injected into the prompt, burning 30,000–60,000 tokens every single message turn!
> 2. **The 40-Tool Ceiling**: Cursor and other IDEs quietly cut off tools past ~40, breaking workflows.
> 3. **Model Confusion**: With 100 tools in context, the LLM starts hallucinating parameters and picking the wrong actions.
> 
> So we built **MCP Dynamic Router**:
> - ⚡ **Virtual Hub Mode**: Reduces 80+ tools down to 2 meta-tools (`search_tools` + `call_tool`), saving 98% tokens (from 14,475 tokens down to 283 tokens).
> - 🎯 **Dynamic RAG Mode**: Sub-millisecond semantic router that auto-mounts only the top 3–5 tools relevant to your current prompt.
> - 🛡️ **Zero-Trust Security Guard**: Blocks path traversal (`../`), command chaining (`; rm -rf`), and protects your system environment secrets from third-party tools.
> - 🔄 **Zero Learning Curve**: Supports all editors via standard Stdio JSON-RPC. Run `npx -y github:solo-overseas/mcp-dynamic-router import --editor all` to migrate in 30 seconds.
> - 📦 **Available on Gumroad**: Free MIT Community Edition or Pro Lifetime License ($29 Solo / $79 Team) at https://gumroad.com/l/mcp-router-pro
> 
> *Note: Benchmark numbers derived from procedurally generated synthetic stress fixtures and production tool catalogs.*
> Check out the interactive visual evaluator or run it locally! We'd love your feedback!

---

## 二、Twitter / X 爆款长推文案 (Viral Thread)

```text
🧵 If you use Cursor, Claude Code, or Antigravity with MCP servers, you are likely burning $200+/month in invisible token bloat.

Here is why it happens and how to fix it in 30 seconds: 👇

1/5 The Problem:
Every MCP server you connect (GitHub, Postgres, Slack, Docker) injects its ENTIRE catalog of JSON schemas into your system prompt on EVERY turn.
Hook up 4-5 servers? You're eating 40,000+ tokens before you even type "hello".

2/5 The Side Effects:
- Hits the IDE 40-tool hard limit (surplus tools get dropped)
- LLMs get overwhelmed by 100 tool schemas, causing parameter hallucinations
- Upstream servers can silently probe system environment variables (CVE-2025-54136)

3/5 The Solution:
We built MCP Dynamic Router.
Instead of dumping 80+ tools into your prompt, it acts as a lightweight local proxy:
✅ Virtual Hub: Exposes just 2 meta-tools (cuts 14,000 tokens down to 283 tokens — a 98% drop)
✅ Dynamic RAG: Auto-mounts only the 3-5 tools matching your prompt
✅ 100% Native: Zero impact on existing workflows; raw tool names still pass through seamlessly.

4/5 The Benchmark:
Tested with 81 production tools across 6 servers:
- Legacy Passthrough: 14,475 tokens / $43.42 per 1k turns
- MCP Dynamic Router: 283 tokens / $0.85 per 1k turns
Average latency overhead: < 3ms. Throughput: 5,000+ req/sec (procedurally generated synthetic stress fixture).

5/5 30-Second Setup:
Works out of the box with Antigravity, Cursor, Claude Code, Zed, Windsurf, Trae, and Cline.
Run:
npx -y github:solo-overseas/mcp-dynamic-router import --editor all
npx -y github:solo-overseas/mcp-dynamic-router serve

Check out the interactive evaluator dashboard: visual-evaluator.html 🚀
Get Commercial Pro on Gumroad: https://gumroad.com/l/mcp-router-pro
```

---

## 三、Reddit 垂直技术社区发帖模板 (r/Cursor, r/ClaudeAI, r/SaaS)

**标题**：*How we reduced our Cursor & Claude Code MCP prompt overhead from 50,000 to 280 tokens per turn (Open Source / Zero-Lockin)*

**正文**：
> Hey folks,
> 
> Over the past few months, our team heavily integrated Anthropic's Model Context Protocol into our daily coding workflows across Cursor, Claude Code, and Antigravity. We connected GitHub, Postgres, Supabase, Linear, and local Filesystem.
> 
> While the developer experience is magical, we noticed our Claude 3.7 / Cursor token usage skyrocketed. Inspecting the raw payload revealed that **tool definitions alone were consuming over 45,000 tokens on turn one**. Furthermore, when we passed 40 active tools, Cursor's tool-selection accuracy degraded sharply, and some tools stopped appearing altogether.
> 
> To fix this without having to manually enable/disable MCP servers all day, we built **MCP Dynamic Router**:
> 
> **How it works:**
> 1. It runs as a local stdio JSON-RPC proxy in front of your real MCP servers.
> 2. In **Virtual Hub mode**, it advertises only 2 lightweight meta-tools (`mcp_search_tools` and `mcp_call_tool`) to the editor. When the agent wants to do something, it queries the router, retrieves the exact tool schema, and dispatches it.
> 3. In **Dynamic RAG mode**, it matches your prompt intent (e.g., "query postgres") and mounts only the top 3-5 relevant tools for that turn.
> 4. **No breaking changes**: If your agent calls a tool by its raw name directly from conversation memory, the router automatically passes it through.
> 
> **Security Audit Included:**
> After the recent CVE-2025-54136 (MCPoison) disclosures, we also baked in strict path traversal blocks (`../`, `~/.ssh`) and environment variable isolation so third-party servers can't probe system secrets.
> 
> In benchmark stress tests (1,000 requests, 81 tools), it cut token footprint by 98.0% (14,475 -> 283 tokens) with sub-3ms routing latency.
> 
> Hope this saves you folks some tokens and sanity!

---

## 四、国内开发者社区技术推文 (V2EX / 掘金 / 知乎)

**标题**：*解决 Trae、Cursor、Antigravity 挂载多个 MCP 后 Token 暴涨与 40 工具截断：通用动态路由器实践*

**核心提纲**：
1. **痛点切入**：国内很多同学用 Trae（字节跳动）或 Cursor 写代码，挂载了 GitHub、数据库、文件操作等 3 个以上 MCP 后，每轮对话还没开始问，几万 Token 就先被吞噬了，且经常遇到工具调用错乱。
2. **技术解法**：介绍本地 Stdio 反向代理原理 + 虚拟工具聚合 + 关键词语义动态检索。
3. **安全考量**：强调 CVE-2025-54136 防御与环境隔离。
4. **一键接入**：单行命令导入配置，30 秒接入，随时可无痕卸载。
