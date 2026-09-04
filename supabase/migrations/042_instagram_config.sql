-- ============================================================
-- INSTAGRAM_CONFIG
-- Configuração da integração oficial Meta Instagram Messaging
-- ============================================================

CREATE TABLE IF NOT EXISTS instagram_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE instagram_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own Instagram config"
ON instagram_config;

CREATE POLICY "Users can manage own Instagram config"
ON instagram_config
FOR ALL
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_instagram_config_user_id
ON instagram_config(user_id);
