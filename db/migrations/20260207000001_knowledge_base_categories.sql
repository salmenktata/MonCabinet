-- Migration: Extension des catégories de la base de connaissances
-- Date: 2026-02-07
-- Description: Ajouter sous-catégories, tags, versioning et catégories hiérarchiques

-- ============================================================================
-- NOUVELLES COLONNES SUR KNOWLEDGE_BASE
-- ============================================================================

-- Ajouter colonne sous-catégorie
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(50);

-- Ajouter colonne tags (tableau de textes)
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Ajouter colonne version
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Ajouter colonne is_active (soft delete)
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Mettre à jour la contrainte CHECK pour les nouvelles catégories
ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_category_check;
ALTER TABLE knowledge_base
ADD CONSTRAINT knowledge_base_category_check
CHECK (category IN (
  'jurisprudence',
  'code',
  'doctrine',
  'modele',
  'autre',
  -- Nouvelles catégories
  'legislation',
  'modeles',
  'procedures',
  'jort',
  'formulaires'
));

-- ============================================================================
-- TABLE DE RÉFÉRENCE DES CATÉGORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id VARCHAR(50) PRIMARY KEY,
  parent_id VARCHAR(50) REFERENCES knowledge_categories(id),
  label_fr VARCHAR(100) NOT NULL,
  label_ar VARCHAR(100),
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEX POUR PERFORMANCES
-- ============================================================================

-- Index pour filtrage par sous-catégorie
CREATE INDEX IF NOT EXISTS idx_kb_subcategory ON knowledge_base(subcategory);

-- Index GIN pour recherche dans les tags
CREATE INDEX IF NOT EXISTS idx_kb_tags ON knowledge_base USING GIN(tags);

-- Index pour documents actifs uniquement
CREATE INDEX IF NOT EXISTS idx_kb_active ON knowledge_base(is_active) WHERE is_active = TRUE;

-- Index composite catégorie + sous-catégorie
CREATE INDEX IF NOT EXISTS idx_kb_category_subcategory ON knowledge_base(category, subcategory);

-- ============================================================================
-- INSERTION DES CATÉGORIES ET SOUS-CATÉGORIES
-- ============================================================================

INSERT INTO knowledge_categories (id, parent_id, label_fr, label_ar, icon, sort_order) VALUES
  -- Catégories principales
  ('legislation', NULL, 'Législation', 'التشريع', 'scale', 1),
  ('jurisprudence', NULL, 'Jurisprudence', 'فقه القضاء', 'gavel', 2),
  ('doctrine', NULL, 'Doctrine', 'الفقه', 'book-open', 3),
  ('modeles', NULL, 'Modèles', 'النماذج', 'file-text', 4),
  ('procedures', NULL, 'Procédures', 'الإجراءات', 'clipboard-list', 5),
  ('jort', NULL, 'JORT', 'الرائد الرسمي', 'newspaper', 6),
  ('formulaires', NULL, 'Formulaires', 'الاستمارات', 'file-input', 7),

  -- Sous-catégories: Législation
  ('coc', 'legislation', 'Code des Obligations et Contrats', 'مجلة الالتزامات والعقود', NULL, 1),
  ('code_penal', 'legislation', 'Code Pénal', 'المجلة الجزائية', NULL, 2),
  ('code_commerce', 'legislation', 'Code de Commerce', 'المجلة التجارية', NULL, 3),
  ('code_travail', 'legislation', 'Code du Travail', 'مجلة الشغل', NULL, 4),
  ('csp', 'legislation', 'Code du Statut Personnel', 'مجلة الأحوال الشخصية', NULL, 5),
  ('code_fiscal', 'legislation', 'Code Fiscal', 'مجلة الجباية', NULL, 6),
  ('constitution', 'legislation', 'Constitution', 'الدستور', NULL, 7),
  ('loi_organique', 'legislation', 'Loi Organique', 'قانون أساسي', NULL, 8),
  ('decret_loi', 'legislation', 'Décret-Loi', 'مرسوم', NULL, 9),
  ('decret', 'legislation', 'Décret', 'أمر', NULL, 10),
  ('arrete', 'legislation', 'Arrêté', 'قرار', NULL, 11),
  ('circulaire', 'legislation', 'Circulaire', 'منشور', NULL, 12),

  -- Sous-catégories: Jurisprudence
  ('cassation', 'jurisprudence', 'Cour de Cassation', 'محكمة التعقيب', NULL, 1),
  ('appel_tunis', 'jurisprudence', 'Cour d''Appel de Tunis', 'محكمة الاستئناف بتونس', NULL, 2),
  ('appel_sousse', 'jurisprudence', 'Cour d''Appel de Sousse', 'محكمة الاستئناف بسوسة', NULL, 3),
  ('appel_sfax', 'jurisprudence', 'Cour d''Appel de Sfax', 'محكمة الاستئناف بصفاقس', NULL, 4),
  ('premiere_instance', 'jurisprudence', 'Première Instance', 'المحكمة الابتدائية', NULL, 5),
  ('tribunal_immobilier', 'jurisprudence', 'Tribunal Immobilier', 'المحكمة العقارية', NULL, 6),
  ('tribunal_administratif', 'jurisprudence', 'Tribunal Administratif', 'المحكمة الإدارية', NULL, 7),
  ('conseil_constitutionnel', 'jurisprudence', 'Conseil Constitutionnel', 'المجلس الدستوري', NULL, 8),

  -- Sous-catégories: Doctrine
  ('article', 'doctrine', 'Article', 'مقال', NULL, 1),
  ('these', 'doctrine', 'Thèse', 'أطروحة', NULL, 2),
  ('commentaire', 'doctrine', 'Commentaire', 'تعليق', NULL, 3),
  ('ouvrage', 'doctrine', 'Ouvrage', 'مؤلف', NULL, 4),
  ('note_arret', 'doctrine', 'Note d''Arrêt', 'تعليق على حكم', NULL, 5),
  ('revue_juridique', 'doctrine', 'Revue Juridique Tunisienne', 'المجلة القانونية التونسية', NULL, 6),

  -- Sous-catégories: Modèles
  ('contrat', 'modeles', 'Contrat', 'عقد', NULL, 1),
  ('requete', 'modeles', 'Requête', 'مطلب', NULL, 2),
  ('conclusions', 'modeles', 'Conclusions', 'ملحوظات', NULL, 3),
  ('correspondance', 'modeles', 'Correspondance', 'مراسلة', NULL, 4),
  ('acte_notarie', 'modeles', 'Acte Notarié', 'عقد موثق', NULL, 5),
  ('procuration', 'modeles', 'Procuration', 'توكيل', NULL, 6),

  -- Sous-catégories: Procédures
  ('proc_civile', 'procedures', 'Procédure Civile', 'الإجراءات المدنية', NULL, 1),
  ('proc_penale', 'procedures', 'Procédure Pénale', 'الإجراءات الجزائية', NULL, 2),
  ('proc_commerciale', 'procedures', 'Procédure Commerciale', 'الإجراءات التجارية', NULL, 3),
  ('proc_administrative', 'procedures', 'Procédure Administrative', 'الإجراءات الإدارية', NULL, 4),
  ('proc_immobiliere', 'procedures', 'Procédure Immobilière', 'الإجراءات العقارية', NULL, 5),
  ('proc_statut_personnel', 'procedures', 'Statut Personnel', 'الأحوال الشخصية', NULL, 6),

  -- Sous-catégories: JORT
  ('jort_lois', 'jort', 'Lois', 'القوانين', NULL, 1),
  ('jort_decrets', 'jort', 'Décrets', 'الأوامر', NULL, 2),
  ('jort_arretes', 'jort', 'Arrêtés', 'القرارات', NULL, 3),
  ('jort_avis', 'jort', 'Avis', 'الإعلانات', NULL, 4),
  ('jort_nominations', 'jort', 'Nominations', 'التسميات', NULL, 5),

  -- Sous-catégories: Formulaires
  ('form_tribunal', 'formulaires', 'Tribunal', 'المحكمة', NULL, 1),
  ('form_recette_finances', 'formulaires', 'Recette des Finances', 'القباضة المالية', NULL, 2),
  ('form_conservation_fonciere', 'formulaires', 'Conservation Foncière', 'إدارة الملكية العقارية', NULL, 3),
  ('form_greffe', 'formulaires', 'Greffe', 'كتابة المحكمة', NULL, 4),
  ('form_municipalite', 'formulaires', 'Municipalité', 'البلدية', NULL, 5)
