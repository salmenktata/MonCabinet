-- Migration: Scores de qualité pour la base de connaissances
-- Date: 2026-02-10
-- Description: Ajoute les champs d'évaluation qualité aux documents KB

-- ============================================================================
-- COLONNES QUALITÉ SUR knowledge_base
-- ============================================================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS quality_clarity INTEGER,
  ADD COLUMN IF NOT EXISTS quality_structure INTEGER,
  ADD COLUMN IF NOT EXISTS quality_completeness INTEGER,
  ADD COLUMN IF NOT EXISTS quality_reliability INTEGER,
  ADD COLUMN IF NOT EXISTS quality_analysis_summary TEXT,
  ADD COLUMN IF NOT EXISTS quality_detected_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_recommendations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_requires_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_assessed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_llm_provider TEXT,
  ADD COLUMN IF NOT EXISTS quality_llm_model TEXT;

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_quality_score ON knowledge_base(quality_score) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_quality_requires_review ON knowledge_base(quality_requires_review) WHERE quality_requires_review = true;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration kb_quality_scores terminée';
  RAISE NOTICE 'Colonnes qualité ajoutées à knowledge_base';
END $$;
