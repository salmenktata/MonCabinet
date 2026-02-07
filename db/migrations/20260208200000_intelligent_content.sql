/**
 * Migration: Système Intelligent de Traitement du Contenu Juridique
 * Date: 2026-02-08
 * Description: Tables pour l'analyse qualité, classification juridique,
 *              détection de contradictions et queue de revue humaine
 */

-- ============================================================================
-- EXTENSION TABLE WEB_PAGES - Nouveaux champs pour le pipeline intelligent
-- ============================================================================

ALTER TABLE web_pages
  ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS relevance_score FLOAT CHECK (relevance_score BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS legal_domain TEXT,
  ADD COLUMN IF NOT EXISTS requires_human_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'analyzed', 'classified', 'validated', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_web_pages_processing_status
  ON web_pages(processing_status)
  WHERE processing_status IN ('pending', 'analyzed');

CREATE INDEX IF NOT EXISTS idx_web_pages_quality_score
  ON web_pages(quality_score DESC)
  WHERE quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_pages_requires_review
  ON web_pages(created_at DESC)
  WHERE requires_human_review = true;

-- ============================================================================
-- TABLE CONTENT_QUALITY_ASSESSMENTS - Évaluation qualité du contenu
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,

  -- Scores (0-100)
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  clarity_score INTEGER CHECK (clarity_score BETWEEN 0 AND 100),
  structure_score INTEGER CHECK (structure_score BETWEEN 0 AND 100),
  completeness_score INTEGER CHECK (completeness_score BETWEEN 0 AND 100),
  reliability_score INTEGER CHECK (reliability_score BETWEEN 0 AND 100),
  freshness_score INTEGER CHECK (freshness_score BETWEEN 0 AND 100),
  relevance_score INTEGER CHECK (relevance_score BETWEEN 0 AND 100),

  -- Analyse LLM
  analysis_summary TEXT,
  detected_issues JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,

  -- Métadonnées juridiques extraites
  legal_references JSONB DEFAULT '[]'::jsonb,
  document_date DATE,
  document_type_detected TEXT,
  jurisdiction TEXT,

  -- État
  requires_review BOOLEAN DEFAULT false,
  review_reason TEXT,

  -- LLM utilisé
  llm_provider TEXT,
  llm_model TEXT,
  tokens_used INTEGER,
  processing_time_ms INTEGER,

  assessed_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_quality_assessment UNIQUE(web_page_id)
);

