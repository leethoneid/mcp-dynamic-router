import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getMachineFingerprint } from './machine-id.js';

export interface LicensePayload {
  licenseKey: string;
  buyerId: string;
  tier?: 'SOLO_PRO' | 'TEAM_ENTERPRISE';
  machineId?: string; // If bound to specific machine
  seats?: number;
  expiresAt?: string; // ISO date or 'never'
  issuedAt: string;
}

export interface LicenseVerificationResult {
  valid: boolean;
  buyerId?: string;
  tier?: string;
  reason?: string;
  offlineGraceDaysRemaining?: number;
}

export interface CachedLicenseData {
  licenseKey: string;
  buyerId: string;
  tier: string;
  machineId: string;
  verifiedAt: string;
  signature: string;
}

export const DEFAULT_GUMROAD_PRODUCT_ID = 'mcp-router-pro-2026';
export const DEFAULT_GUMROAD_PERMALINK = 'mcp-router-pro';

/**
 * Public asymmetric Ed25519 key used strictly for offline license verification.
 * Safe to distribute in open-source and commercial binaries.
 * Mathematical property: Signature CANNOT be forged without the private key.
 */
export const COMMERCIAL_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MCowBQYDK2VwAyEA+U91/mYY/4s1B+Gd48ZHJDZW2f1mZC+/LP/6PHLpDuw=\n' +
  '-----END PUBLIC KEY-----\n';

/**
 * Derives a deterministic machine-bound HMAC key for securing local activation caches.
 * Prevents transferring cache files across machines or manual JSON tampering.
 */
export function getLocalCacheHmacKey(): string {
  return crypto.createHash('sha256').update(`mcp-router-hw-salt:${getMachineFingerprint()}`).digest('hex');
}

export function getCacheFilePath(): string {
  const dir = path.join(os.homedir(), '.mcp-router');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'license-cache.json');
}

/**
 * Generates an offline cryptographically signed commercial license token using Ed25519 asymmetric cryptography.
 * Requires privateKeyPem or COMMERCIAL_SIGNER_PRIVATE_KEY environment variable.
 * Private keys are NEVER stored in the repository or distribution binaries.
 */
export function generateOfflineLicenseToken(
  payload: LicensePayload,
  privateKeyPem?: string
): string {
  let privateKey = privateKeyPem || process.env.COMMERCIAL_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    // Attempt reading from local gitignored developer secret file
    const secretPath = path.resolve(process.cwd(), '.secrets', 'commercial-signer.private.pem');
    if (fs.existsSync(secretPath)) {
      privateKey = fs.readFileSync(secretPath, 'utf-8');
    }
  }

  if (!privateKey) {
    throw new Error(
      'COMMERCIAL_SIGNER_PRIVATE_KEY environment variable or .secrets/commercial-signer.private.pem is required to sign offline license tokens. Never commit private keys to git.'
    );
  }

  const jsonStr = JSON.stringify(payload);
  const encoded = Buffer.from(jsonStr, 'utf-8').toString('base64');
  const payloadBuf = Buffer.from(encoded, 'utf-8');
  const signatureHex = crypto.sign(null, payloadBuf, privateKey).toString('hex');
  return `MCPLIC.${encoded}.${signatureHex}`;
}

/**
 * Verifies an offline cryptographic license token against the public Ed25519 key and machine fingerprint.
 */
export function verifyOfflineLicenseToken(
  token: string,
  options?: { publicKey?: string; expectedMachineId?: string }
): LicenseVerificationResult {
  if (!token || !token.startsWith('MCPLIC.')) {
    return { valid: false, reason: 'Invalid license format. Expected MCPLIC.* token.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed license token segments.' };
  }

  const [, encodedPayload, signatureHex] = parts;
  const publicKey = options?.publicKey || COMMERCIAL_PUBLIC_KEY;

  try {
    const payloadBuf = Buffer.from(encodedPayload, 'utf-8');
    const sigBuf = Buffer.from(signatureHex, 'hex');

    const isValid = crypto.verify(null, payloadBuf, publicKey, sigBuf);
    if (!isValid) {
      return { valid: false, reason: 'License signature verification failed. Token was tampered with or forged.' };
    }

    const payload: LicensePayload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf-8'));

    // Check expiration
    if (payload.expiresAt && payload.expiresAt !== 'never') {
      const expTime = new Date(payload.expiresAt).getTime();
      if (Date.now() > expTime) {
        return { valid: false, reason: `License expired on ${payload.expiresAt}.` };
      }
    }

    // Check machine binding if payload specifies a bound machine
    const currentMachineId = options?.expectedMachineId || getMachineFingerprint();
    if (payload.machineId && payload.machineId !== currentMachineId) {
      return {
        valid: false,
        reason: `License is locked to a different device. Bound: ${payload.machineId.substring(0, 8)}..., Current: ${currentMachineId.substring(0, 8)}...`
      };
    }

    return {
      valid: true,
      buyerId: payload.buyerId,
      tier: payload.tier || 'SOLO_PRO'
    };
  } catch (err: any) {
    return { valid: false, reason: `License parse error: ${err?.message || err}` };
  }
}

