-- Migration: expert_review_queue
-- Sprint 3 — Human-in-the-Loop : review queue pour réponses à haut risque
-- Date: 2026-03-01

-- =============================================================================
-- TABLE: expert_review_queue
-- Réponses RAG à haut risque routées vers relecture avocat/admin
-- Les réponses validées deviennent automatiquement des Silver cases
-- =============================================================================

CREATE TABLE IF NOT EXISTS expert_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contexte de la requête
  conversation_id UUID,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources_used JSONB,          -- Snapshot des sources retournées (id, title, similarity)

  -- Risk scoring
  risk_score FLOAT NOT NULL,   -- 0.0–1.0 (> seuil = ajouté à la queue)
  risk_level TEXT NOT NULL,    -- 'low' | 'medium' | 'high'
  risk_signals JSONB NOT NULL, -- Array de { type, weight, detail }

  -- Métadonnées RAG au moment de la réponse
  avg_similarity FLOAT,
  sources_count INTEGER,
  quality_indicator TEXT,
  abstention_reason TEXT,

  -- Workflow de review
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending'  → en attente de relecture
    -- 'reviewed' → relu par un avocat
    -- 'escalated'→ escaladé à un expert senior
    -- 'dismissed'→ rejeté (faux positif du risk scorer)
  reviewer_id UUID,            -- user_id de l'avocat qui a relu
  reviewed_at TIMESTAMPTZ,
  validated_answer TEXT,       -- Réponse corrigée/validée par l'avocat
  review_notes TEXT,

  -- Si la réponse validée a été convertie en Silver case
  silver_case_id UUID REFERENCES rag_silver_dataset(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour la gestion de la queue
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON expert_review_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_queue_risk ON expert_review_queue(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_created ON expert_review_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_conversation ON expert_review_queue(conversation_id)
  WHERE conversation_id IS NOT NULL;

COMMENT ON TABLE expert_review_queue IS
  'Queue de relecture pour les réponses RAG à haut risque. '
  'Les réponses validées alimentent automatiquement le Silver dataset.';
