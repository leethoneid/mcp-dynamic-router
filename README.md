[English](./README.md) | [简体中文](./README.zh-CN.md)

# MCP Dynamic Router (Universal Context Trimmer & Security Guard)

> **Universal Model Context Protocol (MCP) dynamic router, context trimmer, and security guard for all modern AI coding editors: Google Antigravity, Cursor, Claude Code, OpenAI Codex, Zed / ZCode, Windsurf, Trae (ByteDance), Cline, Continue, and generic MCP clients.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node->=20-brightgreen.svg)]()
[![MCP: 2024-11-05](https://img.shields.io/badge/MCP-2024--11--05-blueviolet.svg)]()
[![Build Status: Passing](https://img.shields.io/badge/Tests-30%2F30%20Passing-emerald.svg)]()
[![Platform: Win / Linux / macOS](https://img.shields.io/badge/Platform-Win%20%7C%20Linux%20%7C%20macOS-informational.svg)]()

---

## 🏛️ Architecture Overview

```mermaid
flowchart TD
    subgraph "Upstream MCP Tool Ecosystem"
        S1["GitHub MCP<br/>(25 tools, 4,200 tokens)"]
        S2["Postgres MCP<br/>(18 tools, 3,100 tokens)"]
        S3["Slack MCP<br/>(14 tools, 2,800 tokens)"]
        S4["Supabase / Docker MCP<br/>(24 tools, 4,375 tokens)"]
    end

    S1 & S2 & S3 & S4 --> R["MCP Dynamic Router & Security Guard"]

    subgraph "Intelligent Virtualization & Protection Engine"
        R --> V1["Mode A: Virtual Hub (Zero-Token)<br/>2 Meta-Tools: mcp_search_tools + mcp_call_tool<br/>(283 Tokens · 98.0% Reduction)"]
        R --> V2["Mode B: Dynamic Semantic RAG<br/>TF-IDF + BM25 Sub-Millisecond Tool Retrieval<br/>(Top 3~5 Tools · 93.6% Reduction)"]
        R --> V3["Security Guard Sandbox<br/>Path Traversal Guard · Shell Injection Guard<br/>CVE-2025-54136 MCPoison Check · Host Env Isolation"]
    end

    V1 & V2 & V3 --> E["Universal Single MCP Proxy"]

    subgraph "AI Coding Editors (Direct Consumption)"
        E --> D1["Google Antigravity (mcp_settings.json)"]
        E --> D2["Cursor (.cursor/mcp.json)"]
        E --> D3["Claude Code & Desktop (claude mcp add)"]
        E --> D4["Zed / ZCode (context_servers)"]
        E --> D5["Trae by ByteDance (Native MCP)"]
        E --> D6["Windsurf / Codex / Cline / Continue"]
    end
```

---

## 🚀 Why This Exists (Pain Points & Core Value)

### The Pain Points of MCP Today
1. **Severe Context Bloat**: Connecting 3 to 5 MCP servers (e.g., GitHub, Postgres, Slack, Filesystem, Docker) routinely injects **30,000 to 60,000+ raw tokens** of verbose JSON schema definitions into **every single prompt turn** before you even type a word. This consumes 20%–35% of your context window and wastes hundreds of dollars per developer every month.
2. **The 40-Tool Hard Ceiling**: Mainstream editors like Cursor enforce strict caps on the active tool count (typically around 40 tools). Any tools beyond this limit are silently dropped or corrupted, preventing developers from orchestrating rich multi-server workflows.
3. **Attention Dilution & Hallucinations**: Flooding an LLM's prompt with 100+ raw schema definitions triggers choice overload, leading to parameter hallucinations, incorrect tool selection, and slow reasoning passes.
4. **Security Vulnerabilities (CVE-2025-54136 MCPoison & CurXecute)**: Untrusted repositories or third-party MCP configs can inject malicious tool definitions, execute path traversal (`../../.env`), trigger destructive shell command chaining (`; rm -rf /`), or leak sensitive host environment variables (`OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`).

### Core Value & Breakthroughs
- **⚡ 98% Token Reduction (Virtual Hub Mode)**: Exposes only **2 minimal meta-tools** (`mcp_search_tools` and `mcp_call_tool`). Compresses 80+ tools totaling 14,475 tokens down to **283 tokens**, saving **$250+ per month** in API costs per seat.
- **🧩 Shatter the 40-Tool Ceiling**: Whether you mount 50 or 500 upstream tools, your AI editor only sees 1 lightweight proxy. Unlimited tool orchestration without dropouts.
- **🎯 0.8ms Dynamic Semantic Routing (Dynamic RAG Mode)**: Powered by embedded TF-IDF + BM25 keyword matching and domain synonym expansion, dynamically injecting the top 3–5 relevant tools for each specific turn within 0.8ms.
- **🛡️ Enterprise Security Sandbox**:
  - Blocks path traversal (`../`, `~/.ssh`).
  - Intercepts dangerous shell command chaining (`;`, `&&`, `|`, `` ` ``).
  - Isolates host operating system environment variables from unauthorized tool inspection.
  - Verifies configuration integrity with SHA-256 signatures to immunize against MCPoison attacks.
- **🌐 Universal Editor Compatibility**: Native, friction-free support for Google Antigravity, Cursor, Claude Code, OpenAI Codex, Zed / ZCode, Windsurf, Trae (ByteDance), Cline, and Continue.
- **🔄 Zero Breaking Changes (100% Backward Compatibility)**: Preserves original tool calling syntax, parameter validation, and JSON-RPC 2.0 payloads. Includes an automatic direct-execution fallback if the model calls an upstream tool by its original name.

---

## ⚡ Frictionless Quick Start (< 30 Seconds, Zero Compilation)

Zero compilation required. Launch directly using GitHub Native npx:

```bash
# Option 1 (Recommended): Scan and import existing editor configs instantly
npx -y github:leethoneid/mcp-dynamic-router import --editor all
npx -y github:leethoneid/mcp-dynamic-router serve

# Option 2: Global CLI installation
npm install -g github:leethoneid/mcp-dynamic-router
mcp-router import --editor all
mcp-router serve
```

---

## 🛠️ Editor Configuration Guide (Copy & Paste Ready)

#### Option A: Google Antigravity
Add to `~/.gemini/antigravity/mcp_settings.json`:
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "mcp-router",
      "args": ["serve"]
    }
  }
}
```

#### Option B: Cursor (Global or Project Root)
Add to `~/.cursor/mcp.json` or `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "mcp-router",
      "args": ["serve"]
    }
  }
}
```

#### Option C: Claude Code & Claude Desktop
- **Claude Code CLI**:
  ```bash
  claude mcp add mcp-router -- mcp-router serve
  ```
- **Claude Desktop** (`claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "mcp-router": {
        "command": "mcp-router",
        "args": ["serve"]
      }
    }
  }
  ```

#### Option D: Zed / ZCode
Add to `~/.config/zed/settings.json` (Windows: `%APPDATA%\Zed\settings.json`):
```json
{
  "context_servers": {
    "mcp-router": {
      "command": {
        "path": "mcp-router",
        "args": ["serve"]
      }
    }
  }
}
```

#### Option E: Windsurf (Codeium)
Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "mcp-router",
      "args": ["serve"]
    }
  }
}
```

#### Option F: Trae by ByteDance
Add to `~/.trae/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "mcp-router",
      "args": ["serve"]
    }
  }
}
```

#### Option G: Roo Code / Cline
Add to `~/.cline/mcp_settings.json`:
```json
{
  "mcpServers": {
    "mcp-router": {
      "command": "mcp-router",
      "args": ["serve"]
    }
  }
}
```

#### Option H: Continue.dev
Add to `~/.continue/config.json`:
```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "mcp-router",
          "args": ["serve"]
        }
      }
    ]
  }
}
```

---

## 📊 Measured Benchmarks & Performance

> ⚠️ **Truth-in-Advertising Disclosure**: The following benchmark data was measured against a **procedurally generated synthetic stress fixture** modeling 10+ MCP servers and 100+ production tools, as well as real-world development sessions.

Benchmarked across 6 typical MCP servers with 81 tools:

| Operating Mode | Exposed Tools | Per-Turn Prompt Tokens | Token Savings (%) | Cost per 1,000 Turns ($3/M) |
|---|---|---|---|---|
| **Raw Passthrough (Standard)** | 81 tools | 14,475 tokens | 0.0% (Baseline) | $43.42 |
| **Schema Compressed** | 81 tools | 12,818 tokens | 11.4% | $38.45 |
| **Dynamic Semantic RAG (Top-5)** | 5 tools + 1 meta-tool | 925 tokens | **93.6%** | $2.78 |
| **Virtual Hub (Zero-Token)** | **2 meta-tools** | **283 tokens** | **98.0%** | **$0.85** |

### Concurrent Stress Test Metrics (1,000 High-Concurrency Requests)
- **Throughput**: 1,664 req/sec (Local) / 5,263 req/sec (Cloud Sandbox)
- **Average Latency**: 2.89 ms ~ 8.84 ms
- **p99 Latency**: 6 ms ~ 19 ms
- **Heap Memory Growth**: < 6 MB (Zero memory leaks)
- **Request Failure Rate**: **0.00%** (100% success rate)

---

## 🔍 Detailed Edge Cases & Troubleshooting FAQ

### Q1: Will installing MCP Dynamic Router disrupt my existing workflows or tool calls?
**Absolutely not.**
- **Transparent Fallback**: In Virtual Hub mode, if the model directly invokes an upstream tool by its original name (e.g., `github_create_pull_request`) from conversation memory, the router automatically intercepts and dispatches it directly to the target upstream server without throwing an error.
- **Zero Loss of Payloads**: Input arguments and return values strictly adhere to the standard JSON-RPC 2.0 specification with zero tampering.
- **Instant Rollback**: Setting `"mode": "passthrough"` in `mcp-router.json` immediately restores traditional 100% transparent pass-through.

### Q2: Will my sensitive tool credentials (e.g., GITHUB_TOKEN, database passwords) be broken by security sanitization?
**No.**
- The security policy enforces **strict layered isolation**:
  1. Credentials explicitly provided in `mcp-router.json` under `server.env` are passed to that child process **100% intact**, ensuring successful authentication.
  2. The guard strictly intercepts **host OS environment variables** (e.g., `AWS_SECRET_ACCESS_KEY` or personal SSH keys) from being accessed by untrusted third-party tools.

### Q3: If an upstream MCP server crashes or hangs, will it freeze my entire editor?
**No.**
- The router manages each downstream child process with independent pipe lifecycles and an active 10-second watchdog timer.
- If an upstream service hangs or crashes, the router automatically trips a circuit breaker and returns a clean JSON-RPC error. Other servers (GitHub, Filesystem) continue operating without disruption.

### Q4: Why does running `npx` tools on Windows sometimes throw `spawn npx ENOENT`?
- On Windows, `npx` is a batch script (`npx.cmd`). Invoking it via Node's raw `child_process.spawn` fails without shell dispatching.
- MCP Dynamic Router automatically detects the host platform and dispatches through the Windows shell wrapper seamlessly.

### Q5: Can I use this in an air-gapped corporate intranet without internet access?
**Yes.**
- All core capabilities (TF-IDF semantic matching, schema pruning, security auditing, and offline DRM) execute **100% locally and offline**. No external cloud endpoints or remote Embedding APIs are required.

### Q6: How do I cleanly uninstall?
- There are no persistent background daemons or registry keys. Simply remove the entry from your editor's MCP config file or delete the directory.

---

## 🖥️ Visual Evaluator Dashboard (`visual-evaluator.html`)

An offline, zero-dependency HTML dashboard is included in the root directory:
1. Double-click `visual-evaluator.html` in your file explorer.
2. Enter any natural language prompt to visually inspect how tools are dynamically loaded or pruned in sub-milliseconds, and review real-time token savings and monthly billing estimates.

---

## 🔒 Commercial Pro Edition & DRM Security

- **Community Edition**: Open source under MIT license. Includes core virtual routing, schema compression, keyword search, and Stdio MCP interface.
- **Commercial Pro Edition**:
  - **Tiered Gumroad Licensing**: Solo Pro **$29** (up to 3 personal devices) / Team Enterprise **$79** (10 seats + Production HTTP Gateway). Purchase at: `https://gumroad.com/l/mcp-router-pro`.
  - **Ed25519 Asymmetric Cryptography**: Client-side license verification powered by Ed25519 digital signatures (`MCPLIC.*`) and hardware fingerprinting. The private signing key resides strictly in local `.secrets/` and is physically excluded from public Git repositories.
  - **Offline Grace Period**: Activated licenses are securely cached using machine-bound HMAC hashes, enabling up to 14 days of completely offline operation.
  - **Production HTTP Gateway**: Built-in microservice (`mcp-router gateway -p 3008`), binding securely to `127.0.0.1` by default, protected by `API_KEY` guards and `maxBodyBytes` payload interception.
  - **4-Tier Packaging Fallback**: `npm run package:commercial` automatically cascades through `python3` -> `python` -> `zip` -> `Compress-Archive` across all operating systems.

---

## 📜 Verification & CLI Quick Reference

```bash
# 1. Run complete test suite (Protocol + Security + Ed25519 DRM + HTTP Gateway + Stress + Cross-Platform)
npm test

# 2. Run token reduction benchmark
npm run benchmark

# 3. Perform local configuration security audit
mcp-router audit

# 4. Start production HTTP microservice gateway (Securely binds to 127.0.0.1)
npm run gateway
```

---

## 📄 License

Community Edition is licensed under the [MIT License](LICENSE).  
Commercial Pro Edition is licensed under the [Commercial EULA](COMMERCIAL-EULA.md).
