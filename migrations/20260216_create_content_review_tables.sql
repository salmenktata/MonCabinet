/**
 * Migration: Workflow Révision Contenu Juridique
 *
 * Permet aux experts juridiques de réviser et valider le contenu de la KB
 *
 * Date: 16 février 2026
 */

-- ============================================================================
-- Table: content_reviews
-- Révisions manuelles des documents KB par experts
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document révisé
  kb_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,

  -- Révision
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'needs_changes'

  -- Feedback
  comments TEXT,
  suggested_changes TEXT, -- Modifications suggérées
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5), -- 1=faible, 5=excellent

  -- Validation
  metadata_validated BOOLEAN DEFAULT false, -- Métadonnées validées
  content_validated BOOLEAN DEFAULT false, -- Contenu validé
  references_validated BOOLEAN DEFAULT false, -- Références juridiques validées

  -- Metadata
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Contrainte: un seul review actif par document
  UNIQUE(kb_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_content_reviews_kb ON content_reviews(kb_id);
CREATE INDEX idx_content_reviews_reviewer ON content_reviews(reviewer_id);
CREATE INDEX idx_content_reviews_status ON content_reviews(status) WHERE status = 'pending';
CREATE INDEX idx_content_reviews_created ON content_reviews(created_at DESC);

-- ============================================================================
-- Ajout colonnes knowledge_base
-- ============================================================================

-- Ajouter colonnes si elles n'existent pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_base' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE knowledge_base
    ADD COLUMN review_status VARCHAR(20) DEFAULT 'not_reviewed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_base' AND column_name = 'verified'
  ) THEN
    ALTER TABLE knowledge_base
    ADD COLUMN verified BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_base' AND column_name = 'verified_by'
  ) THEN
    ALTER TABLE knowledge_base
    ADD COLUMN verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_base' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE knowledge_base
    ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_kb_review_status ON knowledge_base(review_status) WHERE review_status != 'not_reviewed';
CREATE INDEX IF NOT EXISTS idx_kb_verified ON knowledge_base(verified) WHERE verified = true;

-- ============================================================================
-- Vue: Queue révisions
-- ============================================================================

CREATE OR REPLACE VIEW vw_content_review_queue AS
SELECT
  kb.id as kb_id,
  kb.title,
  kb.category,
  kb.source,
  kb.quality_score,
  kb.review_status,
  kb.verified,

  -- Review actif
  cr.id as current_review_id,
  cr.reviewer_id,
  cr.status as review_status_detail,
  cr.created_at as review_created_at,

  -- Stats
  (SELECT COUNT(*) FROM content_reviews WHERE kb_id = kb.id) as total_reviews,
  (SELECT COUNT(*) FROM content_reviews WHERE kb_id = kb.id AND status = 'approved') as approved_count,
  (SELECT COUNT(*) FROM content_reviews WHERE kb_id = kb.id AND status = 'rejected') as rejected_count

FROM knowledge_base kb
LEFT JOIN content_reviews cr ON cr.kb_id = kb.id AND cr.status = 'pending'
WHERE kb.is_active = true
  AND kb.review_status IN ('pending', 'needs_changes')
ORDER BY
  CASE kb.review_status
    WHEN 'needs_changes' THEN 1
    WHEN 'pending' THEN 2
    ELSE 3
  END,
  kb.quality_score DESC NULLS LAST,
  kb.created_at DESC;

-- ============================================================================
-- Fonction: Soumettre document pour révision
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_for_review(
  p_kb_id UUID,
  p_submitted_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Mettre à jour statut KB
  UPDATE knowledge_base
  SET
    review_status = 'pending',
    updated_at = NOW()
  WHERE id = p_kb_id;

  -- Créer review
  INSERT INTO content_reviews (
    kb_id,
    reviewer_id,
    status
  )
  VALUES (
    p_kb_id,
    p_submitted_by,
    'pending'
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;

-- ============================================================================
-- Fonction: Approuver review
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_review(
  p_review_id UUID,
  p_reviewer_id UUID,
  p_comments TEXT DEFAULT NULL,
  p_quality_rating INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_kb_id UUID;
BEGIN
  -- Récupérer KB ID
  SELECT kb_id INTO v_kb_id
  FROM content_reviews
  WHERE id = p_review_id;

  IF v_kb_id IS NULL THEN
    RETURN false;
  END IF;

  -- Mettre à jour review
  UPDATE content_reviews
  SET
    status = 'approved',
    reviewer_id = p_reviewer_id,
    comments = p_comments,
    quality_rating = p_quality_rating,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_review_id;

  -- Mettre à jour KB
  UPDATE knowledge_base
  SET
    review_status = 'approved',
    verified = true,
    verified_by = p_reviewer_id,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_kb_id;

  RETURN true;
END;
$$;

-- ============================================================================
-- Fonction: Rejeter review
-- ============================================================================

CREATE OR REPLACE FUNCTION reject_review(
  p_review_id UUID,
  p_reviewer_id UUID,
  p_comments TEXT,
  p_suggested_changes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_kb_id UUID;
BEGIN
  SELECT kb_id INTO v_kb_id
  FROM content_reviews
  WHERE id = p_review_id;

  IF v_kb_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE content_reviews
  SET
    status = 'rejected',
    reviewer_id = p_reviewer_id,
    comments = p_comments,
    suggested_changes = p_suggested_changes,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_review_id;

  UPDATE knowledge_base
  SET
    review_status = 'rejected',
    verified = false,
    updated_at = NOW()
  WHERE id = v_kb_id;

  RETURN true;
END;
$$;

-- ============================================================================
-- Fonction: Demander modifications
-- ============================================================================

CREATE OR REPLACE FUNCTION request_changes_review(
  p_review_id UUID,
  p_reviewer_id UUID,
  p_comments TEXT,
  p_suggested_changes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_kb_id UUID;
BEGIN
  SELECT kb_id INTO v_kb_id
  FROM content_reviews
  WHERE id = p_review_id;

  IF v_kb_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE content_reviews
  SET
    status = 'needs_changes',
    reviewer_id = p_reviewer_id,
    comments = p_comments,
    suggested_changes = p_suggested_changes,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_review_id;

  UPDATE knowledge_base
  SET
    review_status = 'needs_changes',
    updated_at = NOW()
  WHERE id = v_kb_id;

  RETURN true;
END;
$$;

-- ============================================================================
-- Commentaires
-- ============================================================================

COMMENT ON TABLE content_reviews IS 'Révisions manuelles des documents KB par experts juridiques';

COMMENT ON COLUMN content_reviews.status IS 'pending (en attente), approved (approuvé), rejected (rejeté), needs_changes (modifications requises)';
COMMENT ON COLUMN content_reviews.quality_rating IS '1=faible, 2=moyen, 3=bon, 4=très bon, 5=excellent';

COMMENT ON COLUMN knowledge_base.review_status IS 'not_reviewed (pas révisé), pending (en attente), needs_changes (modif requises), approved (approuvé), rejected (rejeté)';
COMMENT ON COLUMN knowledge_base.verified IS 'true si document vérifié par expert juridique';

-- ============================================================================
-- Permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON content_reviews TO qadhya;
GRANT SELECT ON vw_content_review_queue TO qadhya;
