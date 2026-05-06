-- Phase 7 cleanup: drop legacy columns that became inert after Phase 6.
-- - switches.duress_slot (INTEGER): replaced by duress_slot_wrapped (BLOB, AEAD).
-- - switches.payload_key_wrapped (BLOB): never read after Phase 6 split-key.

ALTER TABLE switches DROP COLUMN duress_slot;
ALTER TABLE switches DROP COLUMN payload_key_wrapped;
