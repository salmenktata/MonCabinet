-- Migration: Filtrer le RAG pour n'inclure que les legal_documents consolidés
-- Date: 2026-02-28
--
-- Contexte: Les chunks RAG provenaient de deux sources :
--   1. legal_documents.knowledge_base_id → KB entries créées par indexLegalDocument()
--      (codes 9anoun.tn, COC, CP...) → SOURCE LÉGITIME
--   2. web_pages.knowledge_base_id → KB entries créées page-par-page par indexWebPages()
--      (cassation.tn, iort.gov.tn PDFs, pages web individuelles) → À EXCLURE
--
-- Solution: Ajouter AND EXISTS (SELECT 1 FROM legal_documents ld WHERE ld.knowledge_base_id = kb.id)
--           dans les 6 CTEs de search_knowledge_base_hybrid().
--
-- Impact:
--   - Inclus : KB entries référencées par legal_documents.knowledge_base_id
--   - Exclus : KB entries web_pages sans legal_document consolidé
--
-- ROLLBACK:
--   Réappliquer 20260227000002 (sans AND EXISTS legal_documents)
-- =============================================================================

-- 1. Index de performance sur legal_documents(knowledge_base_id)
CREATE INDEX IF NOT EXISTS idx_legal_docs_knowledge_base_id
  ON legal_documents(knowledge_base_id)
  WHERE knowledge_base_id IS NOT NULL;

-- Vérification pré-migration
DO $$
DECLARE
  v_legal_kb_count int;
  v_web_only_kb_count int;
BEGIN
  SELECT COUNT(*) INTO v_legal_kb_count
  FROM knowledge_base kb
  WHERE kb.rag_enabled = true
    AND EXISTS (SELECT 1 FROM legal_documents ld WHERE ld.knowledge_base_id = kb.id);

  SELECT COUNT(*) INTO v_web_only_kb_count
  FROM knowledge_base kb
  WHERE kb.rag_enabled = true
    AND NOT EXISTS (SELECT 1 FROM legal_documents ld WHERE ld.knowledge_base_id = kb.id);

  RAISE NOTICE 'KB entries avec legal_document: % | sans legal_document (exclus): %',
    v_legal_kb_count, v_web_only_kb_count;
END $$;

-- 2. Mettre à jour search_knowledge_base_hybrid : ajouter filtre legal_documents dans les 6 CTEs
DROP FUNCTION IF EXISTS search_knowledge_base_hybrid(text, vector, text, text, int, double precision, text, text, int);

CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  query_text text,
  query_embedding vector,
  category_filter text DEFAULT NULL,
  doc_type_filter text DEFAULT NULL,
  limit_count int DEFAULT 15,
  vector_threshold double precision DEFAULT 0.35,
  embedding_provider text DEFAULT 'ollama',
  p_language text DEFAULT 'simple',  -- 'ar' → Arabic stop-word removal, 'fr' → French, sinon 'simple'
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  knowledge_base_id uuid,
  chunk_id uuid,
  title text,
  chunk_content text,
  chunk_index int,
  similarity double precision,
  bm25_rank double precision,
  hybrid_score double precision,
  category text,
  subcategory text,
  metadata jsonb
) AS $$
DECLARE
  bm25_q tsquery;
  v_terms text[];
  v_or_query text;
  v_min_len int;
  bm25_pool_limit int;
