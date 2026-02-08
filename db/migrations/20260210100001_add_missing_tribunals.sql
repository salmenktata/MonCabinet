/**
 * Migration complémentaire: Ajout des tribunaux manquants de la taxonomie initiale
 * Date: 2026-02-10
 * Description: Ajoute les tribunaux qui auraient dû exister dans la base initiale
 *              (Sousse, Sfax, Immobilier, Administratif, Conseil Constitutionnel)
 */

-- ============================================================================
-- COURS D'APPEL MANQUANTES (2)
-- ============================================================================

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order)
VALUES
  ('tribunal', 'appel_sousse', NULL, 'Cour d''appel de Sousse', 'محكمة الاستئناف بسوسة', true, true, 3),
  ('tribunal', 'appel_sfax', NULL, 'Cour d''appel de Sfax', 'محكمة الاستئناف بصفاقس', true, true, 4)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- JURIDICTIONS SPÉCIALISÉES MANQUANTES (2)
-- ============================================================================

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order, description)
VALUES
  ('tribunal', 'tribunal_immobilier', NULL, 'Tribunal Immobilier', 'المحكمة العقارية', true, true, 13,
   'Juridiction spécialisée en matière immobilière et foncière'),
  ('tribunal', 'tribunal_administratif', NULL, 'Tribunal Administratif', 'المحكمة الإدارية', true, true, 14,
   'Juridiction du contentieux administratif')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- HAUTE JURIDICTION MANQUANTE (1)
-- ============================================================================

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order, description)
VALUES
  ('tribunal', 'conseil_constitutionnel', NULL, 'Conseil Constitutionnel', 'المجلس الدستوري', true, true, 20,
   'Instance de contrôle de constitutionnalité des lois')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- CHAMBRES COUR DE CASSATION (si nécessaire)
-- ============================================================================

-- Note: La Cour de Cassation a plusieurs chambres spécialisées
-- Ces chambres peuvent être ajoutées si besoin pour une classification plus fine

INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, is_active, sort_order)
VALUES
  ('tribunal', 'cassation_civile', 'cassation', 'Chambre Civile', 'الدائرة المدنية', true, true, 1),
  ('tribunal', 'cassation_commerciale', 'cassation', 'Chambre Commerciale', 'الدائرة التجارية', true, true, 2),
  ('tribunal', 'cassation_sociale', 'cassation', 'Chambre Sociale', 'الدائرة الاجتماعية', true, true, 3),
  ('tribunal', 'cassation_penale', 'cassation', 'Chambre Pénale', 'الدائرة الجزائية', true, true, 4),
  ('tribunal', 'cassation_statut_personnel', 'cassation', 'Chambre Statut Personnel', 'دائرة الأحوال الشخصية', true, true, 5),
  ('tribunal', 'cassation_immobiliere', 'cassation', 'Chambre Immobilière', 'الدائرة العقارية', true, true, 6)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
DECLARE
  v_tribunals_count INTEGER;
  v_cours_appel_count INTEGER;
  v_chambres_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tribunals_count FROM legal_taxonomy WHERE type = 'tribunal' AND is_active = true;
  SELECT COUNT(*) INTO v_cours_appel_count FROM legal_taxonomy WHERE type = 'tribunal' AND code LIKE 'appel_%';
  SELECT COUNT(*) INTO v_chambres_count FROM legal_taxonomy WHERE parent_code = 'cassation';

  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Migration complémentaire terminée!';
  RAISE NOTICE 'Tribunaux totaux: % (attendu: ≥22)', v_tribunals_count;
  RAISE NOTICE 'Cours d''appel: % (attendu: 11)', v_cours_appel_count;
  RAISE NOTICE 'Chambres Cassation: %', v_chambres_count;
  RAISE NOTICE '===============================================';
END $$;
