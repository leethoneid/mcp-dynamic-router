/**
 * Commercial License Validator & Integrity Engine
 * High-assurance Ed25519 Asymmetric Verification with Hardware Fingerprint Binding.
 */
import { LicenseVerificationResult } from './commercial/index.js';
export * from './commercial/index.js';
export type LicenseValidationResult = LicenseVerificationResult;
export declare class LicenseValidator {
    /**
     * Generates a stable machine fingerprint based on hostname, CPU, and network interfaces.
     */
    static getMachineFingerprint(): string;
    /**
     * Generates an Ed25519 signed license token (used by vendor / CI).
     */
    static generateLicenseKey(payload: any, privateKeyPem?: string): string;
    /**
     * Verifies an input license key offline or via local hardware cache.
     */
    static verifyLicense(key?: string): LicenseValidationResult;
}