CREATE INDEX IF NOT EXISTS idx_quality_assessments_score
  ON content_quality_assessments(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_quality_assessments_requires_review
  ON content_quality_assessments(assessed_at DESC)
  WHERE requires_review = true;

-- ============================================================================
-- TABLE LEGAL_CLASSIFICATIONS - Classification juridique du contenu
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,

  -- Classification principale
  primary_category TEXT NOT NULL CHECK (primary_category IN (
    'legislation', 'jurisprudence', 'doctrine', 'jort',
    'modeles', 'procedures', 'formulaires', 'actualites', 'autre'
  )),
  subcategory TEXT,

  -- Domaine juridique
  domain TEXT CHECK (domain IN (
    'civil', 'commercial', 'penal', 'famille', 'fiscal',
    'social', 'administratif', 'immobilier', 'bancaire',
    'propriete_intellectuelle', 'international', 'autre'
  )),
  subdomain TEXT,

  -- Nature du document
  document_nature TEXT CHECK (document_nature IN (
    'loi', 'decret', 'arrete', 'circulaire', 'ordonnance',
    'arret', 'jugement', 'ordonnance_jud', 'avis',
    'article_doctrine', 'these', 'commentaire', 'note',
    'modele_contrat', 'modele_acte', 'formulaire',
    'guide_pratique', 'faq', 'actualite', 'autre'
  )),

  -- Confiance
  confidence_score FLOAT CHECK (confidence_score BETWEEN 0 AND 1),
  requires_validation BOOLEAN DEFAULT false,
  validation_reason TEXT,
  alternative_classifications JSONB DEFAULT '[]'::jsonb,

  -- Mots-clés juridiques détectés
  legal_keywords JSONB DEFAULT '[]'::jsonb,

  -- Validation humaine
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  final_classification JSONB,
  validation_notes TEXT,

  -- LLM utilisé
  llm_provider TEXT,
  llm_model TEXT,
  tokens_used INTEGER,

  classified_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_legal_classification UNIQUE(web_page_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_classifications_domain
  ON legal_classifications(domain, subdomain);

CREATE INDEX IF NOT EXISTS idx_legal_classifications_category
  ON legal_classifications(primary_category, document_nature);

CREATE INDEX IF NOT EXISTS idx_legal_classifications_requires_validation
  ON legal_classifications(classified_at DESC)
  WHERE requires_validation = true;

CREATE INDEX IF NOT EXISTS idx_legal_classifications_confidence
  ON legal_classifications(confidence_score);

-- ============================================================================
-- TABLE CONTENT_CONTRADICTIONS - Détection des contradictions
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Documents concernés
  source_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
  target_page_id UUID REFERENCES web_pages(id) ON DELETE SET NULL,

  -- Type de contradiction
  contradiction_type TEXT NOT NULL CHECK (contradiction_type IN (
    'version_conflict',        -- Versions différentes d'un même texte
    'interpretation_conflict', -- Interprétations contradictoires
    'date_conflict',           -- Dates incohérentes
    'legal_update',            -- Texte abrogé/modifié par un autre
    'doctrine_vs_practice',    -- Doctrine vs jurisprudence
    'cross_reference_error'    -- Référence croisée incorrecte
  )),

  -- Sévérité
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Description
  description TEXT NOT NULL,
  source_excerpt TEXT,
  target_excerpt TEXT,

  -- Analyse
  similarity_score FLOAT,
  legal_impact TEXT,
  suggested_resolution TEXT,

  -- Références légales concernées
  affected_references JSONB DEFAULT '[]'::jsonb,

  -- État de résolution
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'under_review', 'resolved', 'dismissed', 'escalated'
  )),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,

  -- LLM utilisé pour détection
  llm_provider TEXT,
  llm_model TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contradictions_source
  ON content_contradictions(source_page_id);

CREATE INDEX IF NOT EXISTS idx_contradictions_target
  ON content_contradictions(target_page_id)
  WHERE target_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contradictions_status
  ON content_contradictions(status, severity DESC)
  WHERE status IN ('pending', 'under_review');

