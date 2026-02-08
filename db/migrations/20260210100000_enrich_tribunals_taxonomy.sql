/**
 * Migration: Enrichissement Taxonomie Tribunaux Tunisiens
 * Date: 2026-02-10
 * Description: Ajoute 7 cours d'appel + 2 juridictions spécialisées
 */

-- ============================================================================
-- NOUVELLES COURS D'APPEL (7)
-- ============================================================================

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order)
VALUES
  ('tribunal', 'appel_nabeul', NULL, 'Cour d''appel de Nabeul', 'محكمة الاستئناف بنابل', true, true, 5),
  ('tribunal', 'appel_bizerte', NULL, 'Cour d''appel de Bizerte', 'محكمة الاستئناف ببنزرت', true, true, 6),
  ('tribunal', 'appel_kef', NULL, 'Cour d''appel du Kef', 'محكمة الاستئناف بالكاف', true, true, 7),
  ('tribunal', 'appel_monastir', NULL, 'Cour d''appel de Monastir', 'محكمة الاستئناف بالمنستير', true, true, 8),
  ('tribunal', 'appel_kairouan', NULL, 'Cour d''appel de Kairouan', 'محكمة الاستئناف بالقيروان', true, true, 9),
  ('tribunal', 'appel_gafsa', NULL, 'Cour d''appel de Gafsa', 'محكمة الاستئناف بقفصة', true, true, 10),
  ('tribunal', 'appel_gabes', NULL, 'Cour d''appel de Gabès', 'محكمة الاستئناف بقابس', true, true, 11),
  ('tribunal', 'appel_medenine', NULL, 'Cour d''appel de Médenine', 'محكمة الاستئناف بمدنين', true, true, 12)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- JURIDICTIONS SPÉCIALISÉES (2)
-- ============================================================================

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order, description)
VALUES
  ('tribunal', 'tribunal_commerce', NULL, 'Tribunal de Commerce', 'المحكمة التجارية', true, true, 15,
   'Juridiction spécialisée en matière commerciale'),
  ('tribunal', 'tribunal_travail', NULL, 'Tribunal du Travail', 'محكمة الشغل', true, true, 16,
   'Conseil de Prud''hommes - Contentieux employeur/employé (Code du Travail 1966)')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
DECLARE
  v_tribunals_count INTEGER;
  v_cours_appel_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tribunals_count FROM legal_taxonomy WHERE type = 'tribunal' AND is_active = true;
  SELECT COUNT(*) INTO v_cours_appel_count FROM legal_taxonomy WHERE type = 'tribunal' AND code LIKE 'appel_%';

  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Enrichissement Taxonomie Tribunaux terminé!';
  RAISE NOTICE 'Tribunaux totaux: % (attendu: 22)', v_tribunals_count;
  RAISE NOTICE 'Cours d''appel: % (attendu: 11)', v_cours_appel_count;
  RAISE NOTICE '===============================================';
END $$;
