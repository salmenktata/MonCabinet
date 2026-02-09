-- Migration : Table des abrogations juridiques tunisiennes
-- Date : 2026-02-10
-- Description : Système de détection des lois/articles abrogés avec fuzzy matching

-- =============================================================================
-- EXTENSION pg_trgm pour fuzzy matching
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- TABLE PRINCIPALE
-- =============================================================================

CREATE TABLE IF NOT EXISTS legal_abrogations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Texte abrogé (bilingue)
  abrogated_reference TEXT NOT NULL,
  abrogated_reference_ar TEXT,
  abrogated_reference_normalized TEXT GENERATED ALWAYS AS (
    LOWER(REGEXP_REPLACE(abrogated_reference, '[^a-z0-9]', '', 'gi'))
  ) STORED,

  -- Texte abrogeant
  abrogating_reference TEXT NOT NULL,
  abrogating_reference_ar TEXT,

  -- Métadonnées
  abrogation_date DATE NOT NULL,
  scope TEXT CHECK (scope IN ('total', 'partial', 'implicit')) NOT NULL DEFAULT 'total',
  affected_articles TEXT[], -- Articles spécifiques si abrogation partielle

  -- Sources & Vérification
  jort_url TEXT,
  source_url TEXT,
  verification_status TEXT CHECK (verification_status IN ('verified', 'pending', 'disputed')) DEFAULT 'verified',
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contrainte unicité
  CONSTRAINT unique_abrogated_abrogating UNIQUE (abrogated_reference, abrogating_reference)
);

-- =============================================================================
-- INDEX PERFORMANCE
-- =============================================================================

-- Index B-tree pour recherche exacte
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_reference
  ON legal_abrogations(abrogated_reference);

CREATE INDEX IF NOT EXISTS idx_legal_abrogations_normalized
  ON legal_abrogations(abrogated_reference_normalized);

-- Index temporel
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_date
  ON legal_abrogations(abrogation_date DESC);

-- Index GIN pour fuzzy matching avec pg_trgm
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_trgm
  ON legal_abrogations USING GIN (abrogated_reference gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_legal_abrogations_trgm_ar
  ON legal_abrogations USING GIN (abrogated_reference_ar gin_trgm_ops);

-- Index statut vérification
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_status
  ON legal_abrogations(verification_status)
  WHERE verification_status = 'verified';

-- =============================================================================
-- FONCTION RECHERCHE FUZZY
-- =============================================================================

CREATE OR REPLACE FUNCTION find_abrogations(
  reference_query TEXT,
  similarity_threshold REAL DEFAULT 0.6,
  max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  abrogated_reference TEXT,
  abrogated_reference_ar TEXT,
  abrogating_reference TEXT,
  abrogating_reference_ar TEXT,
  abrogation_date DATE,
  scope TEXT,
  affected_articles TEXT[],
  similarity_score REAL,
  source_url TEXT,
  jort_url TEXT,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    la.id,
    la.abrogated_reference,
    la.abrogated_reference_ar,
    la.abrogating_reference,
    la.abrogating_reference_ar,
    la.abrogation_date,
    la.scope,
    la.affected_articles,
    GREATEST(
      similarity(la.abrogated_reference, reference_query),
      COALESCE(similarity(la.abrogated_reference_ar, reference_query), 0)
    ) AS similarity_score,
    la.source_url,
    la.jort_url,
    la.notes
  FROM legal_abrogations la
  WHERE
    la.verification_status = 'verified'
    AND (
      -- Match exact ou partiel (case-insensitive)
      la.abrogated_reference ILIKE '%' || reference_query || '%'
      OR la.abrogated_reference_ar ILIKE '%' || reference_query || '%'
      -- Ou fuzzy match avec seuil
      OR similarity(la.abrogated_reference, reference_query) >= similarity_threshold
      OR similarity(la.abrogated_reference_ar, reference_query) >= similarity_threshold
    )
  ORDER BY
    -- Prioriser match exact
    CASE
      WHEN la.abrogated_reference ILIKE '%' || reference_query || '%' THEN 1
      WHEN la.abrogated_reference_ar ILIKE '%' || reference_query || '%' THEN 2
      ELSE 3
    END,
    -- Puis meilleur score similarité
    GREATEST(
      similarity(la.abrogated_reference, reference_query),
      COALESCE(similarity(la.abrogated_reference_ar, reference_query), 0)
    ) DESC,
    -- Puis date la plus récente
    la.abrogation_date DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- TRIGGER AUTO-UPDATE updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_legal_abrogations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_legal_abrogations_timestamp
BEFORE UPDATE ON legal_abrogations
FOR EACH ROW
EXECUTE FUNCTION update_legal_abrogations_timestamp();

-- =============================================================================
-- SEED INITIAL - 3 Exemples Critiques
-- =============================================================================

INSERT INTO legal_abrogations (
  abrogated_reference,
  abrogated_reference_ar,
  abrogating_reference,
  abrogating_reference_ar,
  abrogation_date,
  scope,
  affected_articles,
  jort_url,
  source_url,
  notes
) VALUES

-- 1. Loi Faillite 1968 → Loi Difficultés Entreprises 2016
(
  'Loi n°1968-07 du 8 mars 1968 (Faillite)',
  'القانون عدد 7 لسنة 1968 المتعلق بالإفلاس',
  'Loi n°2016-36 du 29 avril 2016 (Difficultés des entreprises)',
  'القانون عدد 36 لسنة 2016 المتعلق بإنقاذ المؤسسات ذات الصعوبات الاقتصادية',
  '2016-05-15',
  'total',
  NULL,
  'https://www.legislation.tn/fr/detailtexte/Loi-num-2016-36-du-29-04-2016-jort-2016-036__2016036003628',
  'https://legislation.tn',
  'Réforme complète du droit des difficultés des entreprises'
),

-- 2. Circulaire 216 (Mariage mixte) → Circulaire 164
(
  'Circulaire n°216 du 5 novembre 1973 (Mariage mixte musulman/non-musulman)',
  'المنشور عدد 216 المؤرخ في 5 نوفمبر 1973',
  'Circulaire n°164 du 8 septembre 2017',
  'المنشور عدد 164 المؤرخ في 8 سبتمبر 2017',
  '2017-09-08',
  'total',
  NULL,
  NULL,
  'https://legislation.tn',
  'Levée de l''interdiction du mariage mixte pour les femmes tunisiennes'
),

-- 3. Article 207 Code Pénal (Homosexualité) - Débat Abrogation
(
  'Article 207 du Code Pénal (Relations homosexuelles)',
  'الفصل 207 من المجلة الجزائية',
  'Proposition de Loi n°2017-58',
  'مقترح قانون عدد 58 لسنة 2017',
  '2017-08-13',
  'implicit',
  ARRAY['Article 207'],
  NULL,
  'https://legislation.tn',
  'Statut débattu - Plusieurs propositions d''abrogation en cours'
)

ON CONFLICT (abrogated_reference, abrogating_reference) DO NOTHING;

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

COMMENT ON TABLE legal_abrogations IS
  'Table des lois et articles abrogés en Tunisie avec support fuzzy matching';

COMMENT ON COLUMN legal_abrogations.scope IS
  'Portée de l''abrogation : total (complète), partial (partielle), implicit (implicite/débattue)';

COMMENT ON COLUMN legal_abrogations.affected_articles IS
  'Articles spécifiques concernés si abrogation partielle';

COMMENT ON FUNCTION find_abrogations IS
  'Recherche fuzzy d''abrogations avec seuil de similarité configurable';
