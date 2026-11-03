import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release-commercial');
const zipOutPath = path.join(rootDir, 'mcp-router-pro-v1.0.0.zip');

async function main() {
  console.log('[1/2] Building hardened commercial binaries...');
  const buildScript = path.join(__dirname, 'build-commercial.ts');
  const buildRes = spawnSync(process.execPath, ['--import', 'tsx', buildScript], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (buildRes.status !== 0) {
    console.error('Build step failed.');
    process.exit(1);
  }

  console.log('[2/2] Creating digital fulfillment ZIP package (for Gumroad upload)...');
  // Multi-runtime 4-tier ZIP degradation: python3 -> python -> zip (Linux/macOS) -> Compress-Archive (PowerShell)
  const pyCode = `
import zipfile, os
rel_dir = r"${releaseDir}"
out_zip = r"${zipOutPath}"
if os.path.exists(out_zip):
    os.remove(out_zip)
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(rel_dir):
        for file in files:
            full_p = os.path.join(root, file)
            arc_p = os.path.relpath(full_p, rel_dir)
            z.write(full_p, arc_p)
print(f"Package created: {out_zip} ({os.path.getsize(out_zip)} bytes)")
`;

  let packaged = false;

  // 1. Try python3, then python
  for (const pyBin of ['python3', 'python']) {
    try {
      const check = spawnSync(pyBin, ['--version']);
      if (check.status === 0) {
        const res = spawnSync(pyBin, ['-c', pyCode], { stdio: 'inherit' });
        if (res.status === 0 && fs.existsSync(zipOutPath)) {
          packaged = true;
          break;
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  // 2. Try native zip (Linux / macOS)
  if (!packaged) {
    try {
      if (fs.existsSync(zipOutPath)) fs.unlinkSync(zipOutPath);
      const res = spawnSync('zip', ['-r', zipOutPath, '.'], { cwd: releaseDir, stdio: 'inherit' });
      if (res.status === 0 && fs.existsSync(zipOutPath)) {
        packaged = true;
        console.log(`Package created via zip CLI: ${zipOutPath} (${fs.statSync(zipOutPath).size} bytes)`);
      }
    } catch {}
  }

  // 3. Try PowerShell Compress-Archive (Windows fallback)
  if (!packaged) {
    try {
      if (fs.existsSync(zipOutPath)) fs.unlinkSync(zipOutPath);
      const psScript = `Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${zipOutPath}' -Force`;
      const res = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'inherit' });
      if (res.status === 0 && fs.existsSync(zipOutPath)) {
        packaged = true;
        console.log(`Package created via PowerShell Compress-Archive: ${zipOutPath} (${fs.statSync(zipOutPath).size} bytes)`);
      }
    } catch {}
  }

  if (!packaged) {
    console.error('Packaging failed: Neither python3, python, zip, nor powershell Compress-Archive succeeded.');
    process.exit(1);
  }

  console.log('\n[SUCCESS] Fulfillment package ready: mcp-router-pro-v1.0.0.zip');
  console.log('You can now upload this ZIP file directly to Gumroad as the digital fulfillment asset.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
