/**
 * Generates a stable, unique machine fingerprint based on local hardware and OS parameters.
 * Does not read private keys or sensitive user files.
 * Note: Fingerprint depends on network interface MAC addresses and hostname; changing network
 * adapters or cloning a virtual machine produces a different hash and requires license reactivation.
 */
export declare function getMachineFingerprint(): string;
