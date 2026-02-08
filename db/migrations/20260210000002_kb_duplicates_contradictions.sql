-- Migration: Relations entre documents KB (doublons et contradictions)
-- Date: 2026-02-10
-- Description: Table pour stocker les relations de doublons et contradictions entre documents KB

-- ============================================================================
-- TABLE kb_document_relations
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_document_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,

  -- Type de relation
  relation_type VARCHAR(30) NOT NULL CHECK (relation_type IN ('duplicate', 'near_duplicate', 'contradiction', 'related')),
  similarity_score FLOAT,

  -- Détails contradiction
  contradiction_type VARCHAR(50),
  contradiction_severity VARCHAR(20) CHECK (contradiction_severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  source_excerpt TEXT,
  target_excerpt TEXT,
  suggested_resolution TEXT,

  -- Statut de gestion
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed', 'resolved')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Éviter les doublons de relations
  UNIQUE (source_document_id, target_document_id, relation_type)
);

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_relations_source ON kb_document_relations(source_document_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_target ON kb_document_relations(target_document_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_type ON kb_document_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_kb_relations_status ON kb_document_relations(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_kb_relations_severity ON kb_document_relations(contradiction_severity) WHERE contradiction_severity IS NOT NULL;

-- ============================================================================
-- FONCTION: Recherche documents similaires par cosine similarity
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_kb_documents(
  p_document_id UUID,
  p_threshold FLOAT DEFAULT 0.7,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title::TEXT,
    kb.category::TEXT,
    1 - (kb.embedding <=> (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id))::FLOAT AS similarity
  FROM knowledge_base kb
  WHERE kb.id != p_document_id
    AND kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id) IS NOT NULL
    AND 1 - (kb.embedding <=> (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration kb_duplicates_contradictions terminée';
  RAISE NOTICE 'Table kb_document_relations créée';
  RAISE NOTICE 'Fonction find_similar_kb_documents créée';
END $$;
