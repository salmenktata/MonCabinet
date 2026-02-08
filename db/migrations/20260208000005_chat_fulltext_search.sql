-- Migration: Ajouter index full-text pour la recherche dans les messages chat
-- Date: 2026-02-08
-- Sprint: 6 - Performance et Polish

-- Index full-text pour le contenu des messages (français)
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_fts_fr
ON chat_messages USING gin(to_tsvector('french', content));

-- Index full-text pour le contenu des messages (arabe)
-- Note: PostgreSQL supporte l'arabe via la configuration 'simple' ou 'arabic' si disponible
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_fts_simple
ON chat_messages USING gin(to_tsvector('simple', content));

-- Index pour les recherches par date
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
ON chat_messages(created_at DESC);

-- Index composé pour les recherches filtrées par rôle et date
CREATE INDEX IF NOT EXISTS idx_chat_messages_role_created_at
ON chat_messages(role, created_at DESC);

-- Index pour la jointure avec conversations
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id
ON chat_messages(conversation_id);

-- Fonction de recherche full-text bilingue
CREATE OR REPLACE FUNCTION search_chat_messages(
  search_query TEXT,
  p_user_id UUID,
  p_role TEXT DEFAULT NULL,
  p_date_from TIMESTAMP DEFAULT NULL,
  p_date_to TIMESTAMP DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  conversation_title TEXT,
  role TEXT,
  content TEXT,
  created_at TIMESTAMP,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    c.titre AS conversation_title,
    m.role,
    m.content,
    m.created_at,
    ts_rank(
      to_tsvector('french', m.content),
      plainto_tsquery('french', search_query)
    ) AS rank
  FROM chat_messages m
  INNER JOIN chat_conversations c ON c.id = m.conversation_id
  WHERE c.user_id = p_user_id
    AND (
      to_tsvector('french', m.content) @@ plainto_tsquery('french', search_query)
      OR to_tsvector('simple', m.content) @@ plainto_tsquery('simple', search_query)
      OR m.content ILIKE '%' || search_query || '%'
    )
    AND (p_role IS NULL OR m.role = p_role)
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Commentaires
COMMENT ON INDEX idx_chat_messages_content_fts_fr IS 'Index full-text français pour recherche dans les messages';
COMMENT ON INDEX idx_chat_messages_content_fts_simple IS 'Index full-text simple pour recherche multilingue';
COMMENT ON FUNCTION search_chat_messages IS 'Fonction de recherche full-text bilingue dans les messages chat';
