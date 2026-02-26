-- Migration: Fix BM25 — OR logic pour queries question-form (AR/FR)
-- Date: 2026-02-26
--
-- Problème root-cause (ar_civil_* R@5=0.00):
--   plainto_tsquery('simple', 'ما هي شروط صحة العقد في القانون التونسي؟')
--   → 'ما' & 'هي' & 'شروط' & 'صحة' & 'العقد' & 'في' & 'القانون' & 'التونسي'
--   AND logique : TOUS les termes doivent être présents dans le chunk.
--   Les articles COC ('الفصل 2 أركان العقد...') ne contiennent PAS ما, هي, في,
--   القانون → 0 résultats BM25 → COC never appears in pool.
--
-- Fix: Extraire les termes de contenu (length > 3 chars = sans particules ما هي في ب ل)
--       et les rejoindre avec OR → websearch_to_tsquery('simple', 'شروط OR صحة OR العقد OR ...')
--       → chaque article contenant AU MOINS UN terme legal match → COC trouvé ✅
--
-- Impact attendu:
--   - BM25 trouve COC (bm25Rank ≈ 0.3-0.5)
--   - effectiveSimilarity = max(0.35, min(0.50, bm25Rank×10)) = 0.35-0.50
--   - CODE_PRIORITY_BOOST × 2.0 → effective similarity 0.70-1.0 > JORT 0.84 ✅
--   - R@5 ar_civil_* : 0.00 → > 0.60 (cible)
--
-- Pas de régression FR : les queries FR courtes (sans particules) fonctionnent déjà bien.
--   Avec OR, plus de recall (tolérant) → légère amélioration possible.
--
-- =============================================================================
-- ROLLBACK:
--   Réappliquer 20260224000001_fix_bm25_bilingual.sql
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
BEGIN
  -- =========================================================================
  -- Construire la tsquery BM25 avec OR logic pour queries longues (questions)
  -- =========================================================================
  --
  -- Stratégie :
  --   1. Extraire les termes de contenu (longueur > 3 chars pour AR, > 3 pour FR)
  --      → supprime les particules arabes (ما, هي, في, على, من, ب, ل, و, أن)
  --      → supprime les petits mots français (en, de, la, le, les, un, une, et...)
  --   2. Rejoindre avec OR pour websearch_to_tsquery
  --      → chaque article contenant UN terme parmi les termes clés match ✅
  --   3. Utiliser config 'simple' (matches content_tsvector = to_tsvector('simple', content))
  --
  -- Fallback : si pas assez de termes longs, utiliser plainto_tsquery sur query_text entier

  v_min_len := CASE WHEN p_language = 'ar' THEN 3 ELSE 3 END;

  SELECT array_agg(w)
  INTO v_terms
  FROM (
    SELECT DISTINCT trim(w) AS w
    FROM unnest(string_to_array(query_text, ' ')) AS w
    WHERE length(trim(w)) > v_min_len
      AND trim(w) !~ '^[[:punct:]]+$'  -- Exclure tokens purement ponctuation
  ) t;

  IF v_terms IS NOT NULL AND array_length(v_terms, 1) >= 2 THEN
    -- Au moins 2 termes de contenu → OR logic
    v_or_query := array_to_string(v_terms, ' OR ');
    BEGIN
      bm25_q := websearch_to_tsquery('simple', v_or_query);
    EXCEPTION WHEN others THEN
      bm25_q := plainto_tsquery('simple', query_text);
    END;
  ELSE
    -- Fallback : 1 seul terme ou query très courte → AND classique
    bm25_q := plainto_tsquery('simple', query_text);
  END IF;

  -- Enrichir avec config langue (stop-word removal supplémentaire, sans casser le recall)
  -- Note: OR avec la version langue-spécifique → broader coverage
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
      NULL;  -- Config langue absente → 'simple' suffit
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
      LIMIT limit_count * 2
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, limit_count * 2))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        (0.3::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
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
      LIMIT limit_count * 2
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, limit_count * 2))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        (0.3::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
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
      LIMIT limit_count * 2
    ),
    fused_results AS (
      SELECT
        vr.knowledge_base_id, vr.v_chunk_id AS f_chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
        vr.vec_sim, COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
        vr.category, vr.subcategory, vr.metadata,
        ((0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
         (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, limit_count * 2))::double precision)) AS f_hybrid_score
      FROM vector_results vr
      LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
      UNION
      SELECT
        kbc.knowledge_base_id, br.b_chunk_id AS f_chunk_id, kb.title, kbc.content AS chunk_content, kbc.chunk_index,
        0.0::double precision AS vec_sim, br.rank::double precision AS f_bm25_rank,
        kb.category::text, kb.subcategory::text, kb.metadata,
        (0.3::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
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
Pondération: 70% vectoriel, 30% BM25.
Fix Feb 26: OR logic BM25 — extrait termes de contenu (length>3) et joint avec OR.
→ Résout le problème des queries question-form arabes qui ne matchaient jamais les articles COC.
p_language (ar|fr|simple) : ajoute optionnellement la version langue-spécifique en OR.';
