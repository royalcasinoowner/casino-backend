import { Pool } from 'pg';
import { EncryptionService } from './EncryptionService';

export interface UserInput {
    userId: string;
    username: string;
    email?: string;
    phone?: string;
    kycData?: object;
}

export interface UserDecrypted {
    id: number;
    userId: string;
    username: string;
    balance: number;
    email: string | null;
    phone: string | null;
    kycData: object | null;
    encryptionVersion: number;
}

export class UserRepository {
    private pool: Pool;

    constructor(dbPool: Pool) {
        this.pool = dbPool;
    }

    /**
     * Creates a new user, transparently encrypting PII fields before insertion.
     */
    public async createUser(input: UserInput): Promise<number> {
        const encryptedEmail = EncryptionService.encrypt(input.email);
        const encryptedPhone = EncryptionService.encrypt(input.phone);
        const encryptedKyc = EncryptionService.encrypt(input.kycData ? JSON.stringify(input.kycData) : undefined);

        const emailHash = EncryptionService.generateSearchHash(input.email);
        const phoneHash = EncryptionService.generateSearchHash(input.phone);

        // Assume all fields are encrypted with the same active version
        const version = encryptedEmail?.version || encryptedPhone?.version || 1;

        const query = `
            INSERT INTO users (
                user_id, username, 
                email_encrypted, phone_encrypted, kyc_data_encrypted, 
                email_hash, phone_hash, encryption_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `;

        const values = [
            input.userId,
            input.username,
            encryptedEmail?.ciphertext || null,
            encryptedPhone?.ciphertext || null,
            encryptedKyc?.ciphertext || null,
            emailHash,
            phoneHash,
            version
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0].id;
    }

    /**
     * Retrieves a user by their plaintext email by querying the search hash, 
     * then decrypts the PII fields.
     */
    public async getUserByEmail(email: string): Promise<UserDecrypted | null> {
        const emailHash = EncryptionService.generateSearchHash(email);
        if (!emailHash) return null;

        const query = `SELECT * FROM users WHERE email_hash = $1 LIMIT 1;`;
        const result = await this.pool.query(query, [emailHash]);

        if (result.rows.length === 0) return null;
        return this.mapToDecryptedUser(result.rows[0]);
    }

    /**
     * Retrieves a user by ID and decrypts their fields.
     */
    public async getUserById(id: number): Promise<UserDecrypted | null> {
        const query = `SELECT * FROM users WHERE id = $1 LIMIT 1;`;
        const result = await this.pool.query(query, [id]);

        if (result.rows.length === 0) return null;
        return this.mapToDecryptedUser(result.rows[0]);
    }

    /**
     * Helper method to map a raw DB row to a decrypted user object.
     */
    private mapToDecryptedUser(row: any): UserDecrypted {
        const version = row.encryption_version || 1;

        const decryptedEmail = EncryptionService.decrypt(row.email_encrypted, version);
        const decryptedPhone = EncryptionService.decrypt(row.phone_encrypted, version);
        const decryptedKycStr = EncryptionService.decrypt(row.kyc_data_encrypted, version);

        let kycData = null;
        if (decryptedKycStr) {
            try { kycData = JSON.parse(decryptedKycStr); } catch (e) { /* corrupted JSON */ }
        }

        return {
            id: row.id,
            userId: row.user_id,
            username: row.username,
            balance: parseFloat(row.balance),
            email: decryptedEmail,
            phone: decryptedPhone,
            kycData,
            encryptionVersion: version
        };
    }
}