ON CONFLICT (id) DO UPDATE SET
  label_fr = EXCLUDED.label_fr,
  label_ar = EXCLUDED.label_ar,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- MISE À JOUR FONCTION DE RECHERCHE
-- ============================================================================

-- Mettre à jour la fonction de recherche pour inclure subcategory et tags
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  knowledge_base_id UUID,
  chunk_id UUID,
  title TEXT,
  category TEXT,
  subcategory TEXT,
  chunk_content TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB,
  tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id as knowledge_base_id,
    kbc.id as chunk_id,
    kb.title,
    kb.category,
    kb.subcategory,
    kbc.content as chunk_content,
    kbc.chunk_index,
    (1 - (kbc.embedding <=> query_embedding))::FLOAT as similarity,
    kb.metadata,
    kb.tags
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_indexed = true
    AND kb.is_active = true
    AND kbc.embedding IS NOT NULL
    AND (p_category IS NULL OR kb.category = p_category)
    AND (p_subcategory IS NULL OR kb.subcategory = p_subcategory)
    AND (1 - (kbc.embedding <=> query_embedding)) >= p_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MISE À JOUR FONCTION STATISTIQUES
-- ============================================================================

CREATE OR REPLACE FUNCTION get_knowledge_base_stats()
RETURNS TABLE (
  total_documents BIGINT,
  indexed_documents BIGINT,
  total_chunks BIGINT,
  by_category JSONB,
  by_subcategory JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM knowledge_base WHERE is_active = true) as total_documents,
    (SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = true AND is_active = true) as indexed_documents,
    (SELECT COUNT(*) FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
     WHERE kb.is_active = true) as total_chunks,
    (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM knowledge_base
        WHERE is_active = true
        GROUP BY category
      ) sub
    ) as by_category,
    (
      SELECT COALESCE(jsonb_object_agg(COALESCE(subcategory, 'none'), cnt), '{}'::jsonb)
      FROM (
        SELECT subcategory, COUNT(*) as cnt
        FROM knowledge_base
        WHERE is_active = true AND subcategory IS NOT NULL
        GROUP BY subcategory
      ) sub
    ) as by_subcategory;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Extension catégories Knowledge Base appliquée!';
  RAISE NOTICE '📊 Nouvelles colonnes: subcategory, tags, version, is_active';
  RAISE NOTICE '📁 Table knowledge_categories créée avec hiérarchie';
  RAISE NOTICE '🔍 Fonctions de recherche mises à jour';
END $$;
