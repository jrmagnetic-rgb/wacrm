ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_instagram_user_id
ON contacts(instagram_user_id);