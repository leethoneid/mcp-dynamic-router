export interface LicensePayload {
    licenseKey: string;
    buyerId: string;
    tier?: 'SOLO_PRO' | 'TEAM_ENTERPRISE';
    machineId?: string;
    seats?: number;
    expiresAt?: string;
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
export declare const DEFAULT_GUMROAD_PRODUCT_ID = "mcp-router-pro-2026";
export declare const DEFAULT_GUMROAD_PERMALINK = "mcp-router-pro";
/**
 * Public asymmetric Ed25519 key used strictly for offline license verification.
 * Safe to distribute in open-source and commercial binaries.
 * Mathematical property: Signature CANNOT be forged without the private key.
 */
export declare const COMMERCIAL_PUBLIC_KEY: string;
/**
 * Derives a deterministic machine-bound HMAC key for securing local activation caches.
 * Prevents transferring cache files across machines or manual JSON tampering.
 */
export declare function getLocalCacheHmacKey(): string;
export declare function getCacheFilePath(): string;
/**
 * Generates an offline cryptographically signed commercial license token using Ed25519 asymmetric cryptography.
 * Requires privateKeyPem or COMMERCIAL_SIGNER_PRIVATE_KEY environment variable.
 * Private keys are NEVER stored in the repository or distribution binaries.
 */
export declare function generateOfflineLicenseToken(payload: LicensePayload, privateKeyPem?: string): string;
/**
 * Verifies an offline cryptographic license token against the public Ed25519 key and machine fingerprint.
 */
export declare function verifyOfflineLicenseToken(token: string, options?: {
    publicKey?: string;
    expectedMachineId?: string;
}): LicenseVerificationResult;
/**
 * Validates a Gumroad commercial license key via Gumroad verification API.
 */
export declare function verifyGumroadLicense(licenseKey: string, options?: {
    productId?: string;
    productPermalink?: string;
    fetchImpl?: typeof fetch;
    apiUrl?: string;
    incrementUses?: boolean;
}): Promise<LicenseVerificationResult>;
/**
 * Checks local activation cache. If valid and verified within 14 days on the same machine, grants access.
 */
export declare function checkCachedLicense(cachePath?: string, maxDays?: number): LicenseVerificationResult;
/**
 * Saves a validated activation into local cache with machine binding.
 */
export declare function saveCachedLicense(licenseKey: string, buyerId: string, tier?: string, cachePath?: string): void;
