-- Insertion de la source web 9anoun.tn - Constitutions
-- À exécuter : psql -d qadhya -f scripts/insert-9anoun-constitutions-source.sql

INSERT INTO web_sources (
  id,
  name,
  base_url,
  category,
  language,
  priority,
  crawl_frequency,
  requires_javascript,
  follow_links,
  max_pages,
  max_depth,
  rate_limit_ms,
  timeout_ms,
  use_sitemap,
  download_files,
  url_patterns,
  excluded_patterns,
  is_active,
  rag_enabled,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '9anoun.tn - Constitutions',
  'https://9anoun.tn/kb/constitutions',
  'constitution',
  'ar',
  9,
  '168 hours',  -- 1 fois/semaine (textes constitutionnels stables)
  true,         -- requires_javascript : Playwright requis pour 9anoun.tn
  true,         -- follow_links : découverte automatique des articles
  100,          -- max_pages
  3,            -- max_depth
  100,          -- rate_limit_ms (même config que les codes)
  60000,        -- timeout_ms (1 minute)
  false,        -- use_sitemap
  false,        -- download_files

  -- url_patterns : Inclure uniquement /kb/constitutions/*
  ARRAY['https://9anoun.tn/kb/constitutions/*'],

  -- excluded_patterns : Exclure recherche, filtres, pagination
  ARRAY['*/search*', '*/filter*', '*?page=*'],

  true,         -- is_active
  true,         -- rag_enabled : CRITIQUE - doit être true pour le RAG

  NOW(),
  NOW()
)
ON CONFLICT (base_url) DO UPDATE SET
  is_active = true,
  rag_enabled = true,
  updated_at = NOW()
RETURNING id, name, base_url;

\echo 'Source créée avec succès. Récupérez l''ID ci-dessus pour lancer le crawl.'
\echo 'Lancer le crawl via :'
\echo '  curl -X POST http://localhost:3000/api/admin/web-sources/<ID>/crawl -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d "{\"jobType\":\"full_crawl\",\"async\":true,\"indexAfterCrawl\":true}"'
