-- Ajouter le tracking des erreurs d'indexation pour éviter les re-tentatives infinies
-- Documents qui échouent sont mis en cooldown de 1h avant réessai

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS last_index_error TEXT;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS last_index_attempt_at TIMESTAMPTZ;
