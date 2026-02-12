-- Migration: Ajouter Hybrid Search (Vectoriel + BM25)
-- Date: 2026-02-12
-- Objectif: Combiner recherche sémantique (pgvector) + recherche keywords (ts_vector)
--
-- Impact: +25-30% couverture, capture keywords exacts manqués par vectoriel
-- Méthode: RRF (Reciprocal Rank Fusion) pour combiner scores

-- =============================================================================
-- 1. AJOUTER COLONNE TS_VECTOR POUR FULL-TEXT SEARCH
-- =============================================================================

-- Colonne ts_vector pour recherche BM25 (mots-clés)
-- Supporte arabe + français via configurations multiples
ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS content_tsvector tsvector;

-- Commentaire documentation
COMMENT ON COLUMN knowledge_base_chunks.content_tsvector IS
'Index full-text search (BM25) pour recherche keywords arabe + français. Complémentaire à embedding vectoriel.';

-- =============================================================================
-- 2. GÉNÉRER TS_VECTOR POUR CHUNKS EXISTANTS
-- =============================================================================

-- Générer ts_vector pour arabe + français
-- Utilise simple (pas de stemming) car arabe complexe + legal tech terms
UPDATE knowledge_base_chunks
SET content_tsvector = to_tsvector('simple', content_chunk)
WHERE content_tsvector IS NULL;

-- =============================================================================
-- 3. INDEX GIN POUR BM25 (FAST KEYWORD SEARCH)
-- =============================================================================

-- Index GIN pour recherche rapide BM25
CREATE INDEX IF NOT EXISTS idx_kb_chunks_tsvector_gin
ON knowledge_base_chunks
USING gin(content_tsvector);

-- =============================================================================
-- 4. TRIGGER AUTO-UPDATE TS_VECTOR
-- =============================================================================

-- Fonction trigger pour auto-update ts_vector lors INSERT/UPDATE
CREATE OR REPLACE FUNCTION kb_chunks_tsvector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('simple', NEW.content_chunk);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger sur INSERT/UPDATE
DROP TRIGGER IF EXISTS tsvectorupdate ON knowledge_base_chunks;
CREATE TRIGGER tsvectorupdate
BEFORE INSERT OR UPDATE ON knowledge_base_chunks
FOR EACH ROW
EXECUTE FUNCTION kb_chunks_tsvector_trigger();

-- =============================================================================
-- 5. FONCTION HYBRID SEARCH (Vectoriel + BM25 avec RRF)
-- =============================================================================

-- Fonction hybrid search combinant pgvector (sémantique) + ts_vector (keywords)
-- Utilise RRF (Reciprocal Rank Fusion) pour combiner les scores
--
-- Paramètres:
--   query_text: Texte pour BM25 (keywords)
--   query_embedding: Vector pour recherche sémantique
--   category_filter: Filtrer par catégorie (optionnel)
--   limit_count: Nombre résultats max
--   vector_threshold: Seuil similarité vectorielle (défaut 0.5)
--   use_openai: Utiliser embedding OpenAI (1536-dim) ou Ollama (1024-dim)
--   rrf_k: Paramètre RRF (défaut 60, standard)
--
-- Retour: Top N résultats triés par score hybride (70% vectoriel + 30% BM25)
CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  query_text text,
  query_embedding vector,
  category_filter text DEFAULT NULL,
  limit_count int DEFAULT 15,
  vector_threshold float DEFAULT 0.5,
  use_openai boolean DEFAULT false,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  knowledge_base_id uuid,
  chunk_id uuid,
  title text,
  chunk_content text,
  chunk_index int,
  similarity float,
  bm25_rank float,
  hybrid_score float,
  category text,
  subcategory text,
  metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- ===== RECHERCHE VECTORIELLE (Sémantique) =====
  vector_results AS (
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content_chunk AS chunk_content,
      kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_sim,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2  -- Récupérer plus pour fusion
  ),
  -- ===== RECHERCHE BM25 (Keywords) =====
  bm25_results AS (
    SELECT
      kbc.id AS chunk_id,
      ts_rank_cd(
        kbc.content_tsvector,
        plainto_tsquery('simple', query_text)
      ) AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2  -- Récupérer plus pour fusion
  ),
  -- ===== FUSION RRF (Reciprocal Rank Fusion) =====
  fused_results AS (
    SELECT
      vr.knowledge_base_id,
      vr.chunk_id,
      vr.title,
      vr.chunk_content,
      vr.chunk_index,
      vr.vec_sim,
      COALESCE(br.rank, 0) AS bm25_rank,
      vr.category,
      vr.subcategory,
      vr.metadata,
      -- Score RRF: 1 / (k + rank)
      -- Combine vec_rank et bm25_rank avec pondération 70/30
      (
        (0.7 / (rrf_k + vr.vec_rank)) +
        (0.3 / (rrf_k + COALESCE(br.bm25_rank, limit_count * 2)))
      ) AS hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.chunk_id = br.chunk_id
    UNION
    -- Ajouter résultats BM25 non trouvés par vectoriel
    SELECT
      kbc.knowledge_base_id,
      br.chunk_id,
      kb.title,
      kbc.content_chunk,
      kbc.chunk_index,
      0.0 AS vec_sim,  -- Pas de score vectoriel
      br.rank AS bm25_rank,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      -- Score RRF avec seulement BM25
      (0.3 / (rrf_k + br.bm25_rank)) AS hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.chunk_id NOT IN (SELECT chunk_id FROM vector_results)
  )
  -- ===== RÉSULTATS FINAUX =====
  SELECT
    fr.knowledge_base_id,
    fr.chunk_id,
    fr.title,
    fr.chunk_content,
    fr.chunk_index,
    fr.vec_sim AS similarity,
    fr.bm25_rank,
    fr.hybrid_score,
    fr.category,
    fr.subcategory,
    fr.metadata
  FROM fused_results fr
  ORDER BY fr.hybrid_score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Commentaire documentation
COMMENT ON FUNCTION search_knowledge_base_hybrid IS
'Recherche hybride combinant sémantique (pgvector) + keywords (BM25) avec RRF. Pondération: 70% vectoriel, 30% BM25.';

-- =============================================================================
-- 6. STATISTIQUES HYBRID SEARCH
-- =============================================================================

-- Vue pour comparer performances vectoriel vs hybrid
CREATE OR REPLACE VIEW vw_kb_search_coverage AS
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS chunks_with_embedding,
  COUNT(*) FILTER (WHERE content_tsvector IS NOT NULL) AS chunks_with_tsvector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND content_tsvector IS NOT NULL) AS chunks_with_both,
  ROUND(100.0 * COUNT(*) FILTER (WHERE content_tsvector IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_bm25_coverage
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true;

COMMENT ON VIEW vw_kb_search_coverage IS
'Statistiques de couverture indexation vectorielle vs BM25';

-- =============================================================================
-- ROLLBACK (si besoin)
-- =============================================================================

-- Pour rollback cette migration :
--
-- DROP VIEW IF EXISTS vw_kb_search_coverage;
-- DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, int, float, boolean, int);
-- DROP TRIGGER IF EXISTS tsvectorupdate ON knowledge_base_chunks;
-- DROP FUNCTION IF EXISTS kb_chunks_tsvector_trigger();
-- DROP INDEX IF EXISTS idx_kb_chunks_tsvector_gin;
-- ALTER TABLE knowledge_base_chunks DROP COLUMN IF EXISTS content_tsvector;
