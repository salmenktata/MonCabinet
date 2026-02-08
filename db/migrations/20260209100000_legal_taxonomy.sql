/**
 * Migration: Système de Taxonomie Juridique Intelligente
 * Date: 2026-02-09
 * Description: Tables pour la taxonomie juridique centralisée,
 *              les règles de classification par source,
 *              et le système d'apprentissage automatique
 */

-- ============================================================================
-- TABLE LEGAL_TAXONOMY - Taxonomie juridique centralisée
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type de taxonomie (niveau hiérarchique)
  type TEXT NOT NULL CHECK (type IN ('category', 'domain', 'document_type', 'tribunal', 'chamber')),

  -- Code unique pour référence
  code TEXT NOT NULL UNIQUE,

  -- Hiérarchie (référence au parent)
  parent_code TEXT REFERENCES legal_taxonomy(code) ON DELETE SET NULL,

  -- Labels multilingues
  label_fr TEXT NOT NULL,
  label_ar TEXT NOT NULL,

  -- Informations additionnelles
  description TEXT,
  icon TEXT,
  color TEXT,

  -- État
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- Types système non supprimables
  sort_order INTEGER DEFAULT 0,

  -- Suggestions IA
  suggested_by_ai BOOLEAN DEFAULT false,
  ai_suggestion_reason TEXT,
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes courantes
CREATE INDEX IF NOT EXISTS idx_legal_taxonomy_type ON legal_taxonomy(type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_legal_taxonomy_parent ON legal_taxonomy(parent_code) WHERE parent_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_taxonomy_ai_pending ON legal_taxonomy(created_at DESC) WHERE suggested_by_ai = true AND validated_at IS NULL;

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_legal_taxonomy_updated_at
  BEFORE UPDATE ON legal_taxonomy
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE TAXONOMY_SUGGESTIONS - Suggestions IA pour nouveaux types
-- ============================================================================

CREATE TABLE IF NOT EXISTS taxonomy_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type suggéré
  type TEXT NOT NULL CHECK (type IN ('category', 'domain', 'document_type', 'tribunal', 'chamber')),

  -- Données suggérées
  suggested_code TEXT NOT NULL,
  suggested_label_fr TEXT NOT NULL,
  suggested_label_ar TEXT,
  suggested_parent_code TEXT,

  -- Contexte de la suggestion
  reason TEXT, -- Pourquoi l'IA suggère ce type
  based_on_pages UUID[], -- Pages qui ont motivé la suggestion
  occurrence_count INTEGER DEFAULT 1, -- Nombre de fois détecté
  sample_urls TEXT[], -- URLs d'exemple

  -- État de validation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Si approuvé, référence vers la taxonomie créée
  created_taxonomy_id UUID REFERENCES legal_taxonomy(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_suggestions_status ON taxonomy_suggestions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_taxonomy_suggestions_code ON taxonomy_suggestions(suggested_code);

-- ============================================================================
-- TABLE SOURCE_CLASSIFICATION_RULES - Règles de mapping par source
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source web associée
  web_source_id UUID REFERENCES web_sources(id) ON DELETE CASCADE,

  -- Nom de la règle
  name TEXT NOT NULL,
  description TEXT,

  -- Conditions (JSON array)
  -- Ex: [{"type": "url_contains", "value": "/jurisprudence/"}]
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Classification cible (codes taxonomie)
  target_category TEXT REFERENCES legal_taxonomy(code),
  target_domain TEXT REFERENCES legal_taxonomy(code),
  target_document_type TEXT REFERENCES legal_taxonomy(code),

  -- Configuration
  priority INTEGER DEFAULT 0, -- Plus haut = priorité plus haute
  confidence_boost FLOAT DEFAULT 0.2 CHECK (confidence_boost BETWEEN 0 AND 1),
  is_active BOOLEAN DEFAULT true,

  -- Statistiques d'utilisation
  times_matched INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0, -- Après validation humaine
  last_matched_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_rules_source ON source_classification_rules(web_source_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_source_rules_priority ON source_classification_rules(priority DESC) WHERE is_active = true;

CREATE OR REPLACE TRIGGER update_source_rules_updated_at
  BEFORE UPDATE ON source_classification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE CLASSIFICATION_CORRECTIONS - Corrections pour apprentissage
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page concernée
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,

  -- Classification originale (IA)
  original_category TEXT,
  original_domain TEXT,
  original_document_type TEXT,
  original_confidence FLOAT,

  -- Classification corrigée (humain)
  corrected_category TEXT,
  corrected_domain TEXT,
  corrected_document_type TEXT,

  -- Contexte pour apprentissage
  page_url TEXT NOT NULL,
  page_title TEXT,
  page_structure JSONB, -- Breadcrumbs, URL path analysis, etc.

  -- Signaux utilisés lors de la classification originale
  classification_signals JSONB DEFAULT '{}'::jsonb,

  -- État
  used_for_learning BOOLEAN DEFAULT false, -- A été utilisé pour créer une règle
  generated_rule_id UUID REFERENCES source_classification_rules(id) ON DELETE SET NULL,

  -- Audit
  corrected_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  corrected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_page ON classification_corrections(web_page_id);
CREATE INDEX IF NOT EXISTS idx_corrections_learning ON classification_corrections(used_for_learning) WHERE used_for_learning = false;
CREATE INDEX IF NOT EXISTS idx_corrections_patterns ON classification_corrections USING gin(page_structure);

-- ============================================================================
-- EXTENSION TABLE WEB_PAGES - Champs pour structure site
-- ============================================================================

ALTER TABLE web_pages
  ADD COLUMN IF NOT EXISTS site_structure JSONB;

COMMENT ON COLUMN web_pages.site_structure IS 'Structure extraite du site: breadcrumbs, URL analysis, navigation hints';

-- ============================================================================
-- EXTENSION TABLE LEGAL_CLASSIFICATIONS - Champs multi-signaux
-- ============================================================================

ALTER TABLE legal_classifications
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IN ('llm', 'rules', 'structure', 'hybrid')),
  ADD COLUMN IF NOT EXISTS signals_used JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rules_matched UUID[],
  ADD COLUMN IF NOT EXISTS structure_hints JSONB;

COMMENT ON COLUMN legal_classifications.classification_source IS 'Source principale de la classification';
COMMENT ON COLUMN legal_classifications.signals_used IS 'Détail des signaux utilisés avec leurs poids';
COMMENT ON COLUMN legal_classifications.rules_matched IS 'IDs des règles qui ont matché';
COMMENT ON COLUMN legal_classifications.structure_hints IS 'Indices structurels extraits (breadcrumbs, URL, etc.)';

-- ============================================================================
-- DONNÉES INITIALES - Taxonomie par défaut
-- ============================================================================

-- Catégories principales (Niveau 1)
INSERT INTO legal_taxonomy (type, code, label_fr, label_ar, is_system, sort_order) VALUES
  ('category', 'legislation', 'Législation', 'النصوص القانونية', true, 1),
  ('category', 'jurisprudence', 'Jurisprudence', 'فقه القضاء', true, 2),
  ('category', 'doctrine', 'Doctrine', 'الفقه القانوني', true, 3),
  ('category', 'codes', 'Codes juridiques', 'المجلات القانونية', true, 4),
  ('category', 'jort', 'Journal Officiel (JORT)', 'الرائد الرسمي للجمهورية التونسية', true, 5),
  ('category', 'conventions', 'Conventions internationales', 'الاتفاقيات الدولية', true, 6),
  ('category', 'modeles', 'Modèles de documents', 'النماذج والوثائق', true, 7),
  ('category', 'procedures', 'Procédures', 'الإجراءات القانونية', true, 8),
  ('category', 'guides', 'Guides pratiques', 'الأدلة العملية', true, 9)
ON CONFLICT (code) DO NOTHING;

-- Domaines juridiques (Niveau 2) - Fondamentaux
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('domain', 'civil', NULL, 'Droit civil', 'القانون المدني', true, 1),
  ('domain', 'commercial', NULL, 'Droit commercial', 'القانون التجاري', true, 2),
  ('domain', 'penal', NULL, 'Droit pénal', 'القانون الجزائي', true, 3),
  ('domain', 'famille', NULL, 'Statut personnel / Droit de la famille', 'الأحوال الشخصية / قانون الأسرة', true, 4),
  ('domain', 'travail', NULL, 'Droit du travail', 'قانون الشغل', true, 5),
  ('domain', 'administratif', NULL, 'Droit administratif', 'القانون الإداري', true, 6),
  ('domain', 'fiscal', NULL, 'Droit fiscal', 'القانون الجبائي', true, 7),
  ('domain', 'constitutionnel', NULL, 'Droit constitutionnel', 'القانون الدستوري', true, 8)
ON CONFLICT (code) DO NOTHING;

-- Domaines spécialisés
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('domain', 'immobilier', NULL, 'Droit immobilier', 'القانون العقاري', true, 10),
  ('domain', 'bancaire', NULL, 'Droit bancaire et financier', 'القانون البنكي والمالي', true, 11),
  ('domain', 'assurance', NULL, 'Droit des assurances', 'قانون التأمين', true, 12),
  ('domain', 'douanier', NULL, 'Droit douanier', 'القانون الديواني', true, 13),
  ('domain', 'propriete_intellectuelle', NULL, 'Propriété intellectuelle', 'الملكية الفكرية والصناعية', true, 14),
  ('domain', 'societes', NULL, 'Droit des sociétés', 'قانون الشركات', true, 15),
  ('domain', 'maritime', NULL, 'Droit maritime', 'القانون البحري', true, 16),
  ('domain', 'aerien', NULL, 'Droit aérien', 'القانون الجوي', true, 17)
ON CONFLICT (code) DO NOTHING;

-- Domaines modernes
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('domain', 'numerique', NULL, 'Droit numérique', 'القانون الرقمي والإلكتروني', true, 20),
  ('domain', 'environnement', NULL, 'Droit de l''environnement', 'قانون البيئة', true, 21),
  ('domain', 'consommation', NULL, 'Droit de la consommation', 'قانون الاستهلاك', true, 22),
  ('domain', 'concurrence', NULL, 'Droit de la concurrence', 'قانون المنافسة', true, 23),
  ('domain', 'donnees_personnelles', NULL, 'Protection des données personnelles', 'حماية المعطيات الشخصية', true, 24),
  ('domain', 'energie', NULL, 'Droit de l''énergie', 'قانون الطاقة والمحروقات', true, 25)
ON CONFLICT (code) DO NOTHING;

-- Droit international
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('domain', 'international_prive', NULL, 'Droit international privé', 'القانون الدولي الخاص', true, 30),
  ('domain', 'international_public', NULL, 'Droit international public', 'القانون الدولي العام', true, 31),
  ('domain', 'humanitaire', NULL, 'Droit humanitaire', 'القانون الإنساني الدولي', true, 32)
ON CONFLICT (code) DO NOTHING;

-- Procédures
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('domain', 'procedure_civile', NULL, 'Procédure civile et commerciale', 'الإجراءات المدنية والتجارية', true, 40),
  ('domain', 'procedure_penale', NULL, 'Procédure pénale', 'الإجراءات الجزائية', true, 41),
  ('domain', 'arbitrage', NULL, 'Arbitrage et médiation', 'التحكيم والوساطة', true, 42),
  ('domain', 'autre', NULL, 'Autre', 'أخرى', true, 99)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - Législatifs
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'constitution', 'legislation', 'Constitution', 'الدستور', true, 1),
  ('document_type', 'loi_organique', 'legislation', 'Loi organique', 'قانون أساسي', true, 2),
  ('document_type', 'loi', 'legislation', 'Loi', 'قانون عادي', true, 3),
  ('document_type', 'decret_loi', 'legislation', 'Décret-loi', 'مرسوم', true, 4),
  ('document_type', 'decret_presidentiel', 'legislation', 'Décret présidentiel', 'أمر رئاسي', true, 5),
  ('document_type', 'decret_gouvernemental', 'legislation', 'Décret gouvernemental', 'أمر حكومي', true, 6),
  ('document_type', 'arrete', 'legislation', 'Arrêté', 'قرار', true, 7),
  ('document_type', 'arrete_ministeriel', 'legislation', 'Arrêté ministériel', 'قرار وزاري', true, 8),
  ('document_type', 'arrete_conjoint', 'legislation', 'Arrêté conjoint', 'قرار مشترك', true, 9),
  ('document_type', 'circulaire', 'legislation', 'Circulaire', 'منشور', true, 10),
  ('document_type', 'note_generale', 'legislation', 'Note générale', 'مذكرة عامة', true, 11),
  ('document_type', 'avis_officiel', 'legislation', 'Avis officiel', 'إعلان رسمي', true, 12)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - Jurisprudence
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'arret_cassation', 'jurisprudence', 'Arrêt de Cassation', 'قرار تعقيب', true, 20),
  ('document_type', 'arret_appel', 'jurisprudence', 'Arrêt d''appel', 'قرار استئناف', true, 21),
  ('document_type', 'jugement', 'jurisprudence', 'Jugement', 'حكم ابتدائي', true, 22),
  ('document_type', 'jugement_cantonal', 'jurisprudence', 'Jugement cantonal', 'حكم ناحية', true, 23),
  ('document_type', 'ordonnance_refere', 'jurisprudence', 'Ordonnance de référé', 'أمر استعجالي', true, 24),
  ('document_type', 'ordonnance_requete', 'jurisprudence', 'Ordonnance sur requête', 'أمر على عريضة', true, 25),
  ('document_type', 'decision_constitutionnelle', 'jurisprudence', 'Décision constitutionnelle', 'قرار دستوري', true, 26),
  ('document_type', 'decision_administrative', 'jurisprudence', 'Décision administrative', 'قرار إداري', true, 27),
  ('document_type', 'sentence_arbitrale', 'jurisprudence', 'Sentence arbitrale', 'حكم تحكيمي', true, 28),
  ('document_type', 'avis_juridique', 'jurisprudence', 'Avis juridique', 'رأي قانوني', true, 29),
  ('document_type', 'arret_chambres_reunies', 'jurisprudence', 'Arrêt des chambres réunies', 'قرار الدوائر المجتمعة', true, 30)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - Doctrine
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'article', 'doctrine', 'Article de doctrine', 'مقال فقهي', true, 40),
  ('document_type', 'these', 'doctrine', 'Thèse de doctorat', 'أطروحة دكتوراه', true, 41),
  ('document_type', 'memoire', 'doctrine', 'Mémoire de master', 'رسالة ماجستير', true, 42),
  ('document_type', 'commentaire', 'doctrine', 'Commentaire d''arrêt', 'تعليق على قرار', true, 43),
  ('document_type', 'note_arret', 'doctrine', 'Note d''arrêt', 'تعليقة', true, 44),
  ('document_type', 'chronique', 'doctrine', 'Chronique judiciaire', 'حولية قضائية', true, 45),
  ('document_type', 'ouvrage', 'doctrine', 'Ouvrage juridique', 'مؤلف قانوني', true, 46),
  ('document_type', 'etude', 'doctrine', 'Étude juridique', 'دراسة قانونية', true, 47),
  ('document_type', 'conference', 'doctrine', 'Conférence', 'محاضرة', true, 48)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - Modèles
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'modele_contrat', 'modeles', 'Modèle de contrat', 'نموذج عقد', true, 60),
  ('document_type', 'modele_requete', 'modeles', 'Modèle de requête', 'نموذج عريضة', true, 61),
  ('document_type', 'modele_conclusions', 'modeles', 'Modèle de conclusions', 'نموذج مذكرة', true, 62),
  ('document_type', 'modele_correspondance', 'modeles', 'Modèle de correspondance', 'نموذج مراسلة', true, 63),
  ('document_type', 'modele_acte_notarie', 'modeles', 'Modèle d''acte notarié', 'نموذج عقد موثق', true, 64),
  ('document_type', 'modele_proces_verbal', 'modeles', 'Modèle de procès-verbal', 'نموذج محضر', true, 65),
  ('document_type', 'modele_pouvoir', 'modeles', 'Modèle de procuration', 'نموذج توكيل', true, 66),
  ('document_type', 'modele_plainte', 'modeles', 'Modèle de plainte', 'نموذج شكاية', true, 67),
  ('document_type', 'modele_recours', 'modeles', 'Modèle de recours', 'نموذج طعن', true, 68),
  ('document_type', 'formulaire_administratif', 'modeles', 'Formulaire administratif', 'استمارة إدارية', true, 69)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - JORT
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'jort_loi', 'jort', 'Loi (JORT)', 'قانون (ر.ر.ج.ت)', true, 70),
  ('document_type', 'jort_loi_organique', 'jort', 'Loi organique (JORT)', 'قانون أساسي (ر.ر.ج.ت)', true, 71),
  ('document_type', 'jort_decret', 'jort', 'Décret (JORT)', 'أمر (ر.ر.ج.ت)', true, 72),
  ('document_type', 'jort_arrete', 'jort', 'Arrêté (JORT)', 'قرار (ر.ر.ج.ت)', true, 73),
  ('document_type', 'jort_avis', 'jort', 'Avis (JORT)', 'إعلان (ر.ر.ج.ت)', true, 74),
  ('document_type', 'jort_nomination', 'jort', 'Nomination (JORT)', 'تسمية (ر.ر.ج.ت)', true, 75),
  ('document_type', 'jort_ratification', 'jort', 'Ratification (JORT)', 'مصادقة (ر.ر.ج.ت)', true, 76)
