ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK(status IN ('active','blocked','deleted'));
CREATE TABLE manual_subscriptions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),plan_id text NOT NULL REFERENCES plans(id),request_id uuid UNIQUE NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),ends_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX manual_subscription_active_user ON manual_subscriptions(user_id) WHERE status='active';
ALTER TABLE licenses ADD COLUMN manual_subscription_id uuid REFERENCES manual_subscriptions(id);
CREATE INDEX licenses_manual_subscription ON licenses(manual_subscription_id);