BEGIN
  bm25_pool_limit := GREATEST(limit_count * 5, 100);

  -- =========================================================================
  -- Construire la tsquery BM25 avec OR logic pour queries longues (questions)
  -- =========================================================================
  v_min_len := 3;

  SELECT array_agg(w)
  INTO v_terms
  FROM (
    SELECT DISTINCT trim(w) AS w
    FROM unnest(string_to_array(query_text, ' ')) AS w
    WHERE length(trim(w)) > v_min_len
      AND trim(w) !~ '^[[:punct:]]+$'
  ) t;

  IF v_terms IS NOT NULL AND array_length(v_terms, 1) >= 2 THEN
    v_or_query := array_to_string(v_terms, ' OR ');
    BEGIN
      bm25_q := websearch_to_tsquery('simple', v_or_query);
    EXCEPTION WHEN others THEN
      bm25_q := plainto_tsquery('simple', query_text);
    END;
  ELSE
    bm25_q := plainto_tsquery('simple', query_text);
  END IF;

  IF p_language IN ('ar', 'fr') THEN
    DECLARE
      lang_config text := CASE p_language WHEN 'ar' THEN 'arabic' ELSE 'french' END;
      lang_q tsquery;
    BEGIN
      IF v_terms IS NOT NULL AND array_length(v_terms, 1) >= 2 THEN
        lang_q := websearch_to_tsquery(lang_config, v_or_query);
      ELSE
        lang_q := plainto_tsquery(lang_config, query_text);
      END IF;
      bm25_q := bm25_q || lang_q;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF embedding_provider = 'openai' THEN
    -- ===== RECHERCHE AVEC EMBEDDING OPENAI (1536-dim) =====
    RETURN QUERY
    WITH
    vector_results AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id AS v_chunk_id,
        kb.title,
        kbc.content AS chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding_openai <=> query_embedding))::double precision AS vec_sim,
        kb.category::text,
        kb.subcategory::text,
        kb.metadata,
        ROW_NUMBER() OVER (ORDER BY kbc.embedding_openai <=> query_embedding) AS vec_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.embedding_openai IS NOT NULL
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding_openai <=> query_embedding)) >= vector_threshold
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY kbc.embedding_openai <=> query_embedding
      LIMIT limit_count * 2
    ),
    bm25_results AS (
      SELECT
        kbc.id AS b_chunk_id,
        ts_rank_cd(kbc.content_tsvector, bm25_q)::double precision AS rank,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, bm25_q) DESC) AS b_bm25_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.content_tsvector @@ bm25_q
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY rank DESC
      LIMIT bm25_pool_limit
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, bm25_pool_limit))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        -- Fix Feb 26 v3: BM25-only weight 0.3→0.7 (équité avec vector-only)
        (0.7::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
      FROM bm25_results br
      JOIN knowledge_base_chunks kbc ON br.b_chunk_id = kbc.id
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE br.b_chunk_id NOT IN (SELECT vr2.v_chunk_id FROM vector_results vr2)
    )
    SELECT
      fr.knowledge_base_id, fr.f_chunk_id AS chunk_id, fr.title, fr.chunk_content, fr.chunk_index,
      fr.vec_sim AS similarity, fr.f_bm25_rank AS bm25_rank, fr.f_hybrid_score AS hybrid_score,
      fr.category, fr.subcategory, fr.metadata
    FROM fused_results fr
    ORDER BY fr.f_hybrid_score DESC
    LIMIT limit_count;

  ELSIF embedding_provider = 'gemini' THEN
    -- ===== RECHERCHE AVEC EMBEDDING GEMINI (768-dim) =====
    RETURN QUERY
    WITH
    vector_results AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id AS v_chunk_id,
        kb.title,
        kbc.content AS chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding_gemini <=> query_embedding))::double precision AS vec_sim,
        kb.category::text,
        kb.subcategory::text,
        kb.metadata,
        ROW_NUMBER() OVER (ORDER BY kbc.embedding_gemini <=> query_embedding) AS vec_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.embedding_gemini IS NOT NULL
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding_gemini <=> query_embedding)) >= vector_threshold
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY kbc.embedding_gemini <=> query_embedding
      LIMIT limit_count * 2
    ),
    bm25_results AS (
      SELECT
        kbc.id AS b_chunk_id,
        ts_rank_cd(kbc.content_tsvector, bm25_q)::double precision AS rank,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, bm25_q) DESC) AS b_bm25_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.content_tsvector @@ bm25_q
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY rank DESC
      LIMIT bm25_pool_limit
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, bm25_pool_limit))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        -- Fix Feb 26 v3: BM25-only weight 0.3→0.7
        (0.7::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
      FROM bm25_results br
      JOIN knowledge_base_chunks kbc ON br.b_chunk_id = kbc.id
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE br.b_chunk_id NOT IN (SELECT vr2.v_chunk_id FROM vector_results vr2)
    )
    SELECT
      fr.knowledge_base_id, fr.f_chunk_id AS chunk_id, fr.title, fr.chunk_content, fr.chunk_index,
      fr.vec_sim AS similarity, fr.f_bm25_rank AS bm25_rank, fr.f_hybrid_score AS hybrid_score,
      fr.category, fr.subcategory, fr.metadata
    FROM fused_results fr
    ORDER BY fr.f_hybrid_score DESC
    LIMIT limit_count;

  ELSE
    -- ===== RECHERCHE AVEC EMBEDDING OLLAMA (768-dim nomic-embed-text) =====
    RETURN QUERY
    WITH
    vector_results AS (
      SELECT
        kbc.knowledge_base_id,
        kbc.id AS v_chunk_id,
        kb.title,
        kbc.content AS chunk_content,
        kbc.chunk_index,
        (1 - (kbc.embedding <=> query_embedding))::double precision AS vec_sim,
        kb.category::text,
        kb.subcategory::text,
        kb.metadata,
        ROW_NUMBER() OVER (ORDER BY kbc.embedding <=> query_embedding) AS vec_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.embedding IS NOT NULL
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding <=> query_embedding)) >= vector_threshold
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY kbc.embedding <=> query_embedding
      LIMIT limit_count * 2
    ),
    bm25_results AS (
      SELECT
        kbc.id AS b_chunk_id,
        ts_rank_cd(kbc.content_tsvector, bm25_q)::double precision AS rank,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, bm25_q) DESC) AS b_bm25_rank
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.content_tsvector @@ bm25_q
        AND kb.is_active = true
        AND kb.rag_enabled = true
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        -- Filtre rag_enabled web: exclure chunks de sources web désactivées
        AND NOT EXISTS (
          SELECT 1 FROM web_pages wp
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE wp.knowledge_base_id = kb.id
            AND ws.rag_enabled = false
        )
        -- Filtre legal_docs: seuls les chunks liés à un legal_document consolidé
        AND EXISTS (
          SELECT 1 FROM legal_documents ld
          WHERE ld.knowledge_base_id = kb.id
        )
      ORDER BY rank DESC
      LIMIT bm25_pool_limit
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, bm25_pool_limit))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        -- Fix Feb 26 v3: BM25-only weight 0.3→0.7
        (0.7::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
      FROM bm25_results br
      JOIN knowledge_base_chunks kbc ON br.b_chunk_id = kbc.id
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE br.b_chunk_id NOT IN (SELECT vr2.v_chunk_id FROM vector_results vr2)
    )
    SELECT
      fr.knowledge_base_id, fr.f_chunk_id AS chunk_id, fr.title, fr.chunk_content, fr.chunk_index,
      fr.vec_sim AS similarity, fr.f_bm25_rank AS bm25_rank, fr.f_hybrid_score AS hybrid_score,
      fr.category, fr.subcategory, fr.metadata
    FROM fused_results fr
    ORDER BY fr.f_hybrid_score DESC
    LIMIT limit_count;

  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_knowledge_base_hybrid(text, vector, text, text, int, double precision, text, text, int) IS
