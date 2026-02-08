-- Règles de classification pour les nouveaux tribunaux
-- Ces règles sont des exemples de base qui devront être adaptées selon la structure réelle des sources web

-- ============================================================================
-- COURS D'APPEL (Détection générique via keywords)
-- ============================================================================

-- Note: Ces règles utilisent une approche générique avec keywords.
-- Pour une meilleure précision, il faudrait analyser chaque source web
-- et créer des règles spécifiques basées sur leurs breadcrumbs/URLs.

-- Exemple : Règles génériques pour une source web (à dupliquer pour chaque source active)

/*
-- Nabeul
INSERT INTO source_classification_rules (
  web_source_id, name, description,
  conditions, target_category, target_subcategory,
  priority, confidence_boost, is_active
)
SELECT
  id as web_source_id,
  'Détection Cour Appel Nabeul',
  'Détecte les arrêts de la Cour d''appel de Nabeul via keywords',
  '[
    {"type": "content_contains", "value": "cour d''appel de nabeul", "case_sensitive": false},
    {"type": "content_contains", "value": "محكمة الاستئناف بنابل", "case_sensitive": false},
    {"type": "breadcrumb_contains", "value": "nabeul", "case_sensitive": false}
  ]'::jsonb,
  'jurisprudence',
  'appel_nabeul',
  85,
  0.20,
  true
FROM web_sources
WHERE is_active = true AND name = 'Nom Source Web'; -- Adapter le nom

-- Bizerte
INSERT INTO source_classification_rules (
  web_source_id, name, description,
  conditions, target_category, target_subcategory,
  priority, confidence_boost, is_active
)
SELECT
  id as web_source_id,
  'Détection Cour Appel Bizerte',
  'Détecte les arrêts de la Cour d''appel de Bizerte via keywords',
  '[
    {"type": "content_contains", "value": "cour d''appel de bizerte", "case_sensitive": false},
    {"type": "content_contains", "value": "محكمة الاستئناف ببنزرت", "case_sensitive": false},
    {"type": "breadcrumb_contains", "value": "bizerte", "case_sensitive": false}
  ]'::jsonb,
  'jurisprudence',
  'appel_bizerte',
  85,
  0.20,
  true
FROM web_sources
WHERE is_active = true AND name = 'Nom Source Web'; -- Adapter le nom
*/

-- ============================================================================
-- JURIDICTIONS SPÉCIALISÉES
-- ============================================================================

-- Tribunal de Commerce
INSERT INTO source_classification_rules (
  web_source_id, name, description,
  conditions, target_category, target_subcategory,
  priority, confidence_boost, is_active
)
SELECT
  id as web_source_id,
  'Détection Tribunal Commerce',
  'Détecte les décisions du Tribunal de Commerce via keywords',
  '[
    {"type": "content_contains", "value": "tribunal de commerce", "case_sensitive": false},
    {"type": "content_contains", "value": "المحكمة التجارية", "case_sensitive": false},
    {"type": "breadcrumb_contains", "value": "commerce", "case_sensitive": false}
  ]'::jsonb,
  'jurisprudence',
  'tribunal_commerce',
  90,
  0.25,
  true
FROM web_sources
WHERE is_active = true
LIMIT 1; -- Exemple pour la première source active - à adapter

-- Tribunal du Travail
INSERT INTO source_classification_rules (
  web_source_id, name, description,
  conditions, target_category, target_subcategory,
  priority, confidence_boost, is_active
)
SELECT
  id as web_source_id,
  'Détection Tribunal Travail',
  'Détecte les décisions du Tribunal du Travail via keywords',
  '[
    {"type": "content_contains", "value": "tribunal du travail", "case_sensitive": false},
    {"type": "content_contains", "value": "محكمة الشغل", "case_sensitive": false},
    {"type": "content_contains", "value": "conseil de prud''hommes", "case_sensitive": false},
    {"type": "breadcrumb_contains", "value": "travail", "case_sensitive": false}
  ]'::jsonb,
  'jurisprudence',
  'tribunal_travail',
  90,
  0.25,
  true
FROM web_sources
WHERE is_active = true
LIMIT 1; -- Exemple pour la première source active - à adapter

-- ============================================================================
-- NOTES D'IMPLÉMENTATION
-- ============================================================================

/**
 * IMPORTANT : Ces règles sont des EXEMPLES GÉNÉRIQUES
 *
 * Pour une classification optimale, il est recommandé de :
 *
 * 1. Analyser chaque source web active individuellement
 * 2. Identifier leur structure spécifique (breadcrumbs, URLs, metadata)
 * 3. Créer des règles ciblées par source avec :
 *    - url_pattern pour détecter via structure URL
 *    - breadcrumb_exact pour détecter via fil d'ariane
 *    - metadata_contains pour détecter via balises meta
 *
 * 4. Tester avec le script de classification :
 *    npm run test-classification -- --url "URL_TEST" --source-id ID
 *
 * 5. Ajuster les priorités et confidence_boost selon les résultats
 *
 * Exemple de règle optimisée (basée sur analyse réelle) :
 *
 * {
 *   "type": "url_pattern",
 *   "pattern": "^https://example.tn/jurisprudence/nabeul/",
 *   "priority": 95,
 *   "confidence_boost": 0.35
 * }
 */
