-- Phase 10d: switches created against an account_recipient store the ECIES
-- envelope (encrypted to the recipient's enrollment pubkey) directly on the
-- switch row, so we don't need a per-switch recipients row at all in the new
-- flow. Old switches continue to use recipients.share_b_to_recipient.

ALTER TABLE switches ADD COLUMN encrypted_share_b_json TEXT;
