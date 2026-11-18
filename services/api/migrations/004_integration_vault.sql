CREATE TABLE integration_credentials(name text PRIMARY KEY,encrypted_value text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE credential_history(id bigserial PRIMARY KEY,name text NOT NULL,encrypted_before text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX credential_history_name ON credential_history(name,id DESC);
CREATE TABLE ai_routing_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),config jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_event_recent ON audit_log(event,id DESC);
UPDATE provider_credentials SET last_four='****';
