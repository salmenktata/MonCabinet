/**
 * Migration: Tables pour le chat assistant IA (Qadhya)
 * Date: 2026-02-06
 * Description: Tables pour stocker l'historique des conversations chat
 */

-- ============================================================================
-- TABLE CHAT_CONVERSATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_dossier ON chat_conversations(dossier_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

-- Trigger updated_at
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE CHAT_MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB, -- Documents/sections cités dans la réponse
  tokens_used INTEGER, -- Nombre de tokens utilisés
  model TEXT, -- Modèle utilisé (claude-3-5-sonnet, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Créer une nouvelle conversation
CREATE OR REPLACE FUNCTION create_chat_conversation(
  p_user_id UUID,
  p_dossier_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  INSERT INTO chat_conversations (user_id, dossier_id, title)
  VALUES (p_user_id, p_dossier_id, p_title)
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Ajouter un message à une conversation
CREATE OR REPLACE FUNCTION add_chat_message(
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_sources JSONB DEFAULT NULL,
  p_tokens_used INTEGER DEFAULT NULL,
  p_model TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO chat_messages (conversation_id, role, content, sources, tokens_used, model)
  VALUES (p_conversation_id, p_role, p_content, p_sources, p_tokens_used, p_model)
  RETURNING id INTO v_message_id;

  -- Mettre à jour la conversation
  UPDATE chat_conversations
  SET updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- Récupérer l'historique d'une conversation (derniers N messages)
CREATE OR REPLACE FUNCTION get_conversation_history(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  content TEXT,
  sources JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.role, m.content, m.sources, m.created_at
  FROM chat_messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Compter les messages d'une conversation
CREATE OR REPLACE FUNCTION count_conversation_messages(p_conversation_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM chat_messages
  WHERE conversation_id = p_conversation_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Tables chat créées avec succès!';
  RAISE NOTICE '💬 Tables: chat_conversations, chat_messages';
END $$;
