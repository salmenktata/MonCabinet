-- Insertion de la source web 9anoun.tn en mode hybride optimisé
-- À exécuter : psql -d qadhya -f scripts/insert-9anoun-source.sql

-- Supprimer la source existante si elle existe (optionnel)
-- DELETE FROM web_sources WHERE base_url LIKE '%9anoun.tn%';

-- Insérer la nouvelle source
INSERT INTO web_sources (
  id,
  name,
  base_url,
  requires_javascript,
  follow_links,
  max_pages,
  max_depth,
  rate_limit_ms,
  timeout_ms,
  use_sitemap,
  download_files,
  seed_urls,
  url_patterns,
  excluded_patterns,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '9anoun.tn - Codes Juridiques (Hybride Optimisé)',
  'https://9anoun.tn/kb/codes',
  true,    -- requires_javascript : Playwright pour pages d'accueil
  true,    -- follow_links : Découverte automatique des articles
  10000,   -- max_pages
  3,       -- max_depth
  100,     -- rate_limit_ms
  60000,   -- timeout_ms (1 minute)
  false,   -- use_sitemap
  false,   -- download_files

  -- seed_urls : 54 pages d'accueil des codes
  ARRAY[
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
    'https://9anoun.tn/kb/codes/code-telecommunications'
  ],

  -- url_patterns : Inclure uniquement /kb/codes/*
  ARRAY['https://9anoun.tn/kb/codes/*'],

  -- excluded_patterns : Exclure recherche, filtres, pagination
  ARRAY['*/search*', '*/filter*', '*?page=*'],

  NOW(),
  NOW()
)
RETURNING id, name, base_url;

-- Afficher l'ID de la source créée
\echo 'Source créée avec succès. Récupérez l''ID ci-dessus pour lancer le crawl.'