/**
 * Validates a Gumroad commercial license key via Gumroad verification API.
 */
export async function verifyGumroadLicense(
  licenseKey: string,
  options?: {
    productId?: string;
    productPermalink?: string;
    fetchImpl?: typeof fetch;
    apiUrl?: string;
    incrementUses?: boolean;
  }
): Promise<LicenseVerificationResult> {
  const fetcher = options?.fetchImpl || fetch;
  const url = options?.apiUrl || 'https://api.gumroad.com/v2/licenses/verify';
  const productId = options?.productId || process.env.GUMROAD_PRODUCT_ID || DEFAULT_GUMROAD_PRODUCT_ID;

  try {
    const params = new URLSearchParams({
      product_id: productId,
      license_key: licenseKey.trim(),
      increment_uses_count: options?.incrementUses !== false ? 'true' : 'false'
    });

    const res = await fetcher(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data: any = await res.json();
    if (data?.success === true && data?.purchase) {
      if (data.purchase.refunded || data.purchase.chargebacked) {
        return {
          valid: false,
          reason: 'License key has been refunded or chargebacked.'
        };
      }
      return {
        valid: true,
        buyerId: data.purchase.email || 'gumroad-customer',
        tier: data.purchase.variants || 'SOLO_PRO'
      };
    }

    return {
      valid: false,
      reason: data?.message || 'Invalid or revoked Gumroad license key.'
    };
  } catch (err: any) {
    return {
      valid: false,
      reason: `Gumroad license verification network failure: ${err?.message || err}`
    };
  }
}

/**
 * Checks local activation cache. If valid and verified within 14 days on the same machine, grants access.
 */
export function checkCachedLicense(
  cachePath: string = getCacheFilePath(),
  maxDays: number = 14
): LicenseVerificationResult {
  try {
    if (!fs.existsSync(cachePath)) {
      return { valid: false, reason: 'No cached activation found.' };
    }

    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cached: CachedLicenseData = JSON.parse(raw);

    const currentMachine = getMachineFingerprint();
    if (cached.machineId !== currentMachine) {
      return { valid: false, reason: 'Cache invalidated: hardware signature mismatch.' };
    }

    // Verify cache integrity HMAC using local machine-derived key
    const expectedSig = crypto
      .createHmac('sha256', getLocalCacheHmacKey())
      .update(`${cached.licenseKey}|${cached.buyerId}|${cached.tier}|${cached.machineId}|${cached.verifiedAt}`)
      .digest('hex');

    if (cached.signature !== expectedSig) {
      return { valid: false, reason: 'Cache tampered with.' };
    }

    const verifiedTimestamp = new Date(cached.verifiedAt).getTime();
    const elapsedDays = (Date.now() - verifiedTimestamp) / (1000 * 60 * 60 * 24);

    if (elapsedDays > maxDays) {
      return { valid: false, reason: 'Offline grace period expired. Re-verification required.' };
    }

    return {
      valid: true,
      buyerId: cached.buyerId,
      tier: cached.tier,
      offlineGraceDaysRemaining: Math.max(0, Math.round(maxDays - elapsedDays))
    };
  } catch {
    return { valid: false, reason: 'Failed to read cache.' };
  }
}

/**
 * Saves a validated activation into local cache with machine binding.
 */
export function saveCachedLicense(
  licenseKey: string,
  buyerId: string,
  tier: string = 'SOLO_PRO',
  cachePath: string = getCacheFilePath()
): void {
  const machineId = getMachineFingerprint();
  const verifiedAt = new Date().toISOString();

  const signature = crypto
    .createHmac('sha256', getLocalCacheHmacKey())
    .update(`${licenseKey}|${buyerId}|${tier}|${machineId}|${verifiedAt}`)
    .digest('hex');

  const data: CachedLicenseData = {
    licenseKey,
    buyerId,
    tier,
    machineId,
    verifiedAt,
    signature
  };

  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
}
