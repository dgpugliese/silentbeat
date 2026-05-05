-- Phase 3: AEAD-wrap fields that previously stored plaintext or unwrapped data,
-- and add a real passkey credentials table.

ALTER TABLE switches ADD COLUMN duress_slot_wrapped BLOB;

-- Passkey credentials, one row per enrolled authenticator. Multiple per user.
CREATE TABLE passkey_credentials (
  credential_id TEXT PRIMARY KEY,        -- base64url
  user_id TEXT NOT NULL,
  public_key BLOB NOT NULL,              -- COSE public key
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                       -- comma-separated, optional
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_passkey_user ON passkey_credentials(user_id);

-- KV-stored short-lived challenges replace any in-table state we'd otherwise need.
