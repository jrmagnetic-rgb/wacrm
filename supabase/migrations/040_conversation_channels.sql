-- ============================================================
-- CONVERSATION CHANNELS
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE conversations
ADD CONSTRAINT conversations_channel_check
CHECK (channel IN ('whatsapp', 'instagram'));

CREATE INDEX IF NOT EXISTS idx_conversations_channel
ON conversations(channel);
