-- Script de vérification de la migration des tribunaux
-- À exécuter après la migration 20260210100000_enrich_tribunals_taxonomy.sql

\echo '================================='
\echo 'VÉRIFICATION MIGRATION TRIBUNAUX'
\echo '================================='
\echo ''

-- ============================================================================
-- 1. COMPTAGES GLOBAUX
-- ============================================================================

\echo '1. COMPTAGES GLOBAUX'
\echo '--------------------'

SELECT
  'Tribunaux totaux' as metric,
  COUNT(*) as count,
  '22 attendus' as expected
FROM legal_taxonomy
WHERE type = 'tribunal' AND is_active = true;

SELECT
  'Cours d''appel' as metric,
  COUNT(*) as count,
  '11 attendues' as expected
FROM legal_taxonomy
WHERE type = 'tribunal' AND code LIKE 'appel_%';

SELECT
  'Juridictions spécialisées' as metric,
  COUNT(*) as count,
  '4 attendues (immobilier, admin, commerce, travail)' as expected
FROM legal_taxonomy
WHERE type = 'tribunal'
  AND code IN ('tribunal_immobilier', 'tribunal_administratif', 'tribunal_commerce', 'tribunal_travail');

\echo ''

-- ============================================================================
-- 2. VÉRIFICATION NOUVEAUX TRIBUNAUX
-- ============================================================================

\echo '2. NOUVEAUX TRIBUNAUX AJOUTÉS'
\echo '------------------------------'

SELECT
  code,
  label_fr,
  label_ar,
  is_system,
  is_active,
  sort_order
FROM legal_taxonomy
WHERE code IN (
  'appel_nabeul',
  'appel_bizerte',
  'appel_kef',
  'appel_monastir',
  'appel_kairouan',
  'appel_gafsa',
  'appel_gabes',
  'appel_medenine',
  'tribunal_commerce',
  'tribunal_travail'
)
ORDER BY sort_order;

\echo ''

-- ============================================================================
-- 3. VÉRIFICATION ABSENCE DOUBLONS
-- ============================================================================

\echo '3. VÉRIFICATION DOUBLONS (attendu: 0)'
\echo '--------------------------------------'

SELECT
  code,
  COUNT(*) as count
FROM legal_taxonomy
WHERE type = 'tribunal'
GROUP BY code
HAVING COUNT(*) > 1;

\echo ''

-- ============================================================================
-- 4. LISTE COMPLÈTE DES COURS D'APPEL
-- ============================================================================

\echo '4. TOUTES LES COURS D''APPEL (11 attendues)'
\echo '-------------------------------------------'

SELECT
  code,
  label_fr,
  label_ar,
  sort_order
FROM legal_taxonomy
WHERE code LIKE 'appel_%'
ORDER BY sort_order;

\echo ''

-- ============================================================================
-- 5. VÉRIFICATION CONTRAINTES is_system
-- ============================================================================

\echo '5. VÉRIFICATION is_system=true (protection suppression)'
\echo '--------------------------------------------------------'

SELECT
  code,
  is_system,
  CASE WHEN is_system THEN '✓ Protégé' ELSE '✗ Non protégé' END as status
FROM legal_taxonomy
WHERE code IN (
  'appel_nabeul',
  'appel_bizerte',
  'appel_kef',
  'appel_monastir',
  'appel_kairouan',
  'appel_gafsa',
  'appel_gabes',
  'appel_medenine',
  'tribunal_commerce',
  'tribunal_travail'
)
ORDER BY code;

\echo ''

-- ============================================================================
-- 6. VÉRIFICATION STRUCTURE (parent_code doit être NULL)
-- ============================================================================

\echo '6. VÉRIFICATION STRUCTURE PLATE (parent_code=NULL)'
\echo '---------------------------------------------------'

SELECT
  code,
  parent_code,
  CASE WHEN parent_code IS NULL THEN '✓ OK' ELSE '✗ ERREUR' END as status
FROM legal_taxonomy
WHERE type = 'tribunal'
  AND code IN (
    'appel_nabeul',
    'appel_bizerte',
    'appel_kef',
    'appel_monastir',
    'appel_kairouan',
    'appel_gafsa',
    'appel_gabes',
    'appel_medenine',
    'tribunal_commerce',
    'tribunal_travail'
  );

\echo ''

-- ============================================================================
-- 7. RÉSUMÉ FINAL
-- ============================================================================

\echo '7. RÉSUMÉ FINAL'
\echo '---------------'

WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE type = 'tribunal' AND is_active = true) as total_tribunaux,
    COUNT(*) FILTER (WHERE type = 'tribunal' AND code LIKE 'appel_%') as cours_appel,
    COUNT(*) FILTER (WHERE type = 'tribunal' AND code IN (
      'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
      'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
      'tribunal_commerce', 'tribunal_travail'
    )) as nouveaux_tribunaux,
    COUNT(*) FILTER (WHERE code IN (
      'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
      'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
      'tribunal_commerce', 'tribunal_travail'
    ) AND is_system = false) as non_proteges
  FROM legal_taxonomy
)
SELECT
  total_tribunaux,
  CASE WHEN total_tribunaux = 22 THEN '✓' ELSE '✗' END as check_total,
  cours_appel,
  CASE WHEN cours_appel = 11 THEN '✓' ELSE '✗' END as check_appels,
  nouveaux_tribunaux,
  CASE WHEN nouveaux_tribunaux = 10 THEN '✓' ELSE '✗' END as check_nouveaux,
  non_proteges,
  CASE WHEN non_proteges = 0 THEN '✓' ELSE '✗' END as check_protection
FROM stats;

\echo ''
\echo '================================='
\echo 'FIN VÉRIFICATION'
\echo '================================='
