-- Migration: Métadonnées structurées des pages web
-- Date: 2026-02-10
-- Description: Table pour stocker les métadonnées juridiques extraites par LLM

-- ============================================================================
-- TABLE web_page_structured_metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_page_structured_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE UNIQUE,

  -- Champs communs
  document_type VARCHAR(100),
  document_date DATE,
  document_number VARCHAR(200),
  title_official TEXT,
  language VARCHAR(5),

  -- Jurisprudence
  tribunal VARCHAR(200),
  chambre VARCHAR(200),
  decision_number VARCHAR(200),
  decision_date DATE,
  parties JSONB,

  -- Législation
  text_type VARCHAR(100),
  text_number VARCHAR(200),
  publication_date DATE,
  effective_date DATE,
  jort_reference VARCHAR(200),

  -- Doctrine
  author TEXT,
  publication_name TEXT,
  keywords JSONB DEFAULT '[]'::jsonb,
  abstract TEXT,

  -- Confiance et provenance
  extraction_confidence FLOAT CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  llm_provider TEXT,
  llm_model TEXT,

  -- Audit
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_web_page_metadata_page ON web_page_structured_metadata(web_page_id);
CREATE INDEX IF NOT EXISTS idx_web_page_metadata_type ON web_page_structured_metadata(document_type) WHERE document_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_page_metadata_tribunal ON web_page_structured_metadata(tribunal) WHERE tribunal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_page_metadata_date ON web_page_structured_metadata(document_date) WHERE document_date IS NOT NULL;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration web_page_metadata terminée';
  RAISE NOTICE 'Table web_page_structured_metadata créée';
END $$;
