import * as crypto from 'crypto';
import { keyManager } from './KeyManager';

export interface EncryptedData {
    version: number;
    ciphertext: string; // Stored as base64 'IV:AuthTag:Ciphertext'
}

export class EncryptionService {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly IV_LENGTH = 12; // 96 bits standard for GCM
    private static readonly AUTH_TAG_LENGTH = 16; // 128 bits standard for GCM

    /**
     * Encrypts plaintext using AES-256-GCM with the active key.
     */
    public static encrypt(plaintext: string | undefined | null): EncryptedData | null {
        if (!plaintext) return null;

        const { version, key } = keyManager.getActiveKey();
        const iv = crypto.randomBytes(this.IV_LENGTH);
        const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const authTag = cipher.getAuthTag();

        // Concatenate IV : AuthTag : Ciphertext
        const payload = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

        return {
            version,
            ciphertext: payload
        };
    }

    /**
     * Decrypts ciphertext using AES-256-GCM with the specified key version.
     */
    public static decrypt(payload: string, version: number): string | null {
        if (!payload) return null;

        try {
            const key = keyManager.getKey(version);
            const parts = payload.split(':');

            if (parts.length !== 3) {
                throw new Error("Invalid ciphertext format. Expected IV:AuthTag:Ciphertext");
            }

            const iv = Buffer.from(parts[0], 'base64');
            const authTag = Buffer.from(parts[1], 'base64');
            const encryptedText = parts[2];

            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error(`[EncryptionService] Decryption failed for version ${version}:`, error instanceof Error ? error.message : String(error));
            throw new Error("Data integrity check failed or corrupted ciphertext.");
        }
    }

    /**
     * Generates a deterministic hash for searching encrypted fields (e.g. Email).
     */
    public static generateSearchHash(plaintext: string | undefined | null): string | null {
        if (!plaintext) return null;
        
        const salt = keyManager.getSearchSalt();
        const hmac = crypto.createHmac('sha256', salt);
        hmac.update(plaintext.toLowerCase().trim());
        
        return hmac.digest('hex'); // 64 char hex string
    }
}
