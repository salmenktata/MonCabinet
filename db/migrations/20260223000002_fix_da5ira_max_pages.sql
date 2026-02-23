-- Migration: Corriger la configuration de crawl da5ira.com
-- Problème : max_pages trop bas (~100) alors que le site contient 1 367 articles
--           excluded_patterns en syntaxe glob → doivent être de vraies regex

-- 1. Augmenter max_pages de ~100 → 2000 et corriger les excluded_patterns
UPDATE web_sources
SET
  max_pages = 2000,
  excluded_patterns = ARRAY[
    '\\.html\\?m=1',           -- URLs mobiles Blogger (?m=1)
    '\\.html#',                -- Ancres fragment (#commentaires…)
    '\\.html\\?showComment=',  -- Formulaires de commentaires
    '/search/label/'           -- Pages de catégories (contenu dupliqué)
  ]
WHERE base_url ILIKE '%da5ira.com%';
