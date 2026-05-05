-- Phase 5: store the client's payload encryption key wrapped under the master KEK.
-- This is Variant B (server-held key) for now — release emails ship the unwrapped K.
-- Phase 6 will split K into shareA + ECIES(shareB, recipient_pubkey) and drop this column.

ALTER TABLE switches ADD COLUMN payload_key_wrapped BLOB;
