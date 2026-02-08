-- Migration: Versioning des pages web
-- Date: 2026-02-10
-- Description: Table pour l'historique des versions des pages crawlées

-- ============================================================================
-- TABLE web_page_versions
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Snapshot des données
  title TEXT,
  extracted_text TEXT,
  content_hash VARCHAR(64),
  word_count INTEGER,
  metadata JSONB,

  -- Type de changement
  change_type VARCHAR(30) NOT NULL DEFAULT 'initial_crawl' CHECK (change_type IN ('initial_crawl', 'content_change', 'metadata_change', 'restore')),
  diff_summary TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contrainte d'unicité
  UNIQUE (web_page_id, version)
);

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_web_page_versions_page ON web_page_versions(web_page_id);
CREATE INDEX IF NOT EXISTS idx_web_page_versions_page_version ON web_page_versions(web_page_id, version DESC);

-- ============================================================================
-- FONCTION: Créer une version de page web
-- ============================================================================

CREATE OR REPLACE FUNCTION create_web_page_version(
  p_web_page_id UUID,
  p_change_type VARCHAR(30) DEFAULT 'content_change',
  p_diff_summary TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_version_id UUID;
  v_new_version INTEGER;
BEGIN
  -- Calculer le nouveau numéro de version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM web_page_versions
  WHERE web_page_id = p_web_page_id;

  -- Insérer la version avec snapshot des données actuelles
  INSERT INTO web_page_versions (
    web_page_id, version, title, extracted_text,
    content_hash, word_count, metadata, change_type, diff_summary
  )
  SELECT
    id, v_new_version, title, extracted_text,
    content_hash, word_count, metadata, p_change_type, p_diff_summary
  FROM web_pages
  WHERE id = p_web_page_id
  RETURNING id INTO v_version_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION: Obtenir les versions d'une page
-- ============================================================================

CREATE OR REPLACE FUNCTION get_web_page_versions(
  p_web_page_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  title TEXT,
  content_hash VARCHAR(64),
  word_count INTEGER,
  change_type VARCHAR(30),
  diff_summary TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wpv.id,
    wpv.version,
    wpv.title,
    wpv.content_hash,
    wpv.word_count,
    wpv.change_type,
    wpv.diff_summary,
    wpv.created_at
  FROM web_page_versions wpv
  WHERE wpv.web_page_id = p_web_page_id
  ORDER BY wpv.version DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration web_page_versions terminée';
  RAISE NOTICE 'Table web_page_versions créée';
  RAISE NOTICE 'Fonctions create_web_page_version, get_web_page_versions créées';
END $$;
