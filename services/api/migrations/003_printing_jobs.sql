ALTER TABLE ai_requests ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE ai_requests ADD COLUMN task text NOT NULL DEFAULT 'system';
ALTER TABLE ai_requests ADD COLUMN input_hash text;
