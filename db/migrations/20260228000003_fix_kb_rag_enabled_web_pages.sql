-- Migration: Désactiver les KB entries liées à des web_pages de sources inactives
-- Date: 2026-02-28
--
-- Contexte: Complément de 20260228000002 (qui corrigeait les web_files).
-- 6 007 KB entries ont kb.rag_enabled=true alors que leurs web_pages pointent vers
-- des sources avec ws.rag_enabled=false. La fonction search_knowledge_base_hybrid
-- les filtre déjà via NOT EXISTS au moment de la requête, mais cela cause :
--   1. Incohérence DB (kb.rag_enabled=true mais jamais retournés)
--   2. Gaspillage CPU (subquery NOT EXISTS évalué pour ~20 933 chunks à chaque appel)
--
-- Sources concernées (via web_pages.knowledge_base_id) :
--   Google Drive : 1 338 KB entries / 11 334 chunks
--   légis-securite.tn : 1 682 KB entries / 3 791 chunks
--   wrcati.org : 1 794 KB entries / 3 705 chunks
--   da5ira.com : 626 KB entries / 1 482 chunks
--   jibaya.tn : 399 KB entries / 404 chunks
--   Autres inactifs : 168 KB entries / 217 chunks
--   Total : ~6 007 KB entries / ~20 933 chunks
--
-- Impact: chunks_rag_actifs passe de ~38 397 → ~17 461 (cohérent avec la réalité)
-- =============================================================================

UPDATE knowledge_base kb
SET rag_enabled = false
FROM web_pages wp
JOIN web_sources ws ON ws.id = wp.web_source_id
WHERE wp.knowledge_base_id = kb.id
  AND ws.rag_enabled = false
  AND kb.rag_enabled = true;

-- Vérification post-migration
DO $$
DECLARE
  v_remaining int;
  v_total_active int;
BEGIN
  SELECT COUNT(DISTINCT kb.id) INTO v_remaining
  FROM knowledge_base kb
  JOIN web_pages wp ON wp.knowledge_base_id = kb.id
  JOIN web_sources ws ON ws.id = wp.web_source_id
  WHERE ws.rag_enabled = false AND kb.rag_enabled = true;

  SELECT COUNT(*) INTO v_total_active
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.rag_enabled = true AND kb.is_indexed = true;

  IF v_remaining > 0 THEN
    RAISE WARNING 'Il reste % KB entries de sources inactives avec rag_enabled=true', v_remaining;
  ELSE
    RAISE NOTICE 'OK: Toutes les KB entries de sources inactives (via web_pages) ont rag_enabled=false';
  END IF;

  RAISE NOTICE 'Chunks RAG actifs après fix: %', v_total_active;
END $$;
