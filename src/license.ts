/**
 * Commercial License Validator & Integrity Engine
 * High-assurance Ed25519 Asymmetric Verification with Hardware Fingerprint Binding.
 */

import {
  getMachineFingerprint,
  generateOfflineLicenseToken,
  verifyOfflineLicenseToken,
  verifyGumroadLicense,
  checkCachedLicense,
  saveCachedLicense,
  COMMERCIAL_PUBLIC_KEY,
  LicensePayload,
  LicenseVerificationResult
} from './commercial/index.js';

export * from './commercial/index.js';
export type LicenseValidationResult = LicenseVerificationResult;

export class LicenseValidator {
  /**
   * Generates a stable machine fingerprint based on hostname, CPU, and network interfaces.
   */
  static getMachineFingerprint(): string {
    return getMachineFingerprint();
  }

  /**
   * Generates an Ed25519 signed license token (used by vendor / CI).
   */
  static generateLicenseKey(payload: any, privateKeyPem?: string): string {
    return generateOfflineLicenseToken({
      licenseKey: payload.licenseKey || `MCPLIC-${Date.now().toString(36).toUpperCase()}`,
      buyerId: payload.licensee || payload.buyerId || 'solo-customer',
      tier: payload.tier || 'SOLO_PRO',
      machineId: payload.machineId,
      expiresAt: payload.expiresAt || 'never',
      issuedAt: new Date().toISOString()
    }, privateKeyPem);
  }

  /**
   * Verifies an input license key offline or via local hardware cache.
   */
  static verifyLicense(key?: string): LicenseValidationResult {
    if (!key || key.trim() === '') {
      // Check cached license first
      const cached = checkCachedLicense();
      if (cached.valid) {
        return cached;
      }
      return {
        valid: true,
        tier: 'COMMUNITY',
        buyerId: 'Community User',
        reason: 'Running in Community Free Edition. Upgrade to Pro on Gumroad for Enterprise Gateway & Commercial EULA.',
      };
    }

    if (key.startsWith('MCPLIC.')) {
      return verifyOfflineLicenseToken(key);
    }

    return {
      valid: false,
      reason: 'Invalid license format. Expected MCPLIC.* token.'
    };
  }
}
