-- Mantém lookup de direitos de uso restrito à conta/assinatura com histórico crescente.
CREATE INDEX IF NOT EXISTS payments_active_subscription ON payments(subscription_id,period_end DESC,period_start) WHERE status='approved';
CREATE INDEX IF NOT EXISTS subscriptions_user_plan ON subscriptions(user_id,plan_id,created_at DESC);
CREATE INDEX IF NOT EXISTS licenses_user ON licenses(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS credit_orders_user ON credit_orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_requests_running_wallet ON ai_requests(wallet_key,created_at) WHERE status='running';
