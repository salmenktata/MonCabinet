-- Migration: Ajout du résumé automatique pour les conversations longues
-- Permet de préserver le contexte des conversations de plus de 10 messages

-- =============================================================================
-- ALTER TABLE: chat_conversations
-- =============================================================================
-- Ajoute les colonnes pour stocker le résumé de conversation

ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS summary_message_count INTEGER DEFAULT 0;

-- Index pour identifier les conversations qui nécessitent un résumé
CREATE INDEX IF NOT EXISTS idx_chat_conversations_summary_needed
ON chat_conversations (user_id, id)
WHERE summary IS NULL;

-- Commentaires
COMMENT ON COLUMN chat_conversations.summary IS
'Résumé automatique de la conversation généré après 10+ messages pour préserver le contexte';

COMMENT ON COLUMN chat_conversations.summary_updated_at IS
'Date de la dernière mise à jour du résumé';

COMMENT ON COLUMN chat_conversations.summary_message_count IS
'Nombre de messages inclus dans le résumé actuel (utilisé pour le résumé incrémental)';
