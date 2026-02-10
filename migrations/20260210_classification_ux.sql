/**
 * Migration: Sprint 3 - Phase 4 - Classification UX
 *
 * Ajoute les colonnes et tables pour l'interface de correction de classification
 *
 * Changements :
 * 1. Colonnes review_priority et review_estimated_effort dans legal_classifications
 * 2. Table classification_feedback pour feedback sur corrections
 * 3. Fonction SQL get_classification_review_queue() pour récupérer pages à revoir
 *
 * Usage :
 *   psql -U moncabinet -d moncabinet -f migrations/20260210_classification_ux.sql
 */

-- =============================================================================
-- 1. AJOUTER COLONNES REVIEW À legal_classifications
-- =============================================================================

DO $$
BEGIN
  -- Ajouter review_priority si n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_classifications'
    AND column_name = 'review_priority'
  ) THEN
    ALTER TABLE legal_classifications
    ADD COLUMN review_priority TEXT CHECK (review_priority IN ('low', 'medium', 'high', 'urgent'));

    COMMENT ON COLUMN legal_classifications.review_priority IS
    'Priorité de revue humaine (low, medium, high, urgent)';
  END IF;

  -- Ajouter review_estimated_effort si n'existe pas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_classifications'
    AND column_name = 'review_estimated_effort'
  ) THEN
    ALTER TABLE legal_classifications
    ADD COLUMN review_estimated_effort TEXT CHECK (review_estimated_effort IN ('quick', 'moderate', 'complex'));

    COMMENT ON COLUMN legal_classifications.review_estimated_effort IS
    'Effort estimé pour revue humaine (quick < 2min, moderate 2-5min, complex > 5min)';
  END IF;

  -- Ajouter validation_reason si n'existe pas (description détaillée pourquoi nécessite revue)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_classifications'
    AND column_name = 'validation_reason'
  ) THEN
    ALTER TABLE legal_classifications
    ADD COLUMN validation_reason TEXT;

    COMMENT ON COLUMN legal_classifications.validation_reason IS
    'Raison détaillée pourquoi cette classification nécessite validation humaine';
  END IF;
END $$;

-- =============================================================================
-- 2. CRÉER TABLE classification_feedback
-- =============================================================================

CREATE TABLE IF NOT EXISTS classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES classification_corrections(id) ON DELETE CASCADE,
  is_useful BOOLEAN NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_correction
  ON classification_feedback(correction_id);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_created_at
  ON classification_feedback(created_at DESC);

COMMENT ON TABLE classification_feedback IS
'Feedback sur utilité des corrections de classification (pour scoring qualité corrections)';

COMMENT ON COLUMN classification_feedback.is_useful IS
'True si la correction était utile et correcte, False si inutile ou incorrecte';

-- =============================================================================
-- 3. FONCTION HELPER : get_classification_review_queue
-- =============================================================================

CREATE OR REPLACE FUNCTION get_classification_review_queue(
  p_priority TEXT[] DEFAULT NULL,
  p_effort TEXT[] DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  web_page_id UUID,
  url TEXT,
  title TEXT,
  primary_category TEXT,
  domain TEXT,
  confidence_score DOUBLE PRECISION,
  review_priority TEXT,
  review_estimated_effort TEXT,
  validation_reason TEXT,
  source_name TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wp.id AS web_page_id,
    wp.url,
    wp.title,
    lc.primary_category,
    lc.domain,
    lc.confidence_score,
    lc.review_priority,
    lc.review_estimated_effort,
    lc.validation_reason,
    ws.name AS source_name,
    lc.classified_at AS created_at
  FROM web_pages wp
  JOIN legal_classifications lc ON lc.web_page_id = wp.id
  JOIN web_sources ws ON wp.web_source_id = ws.id
  WHERE lc.requires_validation = true
    AND (p_priority IS NULL OR lc.review_priority = ANY(p_priority))
    AND (p_effort IS NULL OR lc.review_estimated_effort = ANY(p_effort))
    AND (p_source_id IS NULL OR wp.web_source_id = p_source_id)
  ORDER BY
    -- Priorisation : urgent > high > medium > low
    CASE lc.review_priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    -- Puis par date (plus ancien en premier = FIFO)
    lc.classified_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_classification_review_queue IS
'Récupère la queue de pages nécessitant revue humaine, triées par priorité puis date';

-- =============================================================================
-- 4. INDEX PERFORMANCE
-- =============================================================================

-- Index pour requêtes de queue (WHERE requires_validation + ORDER BY priority)
CREATE INDEX IF NOT EXISTS idx_legal_classifications_review_queue
  ON legal_classifications(requires_validation, review_priority, classified_at)
  WHERE requires_validation = true;

-- =============================================================================
-- FIN DE LA MIGRATION
-- =============================================================================

-- Afficher statistiques après migration
DO $$
DECLARE
  review_count INT;
  urgent_count INT;
  high_count INT;
  medium_count INT;
  low_count INT;
BEGIN
  SELECT COUNT(*) INTO review_count
  FROM legal_classifications
  WHERE requires_validation = true;

  SELECT COUNT(*) INTO urgent_count
  FROM legal_classifications
  WHERE requires_validation = true AND review_priority = 'urgent';

  SELECT COUNT(*) INTO high_count
  FROM legal_classifications
  WHERE requires_validation = true AND review_priority = 'high';

  SELECT COUNT(*) INTO medium_count
  FROM legal_classifications
  WHERE requires_validation = true AND review_priority = 'medium';

  SELECT COUNT(*) INTO low_count
  FROM legal_classifications
  WHERE requires_validation = true AND review_priority = 'low';

  RAISE NOTICE '✅ Migration 20260210_classification_ux terminée !';
  RAISE NOTICE '';
  RAISE NOTICE 'Statistiques review queue :';
  RAISE NOTICE '  - Total pages nécessitant revue : %', review_count;
  RAISE NOTICE '  - Priorité urgent : %', urgent_count;
  RAISE NOTICE '  - Priorité high : %', high_count;
  RAISE NOTICE '  - Priorité medium : %', medium_count;
  RAISE NOTICE '  - Priorité low : %', low_count;
  RAISE NOTICE '  - Sans priorité : %', review_count - urgent_count - high_count - medium_count - low_count;
END $$;