CREATE INDEX IF NOT EXISTS idx_contradictions_type
  ON content_contradictions(contradiction_type);

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_contradictions_updated_at
  BEFORE UPDATE ON content_contradictions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE HUMAN_REVIEW_QUEUE - Queue de revue humaine
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type de revue demandée
  review_type TEXT NOT NULL CHECK (review_type IN (
    'classification_uncertain',  -- Classification incertaine
    'quality_low',               -- Qualité basse mais pas rejet auto
    'contradiction_detected',    -- Contradiction détectée
    'content_ambiguous',         -- Contenu ambigu
    'source_reliability',        -- Fiabilité source à vérifier
    'legal_update_detected',     -- Mise à jour légale détectée
    'duplicate_suspected',       -- Doublon potentiel
    'manual_request'             -- Demande manuelle de revue
  )),

  -- Cible de la revue
  target_type TEXT NOT NULL CHECK (target_type IN (
    'web_page', 'contradiction', 'classification', 'quality_assessment'
  )),
  target_id UUID NOT NULL,

  -- Contexte
  title TEXT NOT NULL,
  description TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  suggested_actions JSONB DEFAULT '[]'::jsonb,

  -- Scores associés
  quality_score INTEGER,
  confidence_score FLOAT,

  -- Priorité
  priority TEXT DEFAULT 'normal' CHECK (priority IN (
    'low', 'normal', 'high', 'urgent'
  )),

  -- Attribution
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'assigned', 'in_progress', 'completed', 'skipped', 'expired'
  )),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Décision
  decision TEXT CHECK (decision IN (
    'approve', 'reject', 'modify', 'escalate', 'defer'
  )),
  decision_notes TEXT,
  modifications_made JSONB DEFAULT '{}'::jsonb,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,

  -- Métriques
  time_to_decision_ms INTEGER,

  -- Expiration automatique (optionnel)
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index optimisé pour la queue
CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON human_review_queue(priority DESC, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_queue_assigned
  ON human_review_queue(assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_queue_target
  ON human_review_queue(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_type
  ON human_review_queue(review_type);

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_review_queue_updated_at
  BEFORE UPDATE ON human_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

/**
 * Récupérer le prochain item de revue en attente
 */
CREATE OR REPLACE FUNCTION claim_next_review_item(
  p_user_id UUID,
  p_review_types TEXT[] DEFAULT NULL,
  p_priority_min TEXT DEFAULT 'low'
)
RETURNS TABLE (
  review_id UUID,
  review_type TEXT,
  target_type TEXT,
  target_id UUID,
  title TEXT,
  description TEXT,
  context JSONB,
  suggested_actions JSONB,
  priority TEXT,
  quality_score INTEGER,
  confidence_score FLOAT
) AS $$
DECLARE
  v_review_id UUID;
  v_priority_order TEXT[] := ARRAY['urgent', 'high', 'normal', 'low'];
  v_min_priority_idx INTEGER;
BEGIN
  -- Trouver l'index de la priorité minimum
  SELECT array_position(v_priority_order, p_priority_min) INTO v_min_priority_idx;
  IF v_min_priority_idx IS NULL THEN
    v_min_priority_idx := 4; -- 'low'
  END IF;

  -- Sélectionner et verrouiller le prochain item
  SELECT h.id INTO v_review_id
  FROM human_review_queue h
  WHERE h.status = 'pending'
    AND (p_review_types IS NULL OR h.review_type = ANY(p_review_types))
    AND array_position(v_priority_order, h.priority) <= v_min_priority_idx
    AND (h.expires_at IS NULL OR h.expires_at > NOW())
  ORDER BY
    array_position(v_priority_order, h.priority),
    h.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_review_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme assigné
  UPDATE human_review_queue
  SET status = 'assigned',
      assigned_to = p_user_id,
      assigned_at = NOW()
  WHERE id = v_review_id;

  -- Retourner les détails
  RETURN QUERY
  SELECT
    h.id as review_id,
    h.review_type,
    h.target_type,
    h.target_id,
    h.title,
    h.description,
    h.context,
    h.suggested_actions,
    h.priority,
    h.quality_score,
    h.confidence_score
  FROM human_review_queue h
  WHERE h.id = v_review_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Compléter une revue
 */
CREATE OR REPLACE FUNCTION complete_review(
  p_review_id UUID,
  p_user_id UUID,
  p_decision TEXT,
  p_decision_notes TEXT DEFAULT NULL,
  p_modifications JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_time_ms INTEGER;
BEGIN
  -- Vérifier que l'item est assigné à cet utilisateur
  SELECT assigned_at INTO v_started_at
  FROM human_review_queue
  WHERE id = p_review_id
    AND (assigned_to = p_user_id OR assigned_to IS NULL);

  IF v_started_at IS NULL THEN
    RETURN false;
  END IF;

  -- Calculer le temps de décision
  v_time_ms := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_started_at, NOW()))) * 1000;

  -- Mettre à jour
  UPDATE human_review_queue
  SET status = 'completed',
      decision = p_decision,
      decision_notes = p_decision_notes,
      modifications_made = p_modifications,
      completed_by = p_user_id,
      completed_at = NOW(),
      time_to_decision_ms = v_time_ms
  WHERE id = p_review_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

/**
 * Statistiques de la queue de revue
 */
CREATE OR REPLACE FUNCTION get_review_queue_stats()
RETURNS TABLE (
  pending_count BIGINT,
  assigned_count BIGINT,
  completed_today BIGINT,
  avg_decision_time_ms BIGINT,
  by_type JSONB,
  by_priority JSONB,
  by_decision JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM human_review_queue WHERE status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM human_review_queue WHERE status IN ('assigned', 'in_progress'))::BIGINT,
    (SELECT COUNT(*) FROM human_review_queue WHERE status = 'completed' AND completed_at >= CURRENT_DATE)::BIGINT,
    (SELECT COALESCE(AVG(time_to_decision_ms), 0)::BIGINT FROM human_review_queue WHERE status = 'completed'),
    (
      SELECT COALESCE(jsonb_object_agg(review_type, cnt), '{}'::jsonb)
      FROM (
        SELECT review_type, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'pending'
        GROUP BY review_type
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::jsonb)
      FROM (
        SELECT priority, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'pending'
        GROUP BY priority
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(decision, cnt), '{}'::jsonb)
      FROM (
        SELECT decision, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY decision
      ) sub
    );
END;
$$ LANGUAGE plpgsql;

/**
 * Statistiques du pipeline intelligent
 */
CREATE OR REPLACE FUNCTION get_intelligent_pipeline_stats()
RETURNS TABLE (
  total_processed BIGINT,
  auto_indexed BIGINT,
  auto_rejected BIGINT,
  pending_review BIGINT,
  avg_quality_score FLOAT,
  by_domain JSONB,
  by_category JSONB,
  contradictions_count BIGINT,
  contradictions_critical BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM web_pages WHERE processing_status != 'pending')::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE processing_status = 'validated' AND is_indexed = true)::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE processing_status = 'rejected')::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE requires_human_review = true AND processing_status NOT IN ('validated', 'rejected'))::BIGINT,
    (SELECT COALESCE(AVG(overall_score), 0)::FLOAT FROM content_quality_assessments),
    (
      SELECT COALESCE(jsonb_object_agg(domain, cnt), '{}'::jsonb)
      FROM (
        SELECT domain, COUNT(*) as cnt
        FROM legal_classifications
        WHERE domain IS NOT NULL
        GROUP BY domain
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(primary_category, cnt), '{}'::jsonb)
      FROM (
        SELECT primary_category, COUNT(*) as cnt
        FROM legal_classifications
        GROUP BY primary_category
      ) sub
    ),
    (SELECT COUNT(*) FROM content_contradictions WHERE status IN ('pending', 'under_review'))::BIGINT,
    (SELECT COUNT(*) FROM content_contradictions WHERE severity = 'critical' AND status = 'pending')::BIGINT;
