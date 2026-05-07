-- Phase 10: recipients become first-class per-account entities so a user can
-- enroll someone once and target them with N switches. Also lays the storage
-- for WebAuthn-PRF-backed recipient credentials (no JSON rescue file in the
-- common case; passkey + PRF unlocks an ECDH privkey at decrypt time).
--
-- We KEEP the legacy per-switch `recipients` table (and its FKs) untouched so
-- already-armed switches continue to function while Phase 10 lands. Switches
-- created via the new flow set switches.account_recipient_id and leave the old
-- recipients row absent. Eventually the old table will be dropped in a cleanup
-- migration once no live switches reference it.

CREATE TABLE account_recipients (
  id TEXT PRIMARY KEY,                    -- ulid
  owner_user_id TEXT NOT NULL,
  display_name TEXT,                      -- optional, "Sarah" / "Mom" / etc.
  email_ct BLOB NOT NULL,                 -- AEAD(email) under master KEK; aad = id
  invite_token_hash TEXT,                 -- one-time enrollment token (sha256 hex); cleared on enroll
  invite_token_expires_at INTEGER,
  invite_consumed_at INTEGER,
  -- WebAuthn credential bound to this recipient (NOT a SilentBeat user account).
  -- Recipient signs in to the recipient enrollment / decrypt page using this passkey.
  passkey_credential_id TEXT,             -- base64url id (unique)
  passkey_public_key BLOB,                -- COSE pubkey
  passkey_counter INTEGER NOT NULL DEFAULT 0,
  passkey_transports TEXT,                -- comma-separated
  -- PRF extension support: per-recipient salt is mixed with the credential to
  -- produce a deterministic 32-byte secret. That secret AES-GCM-decrypts the
  -- recipient's ECDH privkey at decrypt time. Privkey itself is stored encrypted
  -- so even a full DB dump doesn't yield it.
  prf_salt BLOB,                          -- 32 random bytes
  enc_privkey_jwk_ct BLOB,                -- AES-GCM(privkey JWK json) under PRF-derived key
  enc_privkey_iv BLOB,                    -- IV for the above
  pubkey_jwk_json TEXT,                   -- recipient's ECDH P-256 pubkey (JWK), public
  status TEXT NOT NULL CHECK (status IN ('invited','enrolled','revoked')) DEFAULT 'invited',
  created_at INTEGER NOT NULL,
  enrolled_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_acct_recip_owner ON account_recipients(owner_user_id);
CREATE INDEX idx_acct_recip_passkey ON account_recipients(passkey_credential_id);

-- Switches now optionally point at an account_recipient. If set, the switch is
-- expected to use the new flow (account_recipient holds the pubkey + passkey).
-- Old switches with no value here use the legacy per-switch `recipients` table.
ALTER TABLE switches ADD COLUMN account_recipient_id TEXT REFERENCES account_recipients(id);

CREATE INDEX idx_switches_account_recipient ON switches(account_recipient_id);
