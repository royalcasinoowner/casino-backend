import { Pool } from 'pg';
import { EncryptionService } from './EncryptionService';

/**
 * Executes a zero-downtime migration to encrypt plaintext data.
 * Usage: ts-node migration.ts
 */
async function runMigration() {
    // Note: Provide actual connection string here for standalone script
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const BATCH_SIZE = 1000;

    console.log("[Migration] Starting field-level encryption migration...");

    try {
        let totalMigrated = 0;
        let hasMore = true;

        while (hasMore) {
            // Find records that don't have an encryption_version yet
            // Assuming old schema had plaintext `email`, `phone` fields
            const query = `
                SELECT id, email, phone 
                FROM users 
                WHERE encryption_version IS NULL OR encryption_version = 0
                LIMIT $1;
            `;
            const result = await pool.query(query, [BATCH_SIZE]);

            if (result.rows.length === 0) {
                hasMore = false;
                break;
            }

            console.log(`[Migration] Processing batch of ${result.rows.length} records...`);

            // Process batch in a transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                for (const row of result.rows) {
                    const encEmail = EncryptionService.encrypt(row.email);
                    const encPhone = EncryptionService.encrypt(row.phone);
                    
                    const hashEmail = EncryptionService.generateSearchHash(row.email);
                    const hashPhone = EncryptionService.generateSearchHash(row.phone);

                    const activeVersion = encEmail?.version || encPhone?.version || 1;

                    await client.query(`
                        UPDATE users 
                        SET email_encrypted = $1, 
                            phone_encrypted = $2,
                            email_hash = $3,
                            phone_hash = $4,
                            encryption_version = $5,
                            email = NULL, -- Delete plaintext data
                            phone = NULL  -- Delete plaintext data
                        WHERE id = $6
                    `, [
                        encEmail?.ciphertext, 
                        encPhone?.ciphertext,
                        hashEmail,
                        hashPhone,
                        activeVersion,
                        row.id
                    ]);
                }

                await client.query('COMMIT');
                totalMigrated += result.rows.length;
                console.log(`[Migration] Migrated ${totalMigrated} records total.`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }

        console.log("[Migration] Migration completed successfully!");
    } catch (err) {
        console.error("[Migration] Fatal Error:", err);
    } finally {
        await pool.end();
    }
}

// runMigration();
