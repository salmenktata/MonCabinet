-- Persistance des préférences UI par utilisateur (état sidebar collapsed, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;
