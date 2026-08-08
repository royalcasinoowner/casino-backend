import { EncryptionService } from './EncryptionService';

// Mock the KeyManager for testing purposes
jest.mock('./KeyManager', () => {
    return {
        keyManager: {
            getActiveKey: () => ({
                version: 1,
                key: Buffer.from('12345678901234567890123456789012') // 32 bytes
            }),
            getKey: (version: number) => {
                if (version === 1) return Buffer.from('12345678901234567890123456789012');
                if (version === 2) return Buffer.from('22222222222222222222222222222222');
                throw new Error("Key not found");
            },
            getSearchSalt: () => Buffer.from('somesalt', 'utf8')
        }
    };
});

describe('EncryptionService', () => {
    const PII_DATA = "john.doe@example.com";

    it('should correctly encrypt and decrypt data', () => {
        const encrypted = EncryptionService.encrypt(PII_DATA);
        expect(encrypted).not.toBeNull();
        expect(encrypted?.ciphertext).toContain(':'); // IV:AuthTag:Ciphertext

        const decrypted = EncryptionService.decrypt(encrypted!.ciphertext, encrypted!.version);
        expect(decrypted).toBe(PII_DATA);
    });

    it('should fail decryption if auth tag is tampered with', () => {
        const encrypted = EncryptionService.encrypt(PII_DATA);
        
        // Tamper with the ciphertext payload
        const parts = encrypted!.ciphertext.split(':');
        // Modify the auth tag (part 1)
        parts[1] = Buffer.from('tampered_auth_tag_data_1234').toString('base64').substring(0, 24);
        
        const tamperedCiphertext = parts.join(':');

        expect(() => {
            EncryptionService.decrypt(tamperedCiphertext, encrypted!.version);
        }).toThrow("Data integrity check failed or corrupted ciphertext.");
    });

    it('should fail decryption if wrong key version is used', () => {
        const encrypted = EncryptionService.encrypt(PII_DATA);

        // Attempt to decrypt Version 1 ciphertext using Version 2 key
        expect(() => {
            EncryptionService.decrypt(encrypted!.ciphertext, 2);
        }).toThrow("Data integrity check failed or corrupted ciphertext.");
    });

    it('should generate consistent hashes for searchable fields', () => {
        const hash1 = EncryptionService.generateSearchHash("john.doe@example.com");
        const hash2 = EncryptionService.generateSearchHash("john.doe@example.com");
        const hash3 = EncryptionService.generateSearchHash("JOHN.DOE@example.com"); // Case insensitive

        expect(hash1).toBe(hash2);
        expect(hash1).toBe(hash3);
        expect(hash1).toHaveLength(64); // SHA-256 hex string
    });
});
