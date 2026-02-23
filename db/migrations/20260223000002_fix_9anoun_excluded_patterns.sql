-- Migration : Supprimer '*?page=*' des excluded_patterns de 9anoun.tn
-- Raison : Les sections /kb/jurisprudence, /kb/doctrine, /kb/lois peuvent utiliser
--          ?page=N pour la pagination → ces pages étaient ignorées lors du crawl.
--          url_patterns = ['https://9anoun.tn/kb/*'] garantit qu'on reste sur le domaine.
-- Date : 2026-02-23

UPDATE web_sources
SET excluded_patterns = array_remove(excluded_patterns, '*?page=*'),
    updated_at = NOW()
WHERE id = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'
  AND '*?page=*' = ANY(excluded_patterns);

-- Vérification
SELECT
  id,
  name,
  array_length(excluded_patterns, 1) AS nb_excluded,
  excluded_patterns
FROM web_sources
WHERE id = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9';
