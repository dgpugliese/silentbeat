-- SilentBeat schema v1 (Variant A: recipient-held share B)
-- Every column justified in worker/src/lib/schema.md

CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- ulid
  email TEXT NOT NULL UNIQUE,
  passkey_credentials_json TEXT NOT NULL DEFAULT '[]',
  recovery_codes_hashed_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active'
);

CREATE TABLE recipients (
  id TEXT PRIMARY KEY,                    -- ulid
  switch_id TEXT NOT NULL,
  email_ct BLOB NOT NULL,                 -- AEAD ciphertext
  email_iv BLOB NOT NULL,
  email_dek_wrapped BLOB NOT NULL,        -- DEK wrapped by KMS-held KEK
  pubkey_jwk_json TEXT,                   -- recipient's enrollment pubkey (P-256)
  share_b_to_recipient BLOB,              -- ECIES(share_b, recipient_pubkey); server-blind
  enrolled_at INTEGER,
  test_fire_confirmed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending','enrolled','test_confirmed','revoked')) DEFAULT 'pending',
  FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
);

CREATE TABLE switches (
  id TEXT PRIMARY KEY,                    -- ulid; never exposed in public log
  user_id TEXT NOT NULL,
  payload_r2_key TEXT NOT NULL,           -- opaque blob ID in R2
  payload_size_bytes INTEGER NOT NULL,
  share_a BLOB NOT NULL,                  -- server-held key share; rotated on each check-in
  pin_hash_set_json TEXT NOT NULL,        -- {hashes:[h1,h2], salts:[s1,s2]} — defuse/duress order randomized
  duress_slot INTEGER NOT NULL CHECK (duress_slot IN (0,1)),  -- which slot in pin_hash_set is duress; Phase 3 wraps under a Workers Secret so a DB-only dump can't read it
  expiry_at INTEGER NOT NULL,
  timer_seconds INTEGER NOT NULL,         -- original timer length, used to recompute on check-in
  last_checkin_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','armed','released','duress_purged','user_purged')) DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_switches_user ON switches(user_id);
CREATE INDEX idx_switches_armed_expiry ON switches(status, expiry_at) WHERE status = 'armed';

CREATE TABLE checkins (
  id TEXT PRIMARY KEY,
  switch_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('defuse','duress','test_fire')),
  at INTEGER NOT NULL,
  ip_hash TEXT,
  ua_hash TEXT,
  FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
);

CREATE INDEX idx_checkins_switch ON checkins(switch_id, at DESC);

-- Public transparency log: append-only, signed per-entry by operator key.
-- switch_id_hash hides which switch the entry pertains to; users mirror this table to detect suppression.
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  switch_id_hash TEXT NOT NULL,           -- HMAC(switch_id, public_salt)
  event TEXT NOT NULL CHECK (event IN ('switch_created','switch_armed','checkin','release','duress_release','user_purge','recipient_enrolled','test_fire')),
  at INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,                -- merkle-style chain
  entry_hash TEXT NOT NULL,
  signature BLOB NOT NULL                 -- Ed25519 over (seq||event||at||prev_hash||entry_hash)
);

CREATE INDEX idx_audit_at ON audit_log(at);

-- Magic-link recovery tokens for lost-passkey flow
CREATE TABLE magic_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','recovery')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