END;
$$ LANGUAGE plpgsql;

/**
 * Créer une demande de revue automatiquement
 */
CREATE OR REPLACE FUNCTION create_review_request(
  p_review_type TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_priority TEXT DEFAULT 'normal',
  p_quality_score INTEGER DEFAULT NULL,
  p_confidence_score FLOAT DEFAULT NULL,
  p_suggested_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Vérifier qu'une demande similaire n'existe pas déjà
  IF EXISTS (
    SELECT 1 FROM human_review_queue
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND status IN ('pending', 'assigned', 'in_progress')
  ) THEN
    -- Retourner l'ID existant
    SELECT id INTO v_review_id
    FROM human_review_queue
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND status IN ('pending', 'assigned', 'in_progress')
    LIMIT 1;
    RETURN v_review_id;
  END IF;

  INSERT INTO human_review_queue (
    review_type, target_type, target_id, title, description,
    context, priority, quality_score, confidence_score, suggested_actions
  ) VALUES (
    p_review_type, p_target_type, p_target_id, p_title, p_description,
    p_context, p_priority, p_quality_score, p_confidence_score, p_suggested_actions
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AJOUT TYPES NOTIFICATIONS ADMIN
-- ============================================================================

-- Ajouter les nouveaux types de notification si la table existe
DO $$
BEGIN
  -- Vérifier si la colonne notification_type a une contrainte CHECK
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_notifications'
    AND column_name = 'notification_type'
  ) THEN
    -- Les contraintes CHECK sur les enums sont gérées différemment
    -- On laisse le code applicatif gérer les nouveaux types
    RAISE NOTICE 'Table admin_notifications existe - les nouveaux types seront gérés côté application';
  END IF;
END $$;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Migration Intelligent Content terminée!';
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Colonnes ajoutées à web_pages:';
  RAISE NOTICE '  - quality_score, relevance_score';
  RAISE NOTICE '  - legal_domain, requires_human_review';
  RAISE NOTICE '  - processing_status';
  RAISE NOTICE '';
  RAISE NOTICE 'Nouvelles tables:';
  RAISE NOTICE '  - content_quality_assessments';
  RAISE NOTICE '  - legal_classifications';
  RAISE NOTICE '  - content_contradictions';
  RAISE NOTICE '  - human_review_queue';
  RAISE NOTICE '';
  RAISE NOTICE 'Nouvelles fonctions:';
  RAISE NOTICE '  - claim_next_review_item()';
  RAISE NOTICE '  - complete_review()';
  RAISE NOTICE '  - get_review_queue_stats()';
  RAISE NOTICE '  - get_intelligent_pipeline_stats()';
  RAISE NOTICE '  - create_review_request()';
  RAISE NOTICE '===============================================';
END $$;
