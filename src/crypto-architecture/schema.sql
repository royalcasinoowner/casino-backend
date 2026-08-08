-- PostgreSQL Schema for Field-Level Encryption
-- This schema ensures PII and sensitive data is strictly stored as encrypted base64 text.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    
    -- Unencrypted Identifiers & Game State
    user_id VARCHAR(255) UNIQUE NOT NULL,       -- Internal UUID or unique player code
    username VARCHAR(255) UNIQUE NOT NULL,      -- Plaintext for leaderboards and UI
    balance NUMERIC(15, 2) DEFAULT 0,           -- Plaintext for high-frequency game math
    
    -- Encrypted PII Fields (Stored as IV:AuthTag:Ciphertext Base64 string)
    email_encrypted TEXT,
    phone_encrypted TEXT,
    full_name_encrypted TEXT,
    address_encrypted TEXT,
    bank_account_encrypted TEXT,
    ifsc_encrypted TEXT,
    upi_encrypted TEXT,
    wallet_address_encrypted TEXT,
    kyc_data_encrypted TEXT,                    -- Can store complex JSON payload encrypted
    
    -- Searchable Hashes (HMAC-SHA256)
    email_hash VARCHAR(64),                     -- Allows querying: WHERE email_hash = $1
    phone_hash VARCHAR(64),
    
    -- Cryptographic Metadata
    encryption_version INTEGER DEFAULT 1,       -- Tracks which Key Version was used
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing Strategy
-- We index the Hashes to allow ultra-fast exact-match lookups for millions of users.
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users (email_hash);
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users (phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users (user_id);


-- Audit Logging Schema
-- Essential for tracking Admin decryptions to prevent silent insider threats.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id SERIAL PRIMARY KEY,
    admin_uid VARCHAR(255) NOT NULL,            -- Admin who requested the data
    action VARCHAR(255) NOT NULL,               -- e.g., 'DECRYPT_USER_PROFILE'
    target_user_id VARCHAR(255),                -- The user whose data was decrypted
    accessed_fields JSONB,                      -- e.g., '["email", "phone", "kyc"]'
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs (admin_uid);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_logs (target_user_id);
