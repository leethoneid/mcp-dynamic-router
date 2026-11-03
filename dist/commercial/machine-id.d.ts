/**
 * Generates a stable, unique machine fingerprint based on local hardware and OS parameters.
 * Does not read private keys or sensitive user files.
 */
export declare function getMachineFingerprint(): string;
