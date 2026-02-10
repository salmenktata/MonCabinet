-- Migration: Stratégie arabe uniquement pour la KB du RAG
-- Date: 2026-02-12
-- Description: Ajoute un filtre kb.language = 'ar' dans les fonctions de recherche KB
-- Réversible: Supprimer la condition AND kb.language = 'ar' des fonctions

-- ============================================================================
-- 1. Mettre à jour search_knowledge_base() avec filtre arabe
-- ============================================================================

DROP FUNCTION IF EXISTS search_knowledge_base(vector, TEXT, TEXT, INTEGER, FLOAT);

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  knowledge_base_id UUID,
  chunk_id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  subcategory VARCHAR(50),
  language VARCHAR(5),
  chunk_content TEXT,
  chunk_index INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS knowledge_base_id,
    c.id AS chunk_id,
    kb.title,
    kb.description,
    kb.category,
    kb.subcategory,
    kb.language,
    c.content AS chunk_content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_base_chunks c
  JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
  WHERE kb.is_active = TRUE
    AND kb.is_indexed = TRUE
    AND kb.language = 'ar'
    AND (p_category IS NULL OR kb.category = p_category)
    AND (p_subcategory IS NULL OR kb.subcategory = p_subcategory)
    AND (1 - (c.embedding <=> query_embedding)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_knowledge_base(vector, TEXT, TEXT, INTEGER, FLOAT) IS
  'Recherche sémantique KB - arabe uniquement. Accepte Ollama (1024) et OpenAI (1536).';

-- ============================================================================
-- 2. Mettre à jour search_kb_with_legal_filters() avec filtre arabe
-- ============================================================================

CREATE OR REPLACE FUNCTION search_kb_with_legal_filters(
  p_embedding vector(1024),
  p_similarity_threshold FLOAT DEFAULT 0.65,
  p_limit INTEGER DEFAULT 10,
  p_tribunal_code TEXT DEFAULT NULL,
  p_chambre_code TEXT DEFAULT NULL,
  p_domain_code TEXT DEFAULT NULL,
  p_doc_type_code TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_language VARCHAR(5) DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT NULL
)
RETURNS TABLE (
  kb_id UUID,
  title TEXT,
  category TEXT,
  similarity FLOAT,
  tribunal_code TEXT,
  tribunal_label_ar TEXT,
  tribunal_label_fr TEXT,
  chambre_code TEXT,
  chambre_label_ar TEXT,
  chambre_label_fr TEXT,
  decision_date DATE,
  decision_number TEXT,
  legal_basis TEXT[],
  extraction_confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS kb_id,
    kb.title,
    kb.category,
    (1 - (kb_emb.embedding <=> p_embedding))::FLOAT AS similarity,
    meta.tribunal_code,
    trib_tax.label_ar AS tribunal_label_ar,
    trib_tax.label_fr AS tribunal_label_fr,
    meta.chambre_code,
    chambre_tax.label_ar AS chambre_label_ar,
    chambre_tax.label_fr AS chambre_label_fr,
    meta.decision_date,
    meta.decision_number,
    meta.legal_basis,
    meta.extraction_confidence
  FROM knowledge_base kb
  INNER JOIN kb_embeddings kb_emb ON kb.id = kb_emb.knowledge_base_id
  LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
  LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
  LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
  WHERE
    kb.is_indexed = true
    AND kb.is_active = true
    AND kb.language = 'ar'
    AND (1 - (kb_emb.embedding <=> p_embedding)) >= p_similarity_threshold
    AND (p_tribunal_code IS NULL OR meta.tribunal_code = p_tribunal_code)
    AND (p_chambre_code IS NULL OR meta.chambre_code = p_chambre_code)
    AND (p_domain_code IS NULL OR kb.taxonomy_domain_code = p_domain_code)
    AND (p_doc_type_code IS NULL OR kb.taxonomy_document_type_code = p_doc_type_code)
    AND (p_date_from IS NULL OR meta.decision_date >= p_date_from OR meta.document_date >= p_date_from)
    AND (p_date_to IS NULL OR meta.decision_date <= p_date_to OR meta.document_date <= p_date_to)
    AND (p_language IS NULL OR meta.language = p_language OR meta.language = 'bi')
    AND (p_min_confidence IS NULL OR meta.extraction_confidence >= p_min_confidence)
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Index sur language pour performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_language_arabic
  ON knowledge_base(language)
  WHERE language = 'ar' AND is_active = true AND is_indexed = true;
