-- Migration : Suppression des chunks sans contenu utile
-- Date : 2026-03-01
-- Cause : Deux types de chunks quasi-vides (<50 chars) détectés en prod :
--   1. Artifacts tableaux markdown (| |, |------|) : 93 chunks — bruit pur du scraping
--   2. Headers d'articles abrogés (مجلة الشغل | الفصل 1 | [codes]\n---\nالفصل 1) : 591 chunks
--      Articles sans corps = abrogés sur 9anoun.tn, aucune valeur RAG
-- Fix code associé : chunking-service.ts isContentlessChunk() (Mar 01, 2026)

BEGIN;

-- ============================================================================
-- ÉTAPE 1 : Identifier les docs impactés (pour mise à jour chunk_count après)
-- ============================================================================
CREATE TEMP TABLE _affected_docs AS
SELECT DISTINCT kbc.knowledge_base_id
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
WHERE kb.is_indexed = true
  AND LENGTH(kbc.content) < 50
  AND (
    -- Artifact tableau markdown : uniquement pipes, tirets, espaces
    kbc.content ~ '^[\s|\-─═\*]+$'
    OR
    -- Header-only article code abrogé
    kbc.content ~ '^.+\|\s*الفصل\s+[\d ]+\s*\|\s*\[codes\]\n---\n(الفصل|Article)\s+[\d ]+\s*$'
  );

-- Vérification avant suppression
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
  WHERE kb.is_indexed = true
    AND LENGTH(kbc.content) < 50
    AND (
      kbc.content ~ '^[\s|\-─═\*]+$'
      OR kbc.content ~ '^.+\|\s*الفصل\s+[\d ]+\s*\|\s*\[codes\]\n---\n(الفصل|Article)\s+[\d ]+\s*$'
    );
  RAISE NOTICE 'Chunks à supprimer : %', v_count;
END $$;

-- ============================================================================
-- ÉTAPE 2 : Supprimer les chunks sans contenu utile
-- ============================================================================
DELETE FROM knowledge_base_chunks kbc
USING knowledge_base kb
WHERE kb.id = kbc.knowledge_base_id
  AND kb.is_indexed = true
  AND LENGTH(kbc.content) < 50
  AND (
    kbc.content ~ '^[\s|\-─═\*]+$'
    OR kbc.content ~ '^.+\|\s*الفصل\s+[\d ]+\s*\|\s*\[codes\]\n---\n(الفصل|Article)\s+[\d ]+\s*$'
  );

-- ============================================================================
-- ÉTAPE 3 : Resynchroniser chunk_count sur les docs impactés
-- ============================================================================
UPDATE knowledge_base kb
SET chunk_count = (
  SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id
)
WHERE kb.id IN (SELECT knowledge_base_id FROM _affected_docs);

-- ============================================================================
-- ÉTAPE 4 : Corriger les 3 docs chunk_count désynchronisés (détectés lors du diagnostic)
-- ============================================================================
UPDATE knowledge_base
SET chunk_count = (
  SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = knowledge_base.id
)
WHERE is_indexed = true
  AND chunk_count != (
    SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = knowledge_base.id
  );

DROP TABLE _affected_docs;

COMMIT;
