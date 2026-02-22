-- Migration: Fix chunk_count = 0 pour documents avec des chunks existants
-- Date: 2026-02-22
-- Contexte: Audit KB révèle 242 docs avec chunk_count=0 malgré 648 chunks réels.
-- La colonne chunk_count n'est pas toujours mise à jour par les opérations de rechunk.

UPDATE knowledge_base kb
SET chunk_count = (
  SELECT COUNT(*)
  FROM knowledge_base_chunks kbc
  WHERE kbc.knowledge_base_id = kb.id
),
updated_at = NOW()
WHERE (kb.chunk_count = 0 OR kb.chunk_count IS NULL)
  AND EXISTS (
    SELECT 1 FROM knowledge_base_chunks kbc
    WHERE kbc.knowledge_base_id = kb.id
  );
