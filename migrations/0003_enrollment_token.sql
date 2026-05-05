-- Phase 3 audit follow-up: bind recipient enrollment to a one-time token sent
-- via the enrollment email. Without this, anyone who learns recipient.id can
-- POST /api/recipients/:id/enroll and hijack the enrollment.

ALTER TABLE recipients ADD COLUMN enrollment_token_hash TEXT;
ALTER TABLE recipients ADD COLUMN enrollment_token_consumed_at INTEGER;
