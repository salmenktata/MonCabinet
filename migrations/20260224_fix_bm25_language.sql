-- Fix BM25 multilingue : auto-détection langue (arabe / français)
-- Problème : 'arabic' hardcodé → score BM25 = 0 pour requêtes françaises
-- Fix v1 (cassé) : 'french' pour requêtes FR → incompatible avec tsvectors indexés en 'arabic'
-- Fix v2 (correct) : 'arabic' pour AR, 'simple' pour FR — 'simple' fonctionne avec tsvectors Arabic
--   car il ne fait pas de stemming (juste tokenisation), match OK sur les tokens français stockés

-- Supprimer toutes les versions précédentes
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, text, integer, double precision, boolean) CASCADE;
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, integer, double precision, boolean, integer) CASCADE;
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, integer, double precision, boolean) CASCADE;
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, text, integer, double precision, text) CASCADE;
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, text, integer, double precision) CASCADE;

CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  p_query_text text,
  p_embedding vector,
  p_category text DEFAULT NULL,
  p_doc_type text DEFAULT NULL,
  p_limit integer DEFAULT 15,
  p_threshold double precision DEFAULT 0.35,
  p_embedding_provider text DEFAULT 'ollama'  -- 'openai' | 'ollama' | 'gemini'
)
RETURNS TABLE (
  knowledge_base_id uuid,
  chunk_id uuid,
  title text,
  category text,
  chunk_content text,
  chunk_index integer,
  similarity double precision,
  bm25_rank double precision,
  hybrid_score double precision,
  metadata jsonb
) AS $$
DECLARE
  v_ts_config text;
BEGIN
  -- Auto-détection langue : arabe si contient des caractères arabes (U+0621–U+064A)
  -- Évite BM25 = 0 pour requêtes françaises (bug critique)
  -- IMPORTANT: utiliser 'simple' (pas 'french') pour les requêtes non-arabes
  -- car content_tsvector est indexé avec la config 'arabic' qui ne stem pas les mots français.
  -- 'simple' = tokenisation basique sans stemming → match OK sur les tokens français dans tsvector Arabic.
  -- Vérifié: plainto_tsquery('arabic', 'obligations bail') = 0 résultats
  --          plainto_tsquery('simple', 'obligations bail') = 9 résultats (correct)
  v_ts_config := CASE WHEN p_query_text ~ '[ء-ي]' THEN 'arabic' ELSE 'simple' END;

  IF p_embedding_provider = 'openai' THEN
    RETURN QUERY
    WITH vector_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding_openai <=> p_embedding))::double precision as similarity,
        0.0::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.embedding_openai IS NOT NULL
        AND (1 - (kbc.embedding_openai <=> p_embedding)) >= p_threshold
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY kbc.embedding_openai <=> p_embedding
      LIMIT p_limit
    ),
    bm25_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        0.0::double precision as similarity,
        ts_rank(kbc.content_tsvector, plainto_tsquery(v_ts_config, p_query_text))::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.content_tsvector @@ plainto_tsquery(v_ts_config, p_query_text)
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY bm25_rank DESC
      LIMIT p_limit
    ),
    combined AS (SELECT * FROM vector_search UNION ALL SELECT * FROM bm25_search),
    ranked AS (
      SELECT c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index,
        MAX(c.similarity) as similarity, MAX(c.bm25_rank) as bm25_rank, c.metadata
      FROM combined c
      GROUP BY c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index, c.metadata
    )
    SELECT r.knowledge_base_id, r.chunk_id, r.title, r.category, r.chunk_content, r.chunk_index,
      r.similarity, r.bm25_rank,
      (0.7 * r.similarity + 0.3 * LEAST(r.bm25_rank * 10, 1.0))::double precision as hybrid_score,
      r.metadata
    FROM ranked r
    ORDER BY hybrid_score DESC
    LIMIT p_limit;

  ELSIF p_embedding_provider = 'gemini' THEN
    RETURN QUERY
    WITH vector_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding_gemini <=> p_embedding))::double precision as similarity,
        0.0::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.embedding_gemini IS NOT NULL
        AND (1 - (kbc.embedding_gemini <=> p_embedding)) >= p_threshold
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY kbc.embedding_gemini <=> p_embedding
      LIMIT p_limit
    ),
    bm25_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        0.0::double precision as similarity,
        ts_rank(kbc.content_tsvector, plainto_tsquery(v_ts_config, p_query_text))::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.content_tsvector @@ plainto_tsquery(v_ts_config, p_query_text)
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY bm25_rank DESC
      LIMIT p_limit
    ),
    combined AS (SELECT * FROM vector_search UNION ALL SELECT * FROM bm25_search),
    ranked AS (
      SELECT c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index,
        MAX(c.similarity) as similarity, MAX(c.bm25_rank) as bm25_rank, c.metadata
      FROM combined c
      GROUP BY c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index, c.metadata
    )
    SELECT r.knowledge_base_id, r.chunk_id, r.title, r.category, r.chunk_content, r.chunk_index,
      r.similarity, r.bm25_rank,
      (0.7 * r.similarity + 0.3 * LEAST(r.bm25_rank * 10, 1.0))::double precision as hybrid_score,
      r.metadata
    FROM ranked r
    ORDER BY hybrid_score DESC
    LIMIT p_limit;

  ELSE
    -- Ollama (défaut)
    RETURN QUERY
    WITH vector_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding <=> p_embedding))::double precision as similarity,
        0.0::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.embedding IS NOT NULL
        AND (1 - (kbc.embedding <=> p_embedding)) >= p_threshold
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY kbc.embedding <=> p_embedding
      LIMIT p_limit
    ),
    bm25_search AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id as chunk_id,
        kb.title,
        kb.category::text,
        kbc.content as chunk_content,
        kbc.chunk_index,
        0.0::double precision as similarity,
        ts_rank(kbc.content_tsvector, plainto_tsquery(v_ts_config, p_query_text))::double precision as bm25_rank,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.is_active = true
        AND kbc.content_tsvector @@ plainto_tsquery(v_ts_config, p_query_text)
        AND (p_category IS NULL OR kb.category::text = p_category)
        AND (p_doc_type IS NULL OR kb.doc_type::text = p_doc_type)
      ORDER BY bm25_rank DESC
      LIMIT p_limit
    ),
    combined AS (SELECT * FROM vector_search UNION ALL SELECT * FROM bm25_search),
    ranked AS (
      SELECT c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index,
        MAX(c.similarity) as similarity, MAX(c.bm25_rank) as bm25_rank, c.metadata
      FROM combined c
      GROUP BY c.knowledge_base_id, c.chunk_id, c.title, c.category, c.chunk_content, c.chunk_index, c.metadata
    )
    SELECT r.knowledge_base_id, r.chunk_id, r.title, r.category, r.chunk_content, r.chunk_index,
      r.similarity, r.bm25_rank,
      (0.7 * r.similarity + 0.3 * LEAST(r.bm25_rank * 10, 1.0))::double precision as hybrid_score,
      r.metadata
    FROM ranked r
    ORDER BY hybrid_score DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_knowledge_base_hybrid IS
'Recherche hybride vectorielle + BM25 avec auto-détection langue (arabe/français).
Fix v2: v_ts_config = arabic pour AR, simple pour FR (pas french — incompatible avec tsvectors Arabic).
BM25 résultats: arabic=9, french=0, simple=9 pour "obligations locataire bail" (validé Feb 24).
Supports: openai (1536-dim), gemini (768-dim), ollama (1024-dim).';
