-- Migration: Désactiver les KB entries liées à des web_files de sources inactives
-- Date: 2026-02-28
--
-- Contexte: Les web_files sont liés à knowledge_base via web_files.knowledge_base_id (lien direct).
-- Le filtre RAG existant (NOT EXISTS web_pages → ws.rag_enabled=false) ne capture pas ces entrées
-- car elles ne passent PAS par web_pages. Résultat : 2 802 KB entries de sources inactives
-- (legislation-securite.tn, jibaya.tn, wrcati.org, da5ira.com, justice.gov.tn) avaient
-- kb.rag_enabled=true et étaient accessibles dans le RAG malgré ws.rag_enabled=false.
--
-- Solution: Propager ws.rag_enabled=false → kb.rag_enabled=false pour ces entrées.
-- Le filtre AND kb.rag_enabled = true dans les 6 CTEs de search_knowledge_base_hybrid suffit ensuite.
--
-- Impact attendu: ~2 802 lignes
-- =============================================================================

UPDATE knowledge_base kb
SET rag_enabled = false
FROM web_files wf
JOIN web_sources ws ON ws.id = wf.web_source_id
WHERE wf.knowledge_base_id = kb.id
  AND ws.rag_enabled = false
  AND kb.rag_enabled = true;

-- Vérification post-migration
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM knowledge_base kb
  JOIN web_files wf ON wf.knowledge_base_id = kb.id
  JOIN web_sources ws ON ws.id = wf.web_source_id
  WHERE ws.rag_enabled = false
    AND kb.rag_enabled = true;

  IF v_remaining > 0 THEN
    RAISE WARNING 'Il reste % KB entries de sources inactives avec rag_enabled=true', v_remaining;
  ELSE
    RAISE NOTICE 'OK: Toutes les KB entries de sources inactives ont rag_enabled=false';
  END IF;
END $$;
