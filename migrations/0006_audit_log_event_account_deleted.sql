-- Extend audit_log.event CHECK to allow 'account_deleted'.
-- SQLite can't ALTER a CHECK constraint in place, so we rebuild the table.

CREATE TABLE audit_log_new (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  switch_id_hash TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN (
    'switch_created','switch_armed','checkin','release',
    'duress_release','user_purge','recipient_enrolled',
    'test_fire','account_deleted'
  )),
  at INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  signature BLOB NOT NULL
);

INSERT INTO audit_log_new (seq, switch_id_hash, event, at, prev_hash, entry_hash, signature)
SELECT seq, switch_id_hash, event, at, prev_hash, entry_hash, signature FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

UPDATE sqlite_sequence
SET seq = (SELECT COALESCE(MAX(seq), 0) FROM audit_log)
WHERE name = 'audit_log';

CREATE INDEX idx_audit_at ON audit_log(at);
