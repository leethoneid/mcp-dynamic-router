import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Generates a stable, unique machine fingerprint based on local hardware and OS parameters.
 * Does not read private keys or sensitive user files.
 */
export function getMachineFingerprint(): string {
  const parts: string[] = [
    os.platform(),
    os.arch(),
    os.hostname()
  ];

  const networkInterfaces = os.networkInterfaces();
  const macAddresses: string[] = [];

  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    if (!interfaces) continue;
    for (const iface of interfaces) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macAddresses.push(iface.mac.toLowerCase());
      }
    }
  }

  // Sort to maintain deterministic order across reboots
  macAddresses.sort();
  parts.push(macAddresses.join(';'));

  const raw = parts.join('|');
  return crypto.createHash('sha256').update(raw, 'utf-8').digest('hex').substring(0, 32);
}