'Recherche hybride triple provider (OpenAI 1536-dim / Gemini 768-dim / Ollama 768-dim) + BM25 avec RRF.
Fix Feb 26 v1: OR logic BM25 — extrait termes de contenu (length>3) et joint avec OR.
Fix Feb 26 v2: bm25_pool_limit = GREATEST(limit_count*5, 100) — capte les articles COC en position 64+.
Fix Feb 26 v3: BM25-only weight 0.3→0.7 — équité avec vector-only dans fused_results UNION.
Fix Feb 27 v1: Filtre rag_enabled web — NOT EXISTS web_pages → web_sources.rag_enabled=false.
  Sources autoritaires (rag_enabled=true): 9anoun.tn, iort.gov.tn, cassation.tn.
Fix Feb 27 v2: kb.rag_enabled=true — filtre direct sur knowledge_base pour docs sans web_pages (ex: Google Drive).
  Docs google_drive marqués kb.rag_enabled=false → exclus du RAG.
Fix Feb 28 v1: Filtre legal_docs — EXISTS (legal_documents WHERE knowledge_base_id = kb.id).
  Seuls les KB entries référencés par un legal_document consolidé sont inclus dans le RAG.
  Les KB entries web_pages individuelles (cassation.tn, iort.gov.tn PDFs) sont excluses.';
