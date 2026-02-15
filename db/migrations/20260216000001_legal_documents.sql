-- Migration: Couche Document Juridique
-- Tables: legal_documents, web_pages_documents, legal_document_amendments
-- POC: Code Pénal Tunisien (9anoun.tn)

-- =============================================================================
-- TABLE: legal_documents
-- =============================================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identité document
  citation_key TEXT UNIQUE NOT NULL,
  document_type TEXT CHECK (document_type IN (
    'code', 'loi', 'decret', 'arrete', 'circulaire',
    'jurisprudence', 'doctrine', 'guide', 'formulaire', 'autre'
  )),
  official_title_ar TEXT,
  official_title_fr TEXT,

  -- Multi-catégorie
  primary_category TEXT NOT NULL,
  secondary_categories TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  legal_domains TEXT[] DEFAULT '{}',

  -- Source canonique
  canonical_source_id UUID REFERENCES web_sources(id),
  source_urls JSONB DEFAULT '[]',

  -- Consolidation
  consolidation_status TEXT DEFAULT 'pending'
    CHECK (consolidation_status IN ('pending', 'partial', 'complete')),
  consolidated_text TEXT,
  page_count INTEGER DEFAULT 0,
  structure JSONB,

  -- Cycle de vie juridique
  is_active BOOLEAN DEFAULT true,
  is_abrogated BOOLEAN DEFAULT false,
  abrogation_date DATE,
  abrogated_by_id UUID REFERENCES legal_documents(id),
  effective_date DATE,
  publication_date DATE,
  jort_reference TEXT,

  -- Fraîcheur
  last_verified_at TIMESTAMPTZ,
  last_content_change_at TIMESTAMPTZ,
  staleness_days INTEGER GENERATED ALWAYS AS (
    EXTRACT(DAY FROM NOW() - COALESCE(last_verified_at, created_at))
  ) STORED,

  -- Lien KB
  knowledge_base_id UUID REFERENCES knowledge_base(id),
  is_canonical BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: web_pages_documents (N:M pages <-> documents)
-- =============================================================================
CREATE TABLE IF NOT EXISTS web_pages_documents (
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
  legal_document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  page_order INTEGER,
  article_number TEXT,
  contribution_type TEXT DEFAULT 'article'
    CHECK (contribution_type IN ('full_document', 'article', 'chapter', 'section', 'annex')),
  is_primary_page BOOLEAN DEFAULT false,
  PRIMARY KEY (web_page_id, legal_document_id)
);

-- =============================================================================
-- TABLE: legal_document_amendments (chaîne d'amendements)
-- =============================================================================
CREATE TABLE IF NOT EXISTS legal_document_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_document_id UUID NOT NULL REFERENCES legal_documents(id),
  amending_document_id UUID REFERENCES legal_documents(id),
  amending_law_reference TEXT,
  amendment_date DATE,
  amendment_scope TEXT CHECK (amendment_scope IN (
    'total_replacement', 'partial_modification', 'addition', 'deletion'
  )),
  affected_articles TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEX
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_legal_docs_citation ON legal_documents(citation_key);
CREATE INDEX IF NOT EXISTS idx_legal_docs_category ON legal_documents(primary_category);
CREATE INDEX IF NOT EXISTS idx_legal_docs_categories ON legal_documents USING GIN(secondary_categories);
CREATE INDEX IF NOT EXISTS idx_legal_docs_active ON legal_documents(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_legal_docs_canonical ON legal_documents(is_canonical) WHERE is_canonical;
CREATE INDEX IF NOT EXISTS idx_legal_docs_abrogated ON legal_documents(is_abrogated);
CREATE INDEX IF NOT EXISTS idx_wpd_document ON web_pages_documents(legal_document_id);
CREATE INDEX IF NOT EXISTS idx_wpd_article ON web_pages_documents(article_number);
CREATE INDEX IF NOT EXISTS idx_amendments_original ON legal_document_amendments(original_document_id);
CREATE INDEX IF NOT EXISTS idx_amendments_amending ON legal_document_amendments(amending_document_id);

-- =============================================================================
-- FUNCTION: search_kb_document_aware
-- Recherche vectorielle enrichie avec contexte document juridique
-- =============================================================================
CREATE OR REPLACE FUNCTION search_kb_document_aware(
  query_embedding vector,
  p_categories TEXT[] DEFAULT NULL,
  p_include_abrogated BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
  kb_id UUID,
  title TEXT,
  content TEXT,
  similarity FLOAT,
  citation_key TEXT,
  is_abrogated BOOLEAN,
  is_canonical BOOLEAN,
  article_number TEXT,
  last_verified_at TIMESTAMPTZ,
  document_type TEXT,
  primary_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbc.knowledge_base_id AS kb_id,
    kb.title,
    kbc.content,
    (1 - (kbc.embedding <=> query_embedding))::FLOAT AS similarity,
    ld.citation_key,
    COALESCE(ld.is_abrogated, false) AS is_abrogated,
    COALESCE(ld.is_canonical, false) AS is_canonical,
    (kbc.metadata->>'articleNumber')::TEXT AS article_number,
    ld.last_verified_at,
    ld.document_type,
    COALESCE(ld.primary_category, kb.category) AS primary_category
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  LEFT JOIN legal_documents ld ON kb.id = ld.knowledge_base_id
  WHERE kb.is_indexed = true
    -- Filtre abrogation
    AND (p_include_abrogated OR COALESCE(ld.is_abrogated, false) = false)
    -- Filtre catégories (multi-catégorie)
    AND (
      p_categories IS NULL
      OR kb.category = ANY(p_categories)
      OR ld.primary_category = ANY(p_categories)
      OR ld.secondary_categories && p_categories
    )
  ORDER BY
    -- Préférer documents canoniques
    COALESCE(ld.is_canonical, false) DESC,
    -- Puis par similarité
    kbc.embedding <=> query_embedding ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- COLONNE authority_score sur web_sources (Phase 2)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'web_sources' AND column_name = 'authority_score'
  ) THEN
    ALTER TABLE web_sources ADD COLUMN authority_score FLOAT DEFAULT 0.5;
  END IF;
END $$;
