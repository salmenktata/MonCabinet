/**
 * Script SQL - Ajouter source web legislation.tn en PRODUCTION
 *
 * Exécution sur VPS:
 *   docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < scripts/add-legislation-tn-source-prod.sql
 *
 * Ou via SSH:
 *   ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya" < scripts/add-legislation-tn-source-prod.sql
 */

-- Vérifier si la source existe déjà
DO $$
DECLARE
  source_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_count
  FROM web_sources
  WHERE base_url LIKE '%legislation.tn%';

  IF source_count > 0 THEN
    RAISE NOTICE '⚠️  Source legislation.tn existe déjà (% entrée(s))', source_count;
  ELSE
    -- Créer la source web
    INSERT INTO web_sources (
      name,
      base_url,
      category,
      description,
      is_active,
      crawl_config,
      created_at,
      updated_at
    ) VALUES (
      'Législation Tunisienne (legislation.tn)',
      'https://legislation.tn',
      'codes',
      'Portail officiel des codes et lois de la République Tunisienne. Contient les codes complets (pénal, civil, commerce, travail, etc.) avec modifications et versions consolidées.',
      true,
      jsonb_build_object(
        'max_depth', 3,
        'max_pages', 200,
        'rate_limit_ms', 2000,
        'start_urls', jsonb_build_array(
          'https://legislation.tn/fr/codes',
          'https://legislation.tn/ar/codes'
        ),
        'url_patterns', jsonb_build_array(
          'https://legislation.tn/*/code-*',
          'https://legislation.tn/*/loi-*'
        ),
        'exclude_patterns', jsonb_build_array(
          '/recherche',
          '/contact',
          '/apropos'
        ),
        'requires_javascript', true,
        'timeout', 30000
      ),
      NOW(),
      NOW()
    );

    RAISE NOTICE '✅ Source legislation.tn créée avec succès !';
  END IF;
END $$;

-- Afficher les sources codes/legislation
SELECT
  id,
  name,
  base_url,
  category,
  is_active,
  (crawl_config->>'max_pages')::int as max_pages,
  created_at
FROM web_sources
WHERE category IN ('codes', 'legislation')
   OR base_url LIKE '%legislation%'
   OR base_url LIKE '%code%'
ORDER BY created_at DESC;
