-- Insertion de la source web legislation-securite.tn (DCAF)
-- Base de données législative tunisienne sur la sécurité (~3,998 textes)
-- À exécuter : psql -d qadhya -f scripts/insert-legislation-securite-source.sql

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
  'legislation-securite.tn - Législation Sécurité (DCAF)',
  'https://legislation-securite.tn',
  'legislation',
  'ar',
  7,
  '168 hours',  -- 1 fois/semaine
  true,         -- requires_javascript : WordPress avec Elementor
  true,         -- follow_links
  5000,         -- max_pages (couvre les ~3,998 textes)
  3,            -- max_depth
  10000,        -- rate_limit_ms : 10s comme demandé par robots.txt
  60000,        -- timeout_ms
  true,         -- use_sitemap : sitemap_index.xml avec 16 sitemaps
  false,        -- download_files

  -- Crawler uniquement les pages de lois arabes (éviter doublons FR)
  ARRAY[
    'https://legislation-securite.tn/ar/latest-laws/*',
    'https://legislation-securite.tn/fr/latest-laws/*'
  ],

  -- Exclure navigation, search, admin, stats
  ARRAY[
    '*/search*',
    '*/filter*',
    '*?*',
    '*/wp-admin*',
    '*/wp-login*',
    '*/statistics*',
    '*/about*',
    '*/privacy*',
    '*/sitemap*'
  ],

  true,   -- is_active
  true,   -- rag_enabled : CRITIQUE

  NOW(),
  NOW()
)
ON CONFLICT (base_url) DO UPDATE SET
  is_active = true,
  rag_enabled = true,
  updated_at = NOW()
RETURNING id, name, base_url;

\echo 'Source créée. Lancer le crawl avec :'
\echo '  curl -X POST http://localhost:3000/api/admin/web-sources/<ID>/crawl -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d "{\"jobType\":\"full_crawl\",\"async\":true,\"indexAfterCrawl\":true}"'
