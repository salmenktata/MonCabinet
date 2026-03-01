/**
 * Migration: Auto-détection de catégorie par page
 * Date: 2026-03-02
 * Description:
 *   - Ajoute `detected_category TEXT` sur web_pages pour stocker la catégorie
 *     détectée par URL patterns (Option A) ou règles admin (Option B)
 *   - Ajoute `category_rules JSONB` sur web_sources pour configurer des règles
 *     d'override par pattern d'URL (Option B)
 */

-- ============================================================================
-- ÉTAPE 1 : Colonne detected_category sur web_pages
-- ============================================================================

ALTER TABLE web_pages ADD COLUMN IF NOT EXISTS detected_category TEXT;

-- ============================================================================
-- ÉTAPE 2 : Colonne category_rules sur web_sources
-- ============================================================================

ALTER TABLE web_sources ADD COLUMN IF NOT EXISTS category_rules JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- ÉTAPE 3 : Index pour lookup/filtrage
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_web_pages_detected_category
  ON web_pages(detected_category) WHERE detected_category IS NOT NULL;