ON CONFLICT (code) DO NOTHING;

-- Types de documents - Conventions
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('document_type', 'convention', 'conventions', 'Convention internationale', 'اتفاقية دولية', true, 80),
  ('document_type', 'traite', 'conventions', 'Traité', 'معاهدة', true, 81),
  ('document_type', 'protocole', 'conventions', 'Protocole', 'بروتوكول', true, 82),
  ('document_type', 'accord', 'conventions', 'Accord', 'اتفاق', true, 83),
  ('document_type', 'pacte', 'conventions', 'Pacte', 'عهد دولي', true, 84),
  ('document_type', 'memorandum', 'conventions', 'Mémorandum d''entente', 'مذكرة تفاهم', true, 85)
ON CONFLICT (code) DO NOTHING;

-- Tribunaux tunisiens
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('tribunal', 'cassation', NULL, 'Cour de Cassation', 'محكمة التعقيب', true, 1),
  ('tribunal', 'appel_tunis', NULL, 'Cour d''appel de Tunis', 'محكمة الاستئناف بتونس', true, 2),
  ('tribunal', 'appel_sousse', NULL, 'Cour d''appel de Sousse', 'محكمة الاستئناف بسوسة', true, 3),
  ('tribunal', 'appel_sfax', NULL, 'Cour d''appel de Sfax', 'محكمة الاستئناف بصفاقس', true, 4),
  ('tribunal', 'premiere_instance', NULL, 'Tribunal de première instance', 'المحكمة الابتدائية', true, 5),
  ('tribunal', 'tribunal_cantonal', NULL, 'Tribunal cantonal', 'محكمة الناحية', true, 6),
  ('tribunal', 'tribunal_immobilier', NULL, 'Tribunal immobilier', 'المحكمة العقارية', true, 10),
  ('tribunal', 'tribunal_administratif', NULL, 'Tribunal administratif', 'المحكمة الإدارية', true, 11),
  ('tribunal', 'cour_constitutionnelle', NULL, 'Cour constitutionnelle', 'المحكمة الدستورية', true, 12),
  ('tribunal', 'cour_comptes', NULL, 'Cour des comptes', 'دائرة المحاسبات', true, 13),
  ('tribunal', 'tribunal_militaire', NULL, 'Tribunal militaire', 'المحكمة العسكرية', true, 14),
  ('tribunal', 'tribunal_arbitral', NULL, 'Tribunal arbitral', 'هيئة التحكيم', true, 20),
  ('tribunal', 'centre_conciliation', NULL, 'Centre de conciliation et arbitrage', 'مركز التوفيق والتحكيم', true, 21)
