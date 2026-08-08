# Production Field-Level Encryption System

This folder contains the standalone TypeScript architectural blueprint for implementing Field-Level Encryption using `AES-256-GCM`.

## 11. Backup Strategy

Because data is encrypted **before** being inserted into PostgreSQL, your backup strategy remains identical to a standard unencrypted database setup.
- **pg_dump**: Running `pg_dump` will export `.sql` or `.dump` files containing exclusively ciphertext for sensitive fields.
- **Storage**: Backups can be securely stored on Amazon S3, Google Cloud Storage, or external hard drives without fear of data leakage.
- **Key Separation**: **NEVER** store the `.env` keys in the same location as the database backups. If a VPS provider or hacker compromises the database backups, the data remains cryptographically secure as long as the memory keys are safe.

## 13. Security Checklist

Before deploying this architecture to production, verify the following:

- [ ] **Generate Secure Keys**: Keys must be strictly 32 bytes (256-bit). Use `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` to generate keys.
- [ ] **Store Keys Safely**: `ENCRYPTION_KEY_1` and `SEARCH_BLIND_SALT` must only exist in `.env` files or a managed Secrets Manager (e.g., AWS Secrets Manager).
- [ ] **No Logging**: Ensure your Node.js logger (e.g., Winston, Pino) does NOT accidentally log `process.env` during crash dumps.
- [ ] **Password Hashing**: This AES system is for *reversible* data (PII, Financials). Passwords must still use `bcrypt` or `argon2`.
- [ ] **Data Migration**: Run `migration.ts` during scheduled downtime to encrypt all existing plaintext user rows before switching the live application to the new `UserRepository`.
- [ ] **Index Searchable Hashes**: Ensure `CREATE INDEX idx_users_email_hash ON users (email_hash)` is applied so login queries remain lightning fast for 100,000+ users.
