import { LicenseVerificationResult } from './license.js';
export declare class CommercialLicenseError extends Error {
    code: string;
    constructor(message: string);
}
export interface LicenseResolutionOptions {
    licenseKey?: string;
    cachePath?: string;
    fetchImpl?: typeof fetch;
    skipNetwork?: boolean;
}
/**
 * Resolves and verifies commercial license entitlement.
 * Throws CommercialLicenseError if unauthorized.
 */
export declare function assertCommercialLicense(options?: LicenseResolutionOptions): Promise<LicenseVerificationResult>;
