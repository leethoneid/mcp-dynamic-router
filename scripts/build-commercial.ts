import esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'release-commercial');

async function buildCommercialRelease() {
  console.log('====================================================');
  console.log('   MCP DYNAMIC ROUTER COMMERCIAL HARDENING BUILD     ');
  console.log('====================================================\n');

  // 1. Prepare clean release directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'bin'), { recursive: true });

  console.log('[1/4] Bundling commercial edition via esbuild...');
  const bundleResult = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'cli.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    write: false,
    external: [
      'node:*',
      'fs',
      'path',
      'os',
      'crypto',
      'http',
      'readline',
      'child_process',
      'url',
      'events'
    ],
    define: {
      'process.env.COMMERCIAL_BUILD': '"true"'
    }
  });

  let bundledCode = bundleResult.outputFiles[0].text;
  // Strip any existing hashbang lines from bundled code
  bundledCode = bundledCode.replace(/^#!.*\r?\n/gm, '');
  console.log(`      Bundled code size: ${(bundledCode.length / 1024).toFixed(2)} KB`);

  console.log('[2/4] Applying multi-layer anti-tamper obfuscation...');
  const obfuscated = JavaScriptObfuscator.obfuscate(bundledCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.7,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.3,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    renameGlobals: false,
    selfDefending: false,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });

  const hardenedCode = `#!/usr/bin/env node\n/**\n * MCP Dynamic Router - Commercial Distribution Edition\n * Protected under International Copyright Laws.\n */\n` + obfuscated.getObfuscatedCode();

  const targetCliPath = path.join(outDir, 'bin', 'mcp-router.js');
  fs.writeFileSync(targetCliPath, hardenedCode, 'utf-8');
  console.log(`      Hardened CLI binary written to ${targetCliPath}`);

  console.log('[3/4] Copying commercial manifests, documentation and licenses...');
  fs.copyFileSync(path.join(rootDir, 'COMMERCIAL-EULA.md'), path.join(outDir, 'COMMERCIAL-EULA.md'));
  fs.copyFileSync(path.join(rootDir, 'visual-evaluator.html'), path.join(outDir, 'visual-evaluator.html'));

  // Create commercial package.json
  const commPkg = {
    name: "mcp-dynamic-router-pro",
    version: "1.0.0",
    description: "Universal MCP dynamic router & context trimmer (Commercial Pro Edition)",
    bin: {
      "mcp-router": "./bin/mcp-router.js"
    },
    type: "commonjs",
    author: "Solo Overseas",
    license: "Commercial"
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(commPkg, null, 2), 'utf-8');

  // Create launcher script for Windows & Unix
  const batLauncher = `@echo off\r\nnode "%~dp0bin\\mcp-router.js" %*\r\n`;
  fs.writeFileSync(path.join(outDir, 'mcp-router.cmd'), batLauncher, 'utf-8');

  const shLauncher = `#!/usr/bin/env bash\nDIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"\nnode "$DIR/bin/mcp-router.js" "$@"\n`;
  fs.writeFileSync(path.join(outDir, 'mcp-router'), shLauncher, { mode: 0o755 });

  console.log('[4/4] Commercial build successfully generated in release-commercial/ !\n');
}

buildCommercialRelease().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
