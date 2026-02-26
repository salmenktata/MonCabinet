-- Migration: Fix poids BM25-only dans fused_results (0.3 → 0.7)
-- Date: 2026-02-26
--
-- Problème identifié (ar_civil_* R@5=0 après fix bm25_pool_limit=100) :
--
--   CAUSE RACINE : la formule RRF défavorise structurellement les chunks BM25-only.
--
--   Pour la query "شروط صحة العقد" :
--   - Fsl 2 (gold chunk, "أركان العقد") :
--       vecSim < 0.15 → PAS dans vector_results (threshold codes-forced)
--       bm25Rank=0.3, position=1 dans bm25_results
--       fused_results BM25-only : hybrid_score = 0.3/(60+1) = 0.0049
--
--   - Fsl 259 (chunk NON gold, "payment foreign currency") :
--       vecSim ≈ 0.40 → DANS vector_results (threshold 0.15 OK)
--       bm25Rank=0 (ne contient pas "شروط")
--       fused_results vector-only : hybrid_score = 0.7/(60+1) = 0.0115
--
--   Fsl 259 (0.0115) >> Fsl 2 (0.0049) → LIMIT 15 exclut Fsl 2 ❌
--
--   Résultat : TypeScript boost v6 ne peut pas aider car Fsl 2 n'est JAMAIS retourné par le SQL.
--
-- Fix :
--   BM25-only UNION weight : 0.3 → 0.7
--   Fsl 2 BM25-only score : 0.7/(60+1) = 0.0115 (=Fsl 259) → entre dans LIMIT 15 ✅
--
--   Ensuite TypeScript boost v6+v7 :
--   - Fsl 2 (isTargetCode, bm25Rank=0.3) : bm25EffSim=0.80 → 0.80×1.50=1.20→1.0 (capped)
--   - Fsl 259 (isTargetCode, vecSim=0.40, bm25Rank=0) : 0.40×1.50=0.60 < JORT 0.84
--   → Fsl 2 gagne ✅
--
-- Pas de régression attendue :
--   - Chunks BM25-only avec bonne pertinence textuelle (bm25Rank élevé) méritent d'être remontés
--   - Le poids 0.3 was artificially low ; 0.7 = équité avec chunks vector-only
--   - Impact regular searches (non codes-forced) : BM25 recall amélioré pour texte exact
--
-- Note TypeScript associé :
--   - bm25EffSim floor : 0.35→0.60 (meilleure discrimination vs vecSim seul)
--   - CODE_PRIORITY_BOOST : AR 2.5→1.50, FR 3.0→1.60 (éviter cap à 1.0 de tous les chunks)
--
-- =============================================================================
-- ROLLBACK:
--   Réappliquer 20260226000002_fix_bm25_limit.sql
-- =============================================================================

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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding_openai <=> query_embedding)) >= vector_threshold
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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
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
        -- Fsl 2 BM25-only rank=1: 0.7/61=0.0115 vs Fsl 259 vector-only rank=1: 0.7/61=0.0115
        -- → Fsl 2 entre dans LIMIT 15 au lieu d'être exclu à 0.3/61=0.0049
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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding_gemini <=> query_embedding)) >= vector_threshold
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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
        AND (1 - (kbc.embedding <=> query_embedding)) >= vector_threshold
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
        AND (category_filter IS NULL OR kb.category::text = category_filter)
        AND (doc_type_filter IS NULL OR kb.doc_type::text = doc_type_filter)
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

COMMENT ON FUNCTION search_knowledge_base_hybrid IS
'Recherche hybride triple provider (OpenAI 1536-dim / Gemini 768-dim / Ollama 768-dim) + BM25 avec RRF.
Fix Feb 26 v1: OR logic BM25 — extrait termes de contenu (length>3) et joint avec OR.
Fix Feb 26 v2: bm25_pool_limit = GREATEST(limit_count*5, 100) — capte les articles COC en position 64+.
Fix Feb 26 v3: BM25-only weight 0.3→0.7 — équité avec vector-only dans fused_results UNION.
  Problème: Fsl 2 (BM25-only rank 1) = 0.3/61=0.0049 << Fsl 259 (vector-only rank 1) = 0.7/61=0.0115.
  Fix: 0.7/61=0.0115 → même score → entre dans LIMIT 15 → TypeScript boost v6 peut agir.';