ON CONFLICT (code) DO NOTHING;

-- Chambres de la Cour de Cassation
INSERT INTO legal_taxonomy (type, code, parent_code, label_fr, label_ar, is_system, sort_order) VALUES
  ('chamber', 'chambre_civile', 'cassation', 'Chambre civile', 'الدائرة المدنية', true, 1),
  ('chamber', 'chambre_commerciale', 'cassation', 'Chambre commerciale', 'الدائرة التجارية', true, 2),
  ('chamber', 'chambre_statut_personnel', 'cassation', 'Chambre du statut personnel', 'دائرة الأحوال الشخصية', true, 3),
  ('chamber', 'chambre_sociale', 'cassation', 'Chambre sociale', 'الدائرة الاجتماعية', true, 4),
  ('chamber', 'chambre_immobiliere', 'cassation', 'Chambre immobilière', 'الدائرة العقارية', true, 5),
  ('chamber', 'chambre_penale', 'cassation', 'Chambre pénale', 'الدائرة الجزائية', true, 10),
  ('chamber', 'chambre_criminelle', 'cassation', 'Chambre criminelle', 'دائرة الجنايات', true, 11),
  ('chamber', 'chambres_reunies', 'cassation', 'Chambres réunies', 'الدوائر المجتمعة', true, 20),
  ('chamber', 'assemblee_pleniere', 'cassation', 'Assemblée plénière', 'الجلسة العامة', true, 21)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

