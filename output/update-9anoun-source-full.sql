-- Mise à jour de la source 9anoun.tn pour crawl complet /kb
-- Source ID : 4319d2d1-569c-4107-8f52-d71e2a2e9fe9
-- Date : 2026-02-11T17:19:00.396Z

UPDATE web_sources
SET
  name = '9anoun.tn - Knowledge Base Complète (Hybride Optimisé)',
  base_url = 'https://9anoun.tn/kb',
  requires_javascript = true,  -- Playwright pour pages d'accueil
  follow_links = true,          -- Découverte automatique
  max_pages = 30000,            -- Limite haute (codes + jurisprudence + doctrine)
  max_depth = 4,                -- Profondeur suffisante
  rate_limit_ms = 100,          -- Crawl rapide
  timeout_ms = 60000,           -- 1 min par page
  use_sitemap = false,
  download_files = false,

  -- Seed URLs : toutes les sections KB
  seed_urls = ARRAY[
    'https://9anoun.tn/kb/codes/code-obligations-contrats',
    'https://9anoun.tn/kb/codes/code-nationalite',
    'https://9anoun.tn/kb/codes/code-droits-reels',
    'https://9anoun.tn/kb/codes/code-foncier',
    'https://9anoun.tn/kb/codes/code-statut-personnel',
    'https://9anoun.tn/kb/codes/code-protection-enfant',
    'https://9anoun.tn/kb/codes/code-commerce',
    'https://9anoun.tn/kb/codes/code-changes-commerce-exterieur',
    'https://9anoun.tn/kb/codes/projet-code-des-changes-2024',
    'https://9anoun.tn/kb/codes/code-societes-commerciales',
    'https://9anoun.tn/kb/codes/code-commerce-maritime',
    'https://9anoun.tn/kb/codes/code-ports-maritimes',
    'https://9anoun.tn/kb/codes/code-organisation-navigation-maritime',
    'https://9anoun.tn/kb/codes/code-peche-maritime',
    'https://9anoun.tn/kb/codes/code-penal',
    'https://9anoun.tn/kb/codes/code-justice-militaire',
    'https://9anoun.tn/kb/codes/code-disciplinaire-penal-maritime',
    'https://9anoun.tn/kb/codes/code-procedure-civile-commerciale',
    'https://9anoun.tn/kb/codes/code-procedure-penale',
    'https://9anoun.tn/kb/codes/code-arbitrage',
    'https://9anoun.tn/kb/codes/code-travail',
    'https://9anoun.tn/kb/codes/code-travail-maritime',
    'https://9anoun.tn/kb/codes/code-travail-proposition-amendements-2025',
    'https://9anoun.tn/kb/codes/code-impot-sur-revenu-personnes-physiques-impot-sur-les-societes',
    'https://9anoun.tn/kb/codes/code-tva',
    'https://9anoun.tn/kb/codes/code-droits-procedures-fiscales',
    'https://9anoun.tn/kb/codes/code-enregistrement-timbre-fiscal',
    'https://9anoun.tn/kb/codes/code-fiscalite-locale',
    'https://9anoun.tn/kb/codes/code-douanes',
    'https://9anoun.tn/kb/codes/code-comptabilite-publique',
    'https://9anoun.tn/kb/codes/code-collectivites-locales',
    'https://9anoun.tn/kb/codes/code-amenagement-territoire-urbanisme',
    'https://9anoun.tn/kb/codes/code-decorations',
    'https://9anoun.tn/kb/codes/code-presse',
    'https://9anoun.tn/kb/codes/code-patrimoine',
    'https://9anoun.tn/kb/codes/code-cinema',
    'https://9anoun.tn/kb/codes/code-route',
    'https://9anoun.tn/kb/codes/code-postal',
    'https://9anoun.tn/kb/codes/code-deontologie-medicale',
    'https://9anoun.tn/kb/codes/code-deontologie-veterinaire',
    'https://9anoun.tn/kb/codes/code-deontologie-architectes',
    'https://9anoun.tn/kb/codes/code-prevention-incendies',
    'https://9anoun.tn/kb/codes/code-assurances',
    'https://9anoun.tn/kb/codes/code-droit-international-prive',
    'https://9anoun.tn/kb/codes/code-services-financiers-non-residents',
    'https://9anoun.tn/kb/codes/code-opcvm',
    'https://9anoun.tn/kb/codes/code-investissements',
    'https://9anoun.tn/kb/codes/code-forestier',
    'https://9anoun.tn/kb/codes/code-eaux',
    'https://9anoun.tn/kb/codes/code-minier',
    'https://9anoun.tn/kb/codes/code-hydrocarbures',
    'https://9anoun.tn/kb/codes/code-aviation-civile',
    'https://9anoun.tn/kb/codes/code-aeronautique-civile',
    'https://9anoun.tn/kb/codes/code-telecommunications',
    'https://9anoun.tn/kb/jurisprudence',
    'https://9anoun.tn/kb/doctrine',
    'https://9anoun.tn/kb/jorts',
    'https://9anoun.tn/kb/constitutions',
    'https://9anoun.tn/kb/conventions',
    'https://9anoun.tn/kb/lois',
    'https://9anoun.tn/kb'
  ],

  -- Patterns d'inclusion
  url_patterns = ARRAY[
    'https://9anoun.tn/kb/*'
  ],

  -- Patterns d'exclusion
  excluded_patterns = ARRAY[
    '*/search*',
    '*/filter*',
    -- '*?page=*' retiré (migration 20260223000002) — permet le crawl des pages paginées
    -- ex: /kb/jurisprudence?page=2, /kb/doctrine?page=3
    '*?showComment=*',
    '*.html?m=1',      -- Version mobile
    '*.html#*'         -- Ancres
  ],

  updated_at = NOW()
WHERE id = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9';

-- Vérification
SELECT
  id,
  name,
  base_url,
  requires_javascript,
  follow_links,
  max_pages,
  max_depth,
  array_length(seed_urls, 1) as nb_seed_urls
FROM web_sources
WHERE id = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9';
