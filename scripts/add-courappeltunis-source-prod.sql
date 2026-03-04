/**
 * Script SQL - Ajouter source web Cour d'Appel de Tunis en PRODUCTION
 *
 * Exécution sur VPS:
 *   docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < scripts/add-courappeltunis-source-prod.sql
 *
 * Ou via SSH:
 *   ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya" < scripts/add-courappeltunis-source-prod.sql
 */

-- Vérifier si la source existe déjà
DO $$
DECLARE
  source_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_count
  FROM web_sources
  WHERE base_url LIKE '%courappeltunis.justice.gov.tn%';

  IF source_count > 0 THEN
    RAISE NOTICE '⚠️  Source Cour d''Appel de Tunis existe déjà (% entrée(s))', source_count;
  ELSE
    INSERT INTO web_sources (
      name,
      base_url,
      description,
      categories,
      language,
      priority,
      crawl_frequency,
      adaptive_frequency,
      max_depth,
      max_pages,
      requires_javascript,
      rate_limit_ms,
      timeout_ms,
      url_patterns,
      excluded_patterns,
      follow_links,
      download_files,
      use_sitemap,
      respect_robots_txt,
      ignore_ssl_errors,
      is_active,
      rag_enabled,
      health_status,
      created_at,
      updated_at
    ) VALUES (
      'Cour d''Appel de Tunis - Jurisprudence',
      'https://courappeltunis.justice.gov.tn',
      'Site officiel de la Cour d''Appel de Tunis. Arrêts et décisions judiciaires en matière civile, commerciale et pénale. Jurisprudence des juridictions d''appel tunisiennes.',
      ARRAY['jurisprudence']::text[],
      'ar',
      7,
      '168 hours'::interval,   -- crawl hebdomadaire (décisions peu fréquentes)
      true,
      3,
      500,
      false,
      1500,                    -- 1,5s entre requêtes (site gouvernemental)
      45000,                   -- timeout 45s (site gouvernemental parfois lent)
      ARRAY[
        'https://courappeltunis.justice.gov.tn/*arret*',
        'https://courappeltunis.justice.gov.tn/*decision*',
        'https://courappeltunis.justice.gov.tn/*jugement*',
        'https://courappeltunis.justice.gov.tn/*قرار*',
        'https://courappeltunis.justice.gov.tn/*حكم*'
      ]::text[],
      ARRAY[
        '/contact',
        '/login',
        '/admin',
        '/search',
        '*/print*',
        '*.pdf'               -- PDFs gérés séparément si besoin
      ]::text[],
      true,
      true,
      false,                   -- sitemap probablement absent
      true,
      true,                    -- ignore_ssl_errors: certificat SSL invalide sur ce site
      false,                   -- désactivé initialement : valider le crawl avant activation
      false,                   -- rag_enabled false jusqu'à validation du contenu indexé
      'unknown',
      NOW(),
      NOW()
    );

    RAISE NOTICE '✅ Source Cour d''Appel de Tunis créée (is_active=false, rag_enabled=false — activer après validation)';
  END IF;
END $$;

-- Afficher les sources jurisprudence
SELECT
  id,
  name,
  base_url,
  categories,
  language,
  priority,
  is_active,
  rag_enabled,
  health_status,
  created_at
FROM web_sources
WHERE categories @> ARRAY['jurisprudence']::text[]
   OR base_url LIKE '%courappeltunis%'
ORDER BY created_at DESC;
