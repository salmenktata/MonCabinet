-- Analyse de la distribution des scores de qualité

-- 1. Distribution générale
SELECT
  CASE
    WHEN quality_score < 20 THEN '00-19 Très faible'
    WHEN quality_score < 40 THEN '20-39 Faible'
    WHEN quality_score < 60 THEN '40-59 Moyen'
    WHEN quality_score < 80 THEN '60-79 Bon'
    ELSE '80-100 Excellent'
  END as range,
  COUNT(*) as count,
  ROUND(AVG(quality_score), 1) as avg_score
FROM knowledge_base
WHERE quality_score IS NOT NULL
GROUP BY range
ORDER BY range;

-- 2. Top 10 meilleurs scores
SELECT
  title,
  quality_score,
  quality_clarity,
  quality_structure,
  quality_completeness,
  quality_reliability
FROM knowledge_base
WHERE quality_score IS NOT NULL
ORDER BY quality_score DESC
LIMIT 10;

-- 3. Bottom 10 pires scores
SELECT
  title,
  quality_score,
  quality_clarity,
  quality_structure,
  quality_completeness,
  quality_reliability
FROM knowledge_base
WHERE quality_score IS NOT NULL
ORDER BY quality_score ASC
LIMIT 10;

-- 4. Statistiques par catégorie
SELECT
  category,
  COUNT(*) as total_docs,
  ROUND(AVG(quality_score), 1) as avg_score,
  MIN(quality_score) as min_score,
  MAX(quality_score) as max_score
FROM knowledge_base
WHERE quality_score IS NOT NULL
GROUP BY category
ORDER BY avg_score DESC;
