-- Phase 11: premium tier. users.plan gates feature limits at the
-- application layer (max switches, max payload size, max timer length).
-- Subscription metadata is stored opaquely; we don't model the provider's
-- state machine, just remember the latest webhook says.

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium'));
ALTER TABLE users ADD COLUMN ls_customer_id TEXT;
ALTER TABLE users ADD COLUMN ls_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT;        -- raw status from provider, e.g. 'active','cancelled','expired','past_due'
ALTER TABLE users ADD COLUMN current_period_end INTEGER;      -- ms epoch; when the paid window ends

CREATE INDEX idx_users_ls_customer ON users(ls_customer_id);
CREATE INDEX idx_users_ls_subscription ON users(ls_subscription_id);