/**
 * Récupérer la taxonomie complète par type
 */
CREATE OR REPLACE FUNCTION get_taxonomy_by_type(p_type TEXT)
RETURNS TABLE (
  id UUID,
  code TEXT,
  parent_code TEXT,
  label_fr TEXT,
  label_ar TEXT,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER,
  is_system BOOLEAN,
  children JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE taxonomy_tree AS (
    -- Éléments racines (sans parent)
    SELECT
      t.id, t.code, t.parent_code, t.label_fr, t.label_ar,
      t.description, t.icon, t.color, t.sort_order, t.is_system,
      0 as level
    FROM legal_taxonomy t
    WHERE t.type = p_type
      AND t.is_active = true
      AND t.parent_code IS NULL

    UNION ALL

    -- Éléments enfants
    SELECT
      child.id, child.code, child.parent_code, child.label_fr, child.label_ar,
      child.description, child.icon, child.color, child.sort_order, child.is_system,
      parent.level + 1
    FROM legal_taxonomy child
    JOIN taxonomy_tree parent ON child.parent_code = parent.code
    WHERE child.type = p_type
      AND child.is_active = true
  )
  SELECT
    tt.id, tt.code, tt.parent_code, tt.label_fr, tt.label_ar,
    tt.description, tt.icon, tt.color, tt.sort_order, tt.is_system,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'code', c.code,
        'label_fr', c.label_fr,
        'label_ar', c.label_ar
      ) ORDER BY c.sort_order)
      FROM legal_taxonomy c
      WHERE c.parent_code = tt.code AND c.is_active = true),
      '[]'::jsonb
    ) as children
  FROM taxonomy_tree tt
  ORDER BY tt.sort_order, tt.label_fr;
