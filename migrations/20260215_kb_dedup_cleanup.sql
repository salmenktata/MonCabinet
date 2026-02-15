-- Migration: Nettoyage doublons KB
-- Supprime les entrées KB "brutes" (web_page → KB) quand un legal_document
-- canonique couvre le même contenu via sa propre entrée KB.
--
-- À exécuter APRÈS que les tables legal_documents soient déployées en prod
-- et que des doublons existent réellement.
--
-- Usage: psql -d qadhya -f migrations/20260215_kb_dedup_cleanup.sql

BEGIN;

-- 1. Identifier les entrées KB brutes à supprimer
-- (web_page a sa propre KB entry ET le legal_document lié a aussi sa KB entry)
CREATE TEMP TABLE kb_brut_to_delete AS
SELECT DISTINCT wp.knowledge_base_id as brut_kb_id, wp.id as web_page_id
FROM web_pages wp
JOIN web_pages_documents wpd ON wp.id = wpd.web_page_id
JOIN legal_documents ld ON wpd.legal_document_id = ld.id
WHERE wp.knowledge_base_id IS NOT NULL
  AND ld.knowledge_base_id IS NOT NULL
  AND wp.knowledge_base_id != ld.knowledge_base_id;

-- 2. Supprimer les chunks orphelins liés aux entrées KB brutes
DELETE FROM knowledge_base_chunks
WHERE knowledge_base_id IN (SELECT brut_kb_id FROM kb_brut_to_delete);

-- 3. Détacher les web_pages de leurs entrées KB brutes
UPDATE web_pages
SET knowledge_base_id = NULL, is_indexed = false, chunks_count = 0
WHERE id IN (SELECT web_page_id FROM kb_brut_to_delete);

-- 4. Supprimer les entrées KB brutes elles-mêmes
DELETE FROM knowledge_base
WHERE id IN (SELECT brut_kb_id FROM kb_brut_to_delete);

-- 5. Nettoyage
DROP TABLE kb_brut_to_delete;

COMMIT;
