-- ============================================================================
-- Migration: Système de Suivi des Amendements JORT
-- Date: 2026-03-02
-- Description: Ajoute les types 'amends'/'amended_by' aux relations KB,
--              les colonnes d'amendement dans kb_structured_metadata,
--              et les index dédiés pour le RAG.
-- ============================================================================

-- ============================================================================
-- 1. ÉTENDRE kb_legal_relations — Nouveaux types de relation
-- ============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Trouver le nom du constraint CHECK sur relation_type
  SELECT conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'kb_legal_relations'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%relation_type%'
    AND pg_get_constraintdef(c.oid) LIKE '%cites%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE kb_legal_relations DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Contrainte % supprimée', v_constraint_name;
  ELSE
    RAISE NOTICE 'Contrainte non trouvée — peut-être déjà supprimée';
  END IF;
END $$;

-- Ajouter la contrainte étendue avec 'amends' et 'amended_by'
ALTER TABLE kb_legal_relations
  ADD CONSTRAINT kb_legal_relations_relation_type_check
  CHECK (relation_type IN (
    'cites',              -- Document A cite Document B
    'cited_by',           -- Document A cité par B (inverse)
    'supersedes',         -- Document A remplace/abroge B
    'superseded_by',      -- Document A remplacé par B
    'implements',         -- Arrêt A applique loi B
    'interpreted_by',     -- Loi A interprétée par juris B
    'commented_by',       -- Décision A commentée par doctrine B
    'related_case',       -- Jurisprudences similaires
    'same_topic',         -- Même sujet juridique
    'contradicts',        -- Contradiction juridique
    'confirms',           -- Confirmation jurisprudentielle (يؤكد)
    'overrules',          -- Revirement jurisprudentiel (نقض)
    'distinguishes',      -- Distinction sans revirement (تمييز)
    'applies',            -- Application d''une règle
    'interprets',         -- Interprétation d''un texte
    'amends',             -- NEW: JORT modifie un article d''un code tunisien
    'amended_by'          -- NEW: Inverse — code/article modifié par JORT
  ));

-- Index partiel dédié aux amendements (lookup rapide en RAG)
CREATE INDEX IF NOT EXISTS idx_kb_legal_relations_amends
  ON kb_legal_relations(source_kb_id, target_kb_id)
  WHERE relation_type IN ('amends', 'amended_by');

CREATE INDEX IF NOT EXISTS idx_kb_legal_relations_target_amends
  ON kb_legal_relations(target_kb_id, relation_type)
  WHERE relation_type IN ('amends', 'amended_by');

-- ============================================================================
-- 2. COLONNES AMENDEMENT dans kb_structured_metadata
-- ============================================================================

ALTER TABLE kb_structured_metadata
  ADD COLUMN IF NOT EXISTS is_jort_amendment   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS amended_code_slug   TEXT,
  ADD COLUMN IF NOT EXISTS amended_articles    INTEGER[],
  ADD COLUMN IF NOT EXISTS amendment_type      TEXT
    CHECK (amendment_type IN ('modification', 'abrogation', 'addition', 'replacement')),
  ADD COLUMN IF NOT EXISTS amendment_effective_date DATE,
  ADD COLUMN IF NOT EXISTS jort_issue_number   TEXT,
  ADD COLUMN IF NOT EXISTS jort_pub_date       DATE,
  ADD COLUMN IF NOT EXISTS amendment_extracted_at TIMESTAMPTZ;

-- Index pour filtrage rapide des amendements JORT
CREATE INDEX IF NOT EXISTS idx_kb_meta_is_jort_amendment
  ON kb_structured_metadata(is_jort_amendment)
  WHERE is_jort_amendment = true;

CREATE INDEX IF NOT EXISTS idx_kb_meta_amended_code_slug
  ON kb_structured_metadata(amended_code_slug)
  WHERE amended_code_slug IS NOT NULL;

-- ============================================================================
-- 3. FLAG TRAÇABILITÉ dans knowledge_base (extraction faite ou non)
-- ============================================================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS jort_amendments_extracted_at TIMESTAMPTZ;

-- Index pour le backfill — trouver les IORT non traités
CREATE INDEX IF NOT EXISTS idx_kb_jort_amendments_pending
  ON knowledge_base(id)
  WHERE (metadata->>'sourceOrigin' = 'iort_gov_tn')
    AND is_indexed = true
    AND jort_amendments_extracted_at IS NULL;

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================

COMMENT ON COLUMN kb_structured_metadata.is_jort_amendment
  IS 'true si ce document JORT modifie des articles de codes tunisiens';
COMMENT ON COLUMN kb_structured_metadata.amended_code_slug
  IS 'Code cible modifié (COC, CP, CT, MCO, CPC, CPP, CSP, CF, COSP)';
COMMENT ON COLUMN kb_structured_metadata.amended_articles
  IS 'Numéros des articles modifiés, ex: {65, 203, 337}';
COMMENT ON COLUMN kb_structured_metadata.amendment_type
  IS 'Type de modification : modification | abrogation | addition | replacement';
COMMENT ON COLUMN knowledge_base.jort_amendments_extracted_at
  IS 'Timestamp du dernier passage de l''extracteur d''amendements JORT';