END;
$$ LANGUAGE plpgsql;

/**
 * Vérifier si un code de taxonomie existe et est actif
 */
CREATE OR REPLACE FUNCTION is_valid_taxonomy_code(p_code TEXT, p_type TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM legal_taxonomy
    WHERE code = p_code
      AND is_active = true
      AND (p_type IS NULL OR type = p_type)
  );
END;
$$ LANGUAGE plpgsql;

/**
 * Incrémenter le compteur de match d'une règle
 */
CREATE OR REPLACE FUNCTION increment_rule_match(p_rule_id UUID, p_is_correct BOOLEAN DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE source_classification_rules
  SET
    times_matched = times_matched + 1,
    times_correct = CASE WHEN p_is_correct = true THEN times_correct + 1 ELSE times_correct END,
    last_matched_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Créer une suggestion de taxonomie à partir de détections IA
 */
CREATE OR REPLACE FUNCTION create_taxonomy_suggestion(
  p_type TEXT,
  p_suggested_code TEXT,
  p_suggested_label_fr TEXT,
  p_suggested_label_ar TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_page_id UUID DEFAULT NULL,
  p_sample_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_suggestion_id UUID;
  v_existing_id UUID;
BEGIN
  -- Vérifier si une suggestion similaire existe déjà
  SELECT id INTO v_existing_id
  FROM taxonomy_suggestions
  WHERE suggested_code = p_suggested_code
    AND status = 'pending';

  IF v_existing_id IS NOT NULL THEN
    -- Incrémenter le compteur et ajouter la page/URL
    UPDATE taxonomy_suggestions
    SET
      occurrence_count = occurrence_count + 1,
      based_on_pages = array_append(based_on_pages, p_page_id),
      sample_urls = CASE
        WHEN p_sample_url IS NOT NULL AND NOT (p_sample_url = ANY(sample_urls))
        THEN array_append(sample_urls, p_sample_url)
        ELSE sample_urls
      END
    WHERE id = v_existing_id;

    RETURN v_existing_id;
  END IF;

  -- Créer une nouvelle suggestion
  INSERT INTO taxonomy_suggestions (
    type, suggested_code, suggested_label_fr, suggested_label_ar,
    reason, based_on_pages, sample_urls
  ) VALUES (
    p_type, p_suggested_code, p_suggested_label_fr, p_suggested_label_ar,
    p_reason,
    CASE WHEN p_page_id IS NOT NULL THEN ARRAY[p_page_id] ELSE ARRAY[]::UUID[] END,
    CASE WHEN p_sample_url IS NOT NULL THEN ARRAY[p_sample_url] ELSE ARRAY[]::TEXT[] END
  )
  RETURNING id INTO v_suggestion_id;

  RETURN v_suggestion_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
DECLARE
  v_taxonomy_count INTEGER;
  v_categories INTEGER;
  v_domains INTEGER;
  v_doc_types INTEGER;
  v_tribunals INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_taxonomy_count FROM legal_taxonomy;
  SELECT COUNT(*) INTO v_categories FROM legal_taxonomy WHERE type = 'category';
  SELECT COUNT(*) INTO v_domains FROM legal_taxonomy WHERE type = 'domain';
  SELECT COUNT(*) INTO v_doc_types FROM legal_taxonomy WHERE type = 'document_type';
  SELECT COUNT(*) INTO v_tribunals FROM legal_taxonomy WHERE type = 'tribunal';

  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Migration Legal Taxonomy terminée!';
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Nouvelles tables:';
  RAISE NOTICE '  - legal_taxonomy (% entrées)', v_taxonomy_count;
  RAISE NOTICE '    * % catégories', v_categories;
  RAISE NOTICE '    * % domaines', v_domains;
  RAISE NOTICE '    * % types de documents', v_doc_types;
  RAISE NOTICE '    * % tribunaux', v_tribunals;
  RAISE NOTICE '  - taxonomy_suggestions';
  RAISE NOTICE '  - source_classification_rules';
  RAISE NOTICE '  - classification_corrections';
  RAISE NOTICE '';
  RAISE NOTICE 'Colonnes ajoutées:';
  RAISE NOTICE '  - web_pages.site_structure';
  RAISE NOTICE '  - legal_classifications.classification_source';
  RAISE NOTICE '  - legal_classifications.signals_used';
  RAISE NOTICE '  - legal_classifications.rules_matched';
  RAISE NOTICE '  - legal_classifications.structure_hints';
  RAISE NOTICE '===============================================';
END $$;
