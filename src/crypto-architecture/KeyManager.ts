import * as crypto from 'crypto';

export class KeyManager {
    private keys: Map<number, Buffer> = new Map();
    private activeVersion: number;
    private searchBlindSalt: Buffer;

    constructor() {
        // Load versioned keys from environment
        // e.g., ENCRYPTION_KEY_1, ENCRYPTION_KEY_2
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('ENCRYPTION_KEY_') && value) {
                const version = parseInt(key.replace('ENCRYPTION_KEY_', ''), 10);
                if (!isNaN(version)) {
                    const keyBuffer = Buffer.from(value, 'base64');
                    if (keyBuffer.length !== 32) {
                        throw new Error(`Invalid key length for ${key}. Must be 32 bytes (256-bit) for AES-256-GCM.`);
                    }
                    this.keys.set(version, keyBuffer);
                }
            }
        }

        const activeVersionStr = process.env.ACTIVE_ENCRYPTION_VERSION;
        if (!activeVersionStr) throw new Error("ACTIVE_ENCRYPTION_VERSION is not defined in .env");
        this.activeVersion = parseInt(activeVersionStr, 10);

        if (!this.keys.has(this.activeVersion)) {
            throw new Error(`Active key version ${this.activeVersion} is missing from environment.`);
        }

        const saltBase64 = process.env.SEARCH_BLIND_SALT;
        if (!saltBase64) throw new Error("SEARCH_BLIND_SALT is not defined in .env");
        this.searchBlindSalt = Buffer.from(saltBase64, 'base64');
    }

    /**
     * Retrieves the key buffer for a specific version.
     */
    public getKey(version: number): Buffer {
        const key = this.keys.get(version);
        if (!key) throw new Error(`Encryption key for version ${version} not found.`);
        return key;
    }

    /**
     * Gets the current active key for new encryptions.
     */
    public getActiveKey(): { version: number; key: Buffer } {
        return {
            version: this.activeVersion,
            key: this.getKey(this.activeVersion)
        };
    }

    /**
     * Gets the blind salt used for deterministic searchable hashes.
     */
    public getSearchSalt(): Buffer {
        return this.searchBlindSalt;
    }
}

// Singleton instance
export const keyManager = new KeyManager();
