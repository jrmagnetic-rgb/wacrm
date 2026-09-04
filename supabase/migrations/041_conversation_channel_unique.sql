-- ============================================================
-- CONVERSATION CHANNEL UNIQUE INDEX
-- Permite uma conversa por contato em cada canal.
-- ============================================================

DROP INDEX IF EXISTS idx_conversations_account_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_channel
  ON conversations (account_id, contact_id, channel);
