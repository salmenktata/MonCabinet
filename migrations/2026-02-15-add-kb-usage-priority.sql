-- Migration: Vue priorité documents KB basée sur usage réel
-- Date: 2026-02-15
-- Objectif: Prioriser la migration OpenAI embeddings sur les documents les plus utilisés
--
-- Logique: Agréger les citations depuis chat_messages.sources JSONB
-- pour identifier le top 80% des documents par fréquence d'utilisation.
--
-- Sprint 4 - Optimisation migration embeddings

-- =============================================================================
-- 1. VUE MATÉRIALISÉE: USAGE KB PAR DOCUMENT
-- =============================================================================

-- Agrège les citations depuis chat_messages.sources JSONB
-- Chaque source dans le JSON contient un documentId qui mappe sur knowledge_base.id
CREATE MATERIALIZED VIEW IF NOT EXISTS vw_kb_docs_usage_priority AS
WITH source_citations AS (
  -- Extraire chaque documentId cité dans les messages assistant
  SELECT
    (source_obj->>'documentId')::uuid AS kb_doc_id,
    cm.created_at AS cited_at
  FROM chat_messages cm,
       jsonb_array_elements(cm.sources::jsonb) AS source_obj
  WHERE cm.sources IS NOT NULL
    AND cm.role = 'assistant'
    AND jsonb_array_length(cm.sources::jsonb) > 0
),
usage_stats AS (
  -- Compter les citations par document
  SELECT
    kb_doc_id,
    COUNT(*) AS citation_count,
    MAX(cited_at) AS last_cited_at,
    MIN(cited_at) AS first_cited_at
  FROM source_citations
  WHERE kb_doc_id IS NOT NULL
  GROUP BY kb_doc_id
)
SELECT
  kb.id AS doc_id,
  kb.title,
  kb.category,
  kb.quality_score,
  COALESCE(us.citation_count, 0) AS citation_count,
  us.last_cited_at,
  us.first_cited_at,
  -- Nombre de chunks du document
  chunk_stats.total_chunks,
  chunk_stats.chunks_with_openai,
  chunk_stats.chunks_without_openai,
  -- Score de priorité composite (0-100)
  -- Facteurs: citation_count (40%), quality_score (20%), catégorie stratégique (20%), recency (20%)
  ROUND(
    LEAST(100,
      -- Citations (40% du score, plafonné à 40 points)
      LEAST(40, COALESCE(us.citation_count, 0) * 4) +
      -- Quality score (20% du score)
      COALESCE(kb.quality_score, 50) * 0.2 +
      -- Catégorie stratégique (20% du score)
      CASE kb.category::text
        WHEN 'jurisprudence' THEN 20
        WHEN 'codes' THEN 18
        WHEN 'legislation' THEN 16
        WHEN 'doctrine' THEN 12
        WHEN 'procedures' THEN 10
        ELSE 5
      END +
      -- Recency bonus (20% du score, basé sur dernière citation)
      CASE
        WHEN us.last_cited_at >= NOW() - INTERVAL '7 days' THEN 20
        WHEN us.last_cited_at >= NOW() - INTERVAL '30 days' THEN 15
        WHEN us.last_cited_at >= NOW() - INTERVAL '90 days' THEN 10
        WHEN us.last_cited_at IS NOT NULL THEN 5
        ELSE 0
      END
    )
  ) AS priority_score,
  -- Flag: nécessite migration OpenAI
  (chunk_stats.chunks_without_openai > 0) AS needs_openai_migration
FROM knowledge_base kb
LEFT JOIN usage_stats us ON kb.id = us.kb_doc_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_chunks,
    COUNT(kbc.embedding_openai) AS chunks_with_openai,
    COUNT(*) - COUNT(kbc.embedding_openai) AS chunks_without_openai
  FROM knowledge_base_chunks kbc
  WHERE kbc.knowledge_base_id = kb.id
) chunk_stats ON true
WHERE kb.is_active = true;

-- Index pour requêtes rapides par priorité
CREATE UNIQUE INDEX IF NOT EXISTS idx_vw_kb_usage_priority_doc_id
ON vw_kb_docs_usage_priority (doc_id);

CREATE INDEX IF NOT EXISTS idx_vw_kb_usage_priority_score
ON vw_kb_docs_usage_priority (priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_vw_kb_usage_priority_migration
ON vw_kb_docs_usage_priority (needs_openai_migration, priority_score DESC)
WHERE needs_openai_migration = true;

COMMENT ON MATERIALIZED VIEW vw_kb_docs_usage_priority IS
'Priorisation documents KB pour migration OpenAI embeddings - basée sur usage réel (citations chat) + qualité + catégorie + recency';

-- =============================================================================
-- 2. VUE RÉSUMÉ POUR DASHBOARD
-- =============================================================================

CREATE OR REPLACE VIEW vw_kb_migration_priority_summary AS
SELECT
  COUNT(*) AS total_docs,
  COUNT(*) FILTER (WHERE needs_openai_migration) AS docs_needing_migration,
  COUNT(*) FILTER (WHERE NOT needs_openai_migration) AS docs_migrated,
  COUNT(*) FILTER (WHERE citation_count > 0) AS docs_with_usage,
  COUNT(*) FILTER (WHERE citation_count = 0) AS docs_without_usage,
  ROUND(AVG(priority_score), 1) AS avg_priority_score,
  -- Top 80% = docs triés par priorité couvrant 80% du total
  (SELECT COUNT(*) FROM (
    SELECT doc_id,
           SUM(citation_count) OVER (ORDER BY priority_score DESC) AS cumulative_citations,
           SUM(citation_count) OVER () AS total_citations
    FROM vw_kb_docs_usage_priority
    WHERE citation_count > 0
  ) sub
  WHERE cumulative_citations <= total_citations * 0.8
  ) AS top_80_pct_docs,
  SUM(chunks_without_openai) AS total_chunks_to_migrate,
  -- Estimation coût migration ($0.001/chunk)
  ROUND(SUM(chunks_without_openai) * 0.001, 2) AS estimated_cost_usd
FROM vw_kb_docs_usage_priority;

COMMENT ON VIEW vw_kb_migration_priority_summary IS
'Résumé migration OpenAI: docs à migrer, estimation coût, top 80% par usage';

-- =============================================================================
-- ROLLBACK
-- =============================================================================

-- Pour rollback cette migration :
--
-- DROP VIEW IF EXISTS vw_kb_migration_priority_summary;
-- DROP MATERIALIZED VIEW IF EXISTS vw_kb_docs_usage_priority;
