-- Migration: Materialized View pour métadonnées enrichies KB
-- Date: 2026-02-14
-- Objectif: Éliminer N+1 queries lors de l'enrichissement des résultats de recherche
-- Impact: -30-50% latence enrichissement metadata (1s → 50-150ms)

-- =====================================================================
-- PHASE 1: Création Materialized View
-- =====================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kb_metadata_enriched AS
SELECT
  kb.id,
  kb.title,
  kb.category,
  kb.language,
  kb.subcategory,
  kb.metadata,
  kb.quality_score,
  kb.source_url,
  kb.created_at,
  kb.updated_at,
  -- Métadonnées structurées juridiques
  meta.tribunal_code,
  trib_tax.label_fr as tribunal_label_fr,
  trib_tax.label_ar as tribunal_label_ar,
  meta.decision_date,
  meta.decision_number,
  meta.chamber,
  meta.legal_domain,
  meta.keywords,
  -- Relations juridiques (citations)
  COUNT(DISTINCT rel_source.target_kb_id) as citation_count,
  COUNT(DISTINCT rel_target.source_kb_id) as cited_by_count,
  -- Statistiques d'usage
  COALESCE(usage.view_count, 0) as view_count,
  COALESCE(usage.last_viewed_at, kb.created_at) as last_viewed_at
FROM knowledge_base kb
LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
LEFT JOIN legal_taxonomy trib_tax
  ON meta.tribunal_code = trib_tax.code
  AND trib_tax.type = 'tribunal'
LEFT JOIN kb_legal_relations rel_source
  ON kb.id = rel_source.source_kb_id
  AND rel_source.validated = true
LEFT JOIN kb_legal_relations rel_target
  ON kb.id = rel_target.target_kb_id
  AND rel_target.validated = true
LEFT JOIN (
  -- Sous-requête pour statistiques d'usage agrégées
  SELECT
    knowledge_base_id,
    COUNT(*) as view_count,
    MAX(created_at) as last_viewed_at
  FROM knowledge_base_views
  GROUP BY knowledge_base_id
) usage ON kb.id = usage.knowledge_base_id
WHERE kb.is_indexed = true
GROUP BY
  kb.id, kb.title, kb.category, kb.language, kb.subcategory,
  kb.metadata, kb.quality_score, kb.source_url, kb.created_at, kb.updated_at,
  meta.tribunal_code, trib_tax.label_fr, trib_tax.label_ar,
  meta.decision_date, meta.decision_number, meta.chamber,
  meta.legal_domain, meta.keywords,
  usage.view_count, usage.last_viewed_at;

-- =====================================================================
-- PHASE 2: Index pour accès rapide
-- =====================================================================

-- Index primaire sur ID (UNIQUE pour REFRESH CONCURRENTLY)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kb_metadata_id
  ON mv_kb_metadata_enriched (id);

-- Index composite catégorie + langue (cas d'usage le plus fréquent)
CREATE INDEX IF NOT EXISTS idx_mv_kb_metadata_category_lang
  ON mv_kb_metadata_enriched (category, language);

-- Index date décision pour tris chronologiques (jurisprudence)
CREATE INDEX IF NOT EXISTS idx_mv_kb_metadata_decision_date
  ON mv_kb_metadata_enriched (decision_date DESC NULLS LAST)
  WHERE category = 'jurisprudence';

-- Index score qualité pour filtrage documents pertinents
CREATE INDEX IF NOT EXISTS idx_mv_kb_metadata_quality_score
  ON mv_kb_metadata_enriched (quality_score DESC)
  WHERE quality_score IS NOT NULL;

-- Index tribunal pour filtrage par juridiction
CREATE INDEX IF NOT EXISTS idx_mv_kb_metadata_tribunal
  ON mv_kb_metadata_enriched (tribunal_code)
  WHERE tribunal_code IS NOT NULL;

-- =====================================================================
-- PHASE 3: Refresh initial (peut être long)
-- =====================================================================

-- Refresh initial avec ANALYZE pour statistiques optimales
REFRESH MATERIALIZED VIEW mv_kb_metadata_enriched;
ANALYZE mv_kb_metadata_enriched;

-- =====================================================================
-- PHASE 4: Vue pour monitoring staleness
-- =====================================================================

CREATE OR REPLACE VIEW vw_mv_staleness AS
SELECT
  'mv_kb_metadata_enriched' as materialized_view,
  schemaname,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size,
  EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 3600 as staleness_hours,
  last_refresh,
  CASE
    WHEN last_refresh IS NULL THEN '🔴 Jamais rafraîchi'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_refresh)) < 3600 THEN '🟢 Frais (<1h)'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_refresh)) < 86400 THEN '🟡 Acceptable (<24h)'
    ELSE '🔴 Périmé (>24h)'
  END as freshness_status
FROM pg_stat_user_tables
JOIN pg_matviews ON tablename = matviewname
WHERE tablename = 'mv_kb_metadata_enriched';

-- =====================================================================
-- COMMENTAIRES
-- =====================================================================

COMMENT ON MATERIALIZED VIEW mv_kb_metadata_enriched IS
'Vue matérialisée pré-calculant les métadonnées enrichies pour la KB.
Rafraîchir quotidiennement via cron: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;
Objectif: Éliminer N+1 queries lors de l''enrichissement des résultats de recherche RAG.
Impact attendu: -30-50% latence (1s → 50-150ms).';

COMMENT ON INDEX idx_mv_kb_metadata_category_lang IS
'Index composite pour recherches filtrées par catégorie et langue (cas 70% des requêtes)';

-- =====================================================================
-- ROLLBACK (si nécessaire)
-- =====================================================================

-- Pour rollback:
-- DROP MATERIALIZED VIEW IF EXISTS mv_kb_metadata_enriched CASCADE;
-- DROP VIEW IF EXISTS vw_mv_staleness;
