-- Backfill quality_score heuristique pour les documents KB sans score LLM
-- À appliquer en prod : psql -U moncabinet -d qadhya -f backfill-quality-scores.sql
--
-- Formule heuristique (sans LLM) :
--   Base 50 pts
--   +10 si chunk_count >= 1
--   +10 si chunk_count >= 5
--   +5  si chunk_count >= 10
--   +10 si LENGTH(full_text) > 500
--   +5  si LENGTH(full_text) > 2000
--   +10 si title IS NOT NULL AND LENGTH(title) > 5
--   = 20 si LENGTH(full_text) < 100 (contenu quasi-vide)
--   = 35 si LENGTH(full_text) BETWEEN 100 AND 200 (contenu très court)
--
-- Ne touche QUE les docs avec quality_score IS NULL
-- Ne touche PAS les docs déjà évalués par LLM

UPDATE knowledge_base
SET
  quality_score = CASE
    WHEN LENGTH(COALESCE(full_text, '')) < 100 THEN 20
    WHEN LENGTH(COALESCE(full_text, '')) < 200 THEN 35
    ELSE LEAST(100, GREATEST(0,
      50
      + CASE WHEN chunk_count >= 1  THEN 10 ELSE 0 END
      + CASE WHEN chunk_count >= 5  THEN 10 ELSE 0 END
      + CASE WHEN chunk_count >= 10 THEN 5  ELSE 0 END
      + CASE WHEN LENGTH(COALESCE(full_text, '')) > 500  THEN 10 ELSE 0 END
      + CASE WHEN LENGTH(COALESCE(full_text, '')) > 2000 THEN 5  ELSE 0 END
      + CASE WHEN title IS NOT NULL AND LENGTH(title) > 5 THEN 10 ELSE 0 END
    ))
  END,
  quality_llm_provider  = 'heuristic',
  quality_llm_model     = 'rule-based',
  quality_assessed_at   = NOW(),
  updated_at            = NOW()
WHERE
  is_indexed = true
  AND quality_score IS NULL;

-- Résumé après backfill
SELECT
  quality_llm_provider,
  COUNT(*)                            AS total,
  ROUND(AVG(quality_score), 1)        AS avg_score,
  MIN(quality_score)                  AS min_score,
  MAX(quality_score)                  AS max_score,
  COUNT(*) FILTER (WHERE quality_score >= 80) AS count_excellent,
  COUNT(*) FILTER (WHERE quality_score >= 60) AS count_good,
  COUNT(*) FILTER (WHERE quality_score < 40)  AS count_low
FROM knowledge_base
WHERE is_indexed = true
GROUP BY quality_llm_provider
ORDER BY total DESC;
