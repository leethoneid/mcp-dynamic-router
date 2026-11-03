#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateOfflineLicenseToken } from '../src/commercial/license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function printUsage() {
  console.log(`
Usage:
  node --import tsx scripts/issue-license.ts --buyer <email> [--machine <fingerprint>] [--days <days>] [--tier <SOLO_PRO|TEAM_ENTERPRISE>]

Options:
  --buyer <email>        Customer email address (required)
  --machine <hash>       Target machine hardware fingerprint (optional, locks to device)
  --days <number>        Validity period in days (defaults to 'never')
  --tier <name>          License tier: SOLO_PRO (default) or TEAM_ENTERPRISE
`);
}

function parseArgs(): { buyer?: string; machine?: string; days?: number; tier?: string } {
  const args = process.argv.slice(2);
  const result: any = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--buyer' && args[i + 1]) {
      result.buyer = args[++i];
    } else if (args[i] === '--machine' && args[i + 1]) {
      result.machine = args[++i];
    } else if (args[i] === '--days' && args[i + 1]) {
      result.days = parseInt(args[++i], 10);
    } else if (args[i] === '--tier' && args[i + 1]) {
      result.tier = args[++i];
    }
  }
  return result;
}

function ensureSigningKey(): string {
  const secretDir = path.join(rootDir, '.secrets');
  const secretPath = path.join(secretDir, 'commercial-signer.private.pem');

  if (process.env.COMMERCIAL_SIGNER_PRIVATE_KEY) {
    return process.env.COMMERCIAL_SIGNER_PRIVATE_KEY;
  }

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8');
  }

  console.log('[Notice] No private signing key found. Generating local Ed25519 keypair in .secrets/ ...');
  if (!fs.existsSync(secretDir)) {
    fs.mkdirSync(secretDir, { recursive: true });
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(secretPath, privateKey, { encoding: 'utf-8', mode: 0o600 });
  fs.writeFileSync(path.join(secretDir, 'commercial-signer.public.pem'), publicKey, 'utf-8');
  console.log(`[Success] Generated new Ed25519 keypair in ${secretDir}`);
  return privateKey;
}

function main() {
  const { buyer, machine, days, tier } = parseArgs();

  if (!buyer) {
    printUsage();
    process.exit(1);
  }

  const privateKey = ensureSigningKey();
  const selectedTier = (tier === 'TEAM_ENTERPRISE' ? 'TEAM_ENTERPRISE' : 'SOLO_PRO') as 'SOLO_PRO' | 'TEAM_ENTERPRISE';
  const expiresAt = days ? new Date(Date.now() + days * 86400 * 1000).toISOString() : 'never';
  const licenseKey = `MCPLIC-${selectedTier.substring(0, 4)}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const token = generateOfflineLicenseToken(
    {
      licenseKey,
      buyerId: buyer,
      tier: selectedTier,
      machineId: machine,
      expiresAt,
      issuedAt: new Date().toISOString()
    },
    privateKey
  );

  console.log('====================================================');
  console.log('       OFFLINE COMMERCIAL LICENSE TOKEN ISSUED      ');
  console.log('====================================================');
  console.log(`Buyer:      ${buyer}`);
  console.log(`Tier:       ${selectedTier}`);
  console.log(`Machine:    ${machine || 'Unlocked (Any Device)'}`);
  console.log(`Expires:    ${expiresAt}`);
  console.log('----------------------------------------------------');
  console.log('Token (Deliver to Customer via Gumroad / Direct):');
  console.log(token);
  console.log('----------------------------------------------------');
  console.log('Customer activation command:');
  console.log(`mcp-router activate ${token}\n`);
}

main();
