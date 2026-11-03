import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  getMachineFingerprint,
  generateOfflineLicenseToken,
  verifyOfflineLicenseToken,
  verifyGumroadLicense,
  checkCachedLicense,
  saveCachedLicense,
  assertCommercialLicense,
  CommercialLicenseError,
  COMMERCIAL_PUBLIC_KEY
} from '../src/commercial/index.js';

const tempDir = path.join(os.tmpdir(), `mcp-router-test-${Date.now()}`);

describe('MCP Dynamic Router - DRM & Asymmetric Ed25519 Security Suite', () => {

  test('1. getMachineFingerprint should return consistent 32-char hex hardware hash', () => {
    const fp1 = getMachineFingerprint();
    const fp2 = getMachineFingerprint();
    assert.equal(fp1.length, 32);
    assert.equal(fp1, fp2, 'Fingerprint must be deterministic across calls on the same machine');
    assert.match(fp1, /^[0-9a-f]{32}$/);
  });

  test('2. verifyOfflineLicenseToken should authenticate valid Ed25519 token, block expired, and lock to machine ID', () => {
    const { publicKey: testPubKey, privateKey: testPrivKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const currentMachine = getMachineFingerprint();

    // 1. Valid non-expired license locked to current machine
    const validToken = generateOfflineLicenseToken(
      {
        licenseKey: 'MCPLIC-PRO-2026-ABCD',
        buyerId: 'developer@studio.io',
        tier: 'SOLO_PRO',
        machineId: currentMachine,
        expiresAt: 'never',
        issuedAt: new Date().toISOString()
      },
      testPrivKey
    );

    const validRes = verifyOfflineLicenseToken(validToken, { publicKey: testPubKey });
    assert.equal(validRes.valid, true);
    assert.equal(validRes.buyerId, 'developer@studio.io');
    assert.equal(validRes.tier, 'SOLO_PRO');

    // 2. Token locked to a DIFFERENT machine fingerprint must be rejected
    const foreignToken = generateOfflineLicenseToken(
      {
        licenseKey: 'MCPLIC-PRO-PIRATED',
        buyerId: 'pirate@torrent.org',
        tier: 'SOLO_PRO',
        machineId: '0123456789abcdef0123456789abcdef', // Foreign machine
        expiresAt: 'never',
        issuedAt: new Date().toISOString()
      },
      testPrivKey
    );

    const foreignRes = verifyOfflineLicenseToken(foreignToken, { publicKey: testPubKey });
    assert.equal(foreignRes.valid, false);
    assert.ok(foreignRes.reason?.includes('locked to a different device'));

    // 3. Expired license token must be rejected
    const expiredToken = generateOfflineLicenseToken(
      {
        licenseKey: 'MCPLIC-EXPIRED',
        buyerId: 'expired@customer.com',
        tier: 'SOLO_PRO',
        expiresAt: '2020-01-01T00:00:00.000Z',
        issuedAt: '2019-01-01T00:00:00.000Z'
      },
      testPrivKey
    );

    const expiredRes = verifyOfflineLicenseToken(expiredToken, { publicKey: testPubKey });
    assert.equal(expiredRes.valid, false);
    assert.ok(expiredRes.reason?.includes('License expired'));

    // 4. Tampered token signature must be mathematically rejected
    const parts = validToken.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.badsignature1234567890abcdef`;
    const tamperedRes = verifyOfflineLicenseToken(tamperedToken, { publicKey: testPubKey });
    assert.equal(tamperedRes.valid, false);
    assert.ok(tamperedRes.reason?.includes('verification failed'));
  });

  test('3. saveCachedLicense and checkCachedLicense should enforce offline grace period and detect hardware spoofing', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const testCachePath = path.join(tempDir, 'license-cache.json');

    // 1. Initially no cache
    const initialRes = checkCachedLicense(testCachePath);
    assert.equal(initialRes.valid, false);

    // 2. Save valid activation
    saveCachedLicense('MCPLIC-TEST-999', 'pro_engineer@firm.com', 'SOLO_PRO', testCachePath);
    const cachedRes = checkCachedLicense(testCachePath, 14);
    assert.equal(cachedRes.valid, true);
    assert.equal(cachedRes.buyerId, 'pro_engineer@firm.com');
    assert.equal(cachedRes.tier, 'SOLO_PRO');
    assert.ok(cachedRes.offlineGraceDaysRemaining !== undefined && cachedRes.offlineGraceDaysRemaining <= 14);

    // 3. Test tampered cache file (unauthorized modification of buyerId)
    const rawCache = JSON.parse(fs.readFileSync(testCachePath, 'utf-8'));
    rawCache.buyerId = 'hacker@pirated.net';
    fs.writeFileSync(testCachePath, JSON.stringify(rawCache), 'utf-8');

    const tamperedRes = checkCachedLicense(testCachePath);
    assert.equal(tamperedRes.valid, false);
    assert.ok(tamperedRes.reason?.includes('Cache tampered with'));

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('4. verifyGumroadLicense should authenticate valid purchases and block refunded/chargebacked orders', async () => {
    // Mock successful purchase
    const mockSuccessFetch = async () => ({
      json: async () => ({
        success: true,
        purchase: {
          email: 'buyer@example.com',
          variants: 'SOLO_PRO',
          refunded: false,
          chargebacked: false
        }
      })
    }) as any;

    const res1 = await verifyGumroadLicense('VALID_KEY', { fetchImpl: mockSuccessFetch });
    assert.equal(res1.valid, true);
    assert.equal(res1.buyerId, 'buyer@example.com');

    // Mock refunded purchase
    const mockRefundedFetch = async () => ({
      json: async () => ({
        success: true,
        purchase: {
          email: 'buyer@example.com',
          refunded: true,
          chargebacked: false
        }
      })
    }) as any;

    const res2 = await verifyGumroadLicense('REFUNDED_KEY', { fetchImpl: mockRefundedFetch });
    assert.equal(res2.valid, false);
    assert.ok(res2.reason?.includes('refunded or chargebacked'));
  });

  test('5. assertCommercialLicense should throw CommercialLicenseError with Gumroad link when license is missing', async () => {
    const dummyCache = path.join(os.tmpdir(), `nonexistent-cache-${Date.now()}.json`);

    await assert.rejects(
      async () => {
        await assertCommercialLicense({
          licenseKey: undefined,
          cachePath: dummyCache,
          skipNetwork: true
        });
      },
      (err: any) => {
        assert.ok(err instanceof CommercialLicenseError);
        assert.ok(err.message.includes('COMMERCIAL LICENSE ERROR'));
        assert.ok(err.message.includes('https://gumroad.com/l/mcp-router-pro'));
        return true;
      }
    );
  });

  test('6. Clean checkout environment detection & anti-piracy gate validation', () => {
    const secretPath = path.resolve(process.cwd(), '.secrets', 'commercial-signer.private.pem');
    const hasSigningKey = Boolean(process.env.COMMERCIAL_SIGNER_PRIVATE_KEY || fs.existsSync(secretPath));

    if (hasSigningKey) {
      // In developer environment with private key: verify genuine offline token generation against code's embedded public key
      const token = generateOfflineLicenseToken({
        licenseKey: 'MCPLIC-DEV-CHECKOUT',
        buyerId: 'licensed_user@acme.com',
        tier: 'SOLO_PRO',
        machineId: getMachineFingerprint(),
        expiresAt: 'never',
        issuedAt: new Date().toISOString()
      });

      const res = verifyOfflineLicenseToken(token);
      assert.equal(res.valid, true);
      assert.equal(res.buyerId, 'licensed_user@acme.com');
    } else {
      // In clean checkout / CI without private keys: verify that forged tokens are strictly blocked
      const forgedToken = 'MCPLIC.eyJsaWNlbnNlS2V5IjoiRkFLRSJ9.00112233445566778899aabbccddeeff';
      const res = verifyOfflineLicenseToken(forgedToken);
      assert.equal(res.valid, false);
      assert.ok(res.reason?.includes('verification failed'));
    }
  });

});
