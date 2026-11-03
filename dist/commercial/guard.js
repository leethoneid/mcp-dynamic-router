import { checkCachedLicense, saveCachedLicense, verifyGumroadLicense, verifyOfflineLicenseToken } from './license.js';
export const IS_COMMERCIAL_BUILD = process.env.COMMERCIAL_BUILD === 'true';
export class CommercialLicenseError extends Error {
    code = 'ERR_COMMERCIAL_LICENSE_REQUIRED';
    constructor(message) {
        super(`[COMMERCIAL LICENSE ERROR] ${message}\n` +
            `Please provide a valid license key via --license <key> or set MCP_ROUTER_LICENSE_KEY environment variable.\n` +
            `To purchase a Commercial License ($29 Solo / $79 Team), visit: https://gumroad.com/l/mcp-router-pro`);
        this.name = 'CommercialLicenseError';
    }
}
/**
 * Resolves and verifies commercial license entitlement.
 * Throws CommercialLicenseError if unauthorized.
 */
export async function assertCommercialLicense(options = {}) {
    const key = options.licenseKey || process.env.MCP_ROUTER_LICENSE_KEY;
    // 1. If key is provided and is an offline cryptographic token (MCPLIC.*)
    if (key && key.startsWith('MCPLIC.')) {
        const offlineRes = verifyOfflineLicenseToken(key);
        if (!offlineRes.valid) {
            throw new CommercialLicenseError(offlineRes.reason || 'Offline license verification failed.');
        }
        return offlineRes;
    }
    // 2. Check local machine cache first for rapid startup
    const cachedRes = checkCachedLicense(options.cachePath);
    if (cachedRes.valid) {
        return cachedRes;
    }
    // 3. If standard Gumroad license key is provided, perform online activation
    if (key) {
        if (options.skipNetwork) {
            throw new CommercialLicenseError('Network activation disabled and no valid local license cache found.');
        }
        const onlineRes = await verifyGumroadLicense(key, { fetchImpl: options.fetchImpl });
        if (onlineRes.valid) {
            // Save to cache upon successful verification
            try {
                saveCachedLicense(key, onlineRes.buyerId || 'customer', onlineRes.tier || 'SOLO_PRO', options.cachePath);
            }
            catch {
                // Cache write failure shouldn't block execution
            }
            return onlineRes;
        }
        throw new CommercialLicenseError(onlineRes.reason || 'License key validation failed.');
    }
    // 4. Missing license
    throw new CommercialLicenseError('No active commercial license found on this machine.');
}
