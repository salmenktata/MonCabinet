/**
 * Backfill detected_category pour les pages existantes
 * Date: 2026-03-02
 * Description: Applique les patterns Option A (URL) sur toutes les web_pages
 *              dont detected_category est NULL.
 *
 * Ordre de priorité (CASE WHEN évalué dans l'ordre) :
 *   1. iort.gov.tn      → jort
 *   2. cassation.tn     → jurisprudence
 *   3. /kb/codes/       → codes
 *   4. /kb/constitution → constitution
 *   5. /kb/conventions  → conventions
 *   6. /modeles/ ou /formulaires/ → modeles
 *   7. /jurisprudence/ ou /arrets/ ou /decisions/ → jurisprudence
 *   8. /doctrine/ ou /articles/ → doctrine
 *   9. /procedures/     → procedures
 *  10. /guides/         → guides
 *  11. /lexique/        → lexique
 *  12. /actualites/     → actualites
 *  13. Fallback         → categories[1] de la source parente (1-based en PG)
 */

UPDATE web_pages wp
SET detected_category = CASE
  -- iort.gov.tn → jort
  WHEN ws.base_url ILIKE '%iort.gov.tn%'
    THEN 'jort'

  -- cassation.tn → jurisprudence
  WHEN ws.base_url ILIKE '%cassation.tn%'
    THEN 'jurisprudence'

  -- 9anoun.tn — codes
  WHEN wp.url ILIKE '%/kb/codes/%'
    THEN 'codes'

  -- 9anoun.tn — constitution
  WHEN wp.url ILIKE '%/kb/constitution%'
    THEN 'constitution'

  -- 9anoun.tn — conventions / traités
  WHEN wp.url ILIKE '%/kb/conventions%' OR wp.url ILIKE '%/kb/traites%'
    THEN 'conventions'

  -- modèles et formulaires
  WHEN wp.url ILIKE '%/modeles/%' OR wp.url ILIKE '%/formulaires/%'
    THEN 'modeles'

  -- jurisprudence (path générique)
  WHEN wp.url ILIKE '%/jurisprudence/%'
    OR wp.url ILIKE '%/arrets/%'
    OR wp.url ILIKE '%/decisions/%'
    THEN 'jurisprudence'

  -- doctrine / articles
  WHEN wp.url ILIKE '%/doctrine/%' OR wp.url ILIKE '%/articles/%'
    THEN 'doctrine'

  -- procédures
  WHEN wp.url ILIKE '%/procedures/%'
    THEN 'procedures'

  -- guides
  WHEN wp.url ILIKE '%/guides/%'
    THEN 'guides'

  -- lexique
  WHEN wp.url ILIKE '%/lexique/%'
    THEN 'lexique'

  -- actualités
  WHEN wp.url ILIKE '%/actualites/%'
    THEN 'actualites'

  -- Fallback : première catégorie de la source
  WHEN array_length(ws.categories, 1) > 0
    THEN ws.categories[1]

  ELSE 'autre'
END
FROM web_sources ws
WHERE wp.web_source_id = ws.id
  AND wp.detected_category IS NULL;

-- Stats
SELECT
  detected_category,
  COUNT(*) as nb_pages
FROM web_pages
WHERE detected_category IS NOT NULL
GROUP BY detected_category
ORDER BY nb_pages DESC;
