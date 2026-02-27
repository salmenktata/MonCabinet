-- Migration: rag_query_log + rag_silver_dataset
-- Sprint 1 — Data Flywheel : persistance des queries prod
-- Date: 2026-03-01

-- =============================================================================
-- TABLE: rag_query_log
-- Enregistre chaque requête RAG en production (chat non-streaming + streaming)
-- Fondation du data flywheel : permet gap analysis, silver generation, risk scoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contexte
  conversation_id UUID,
  question TEXT NOT NULL,
  question_language TEXT,          -- 'ar' | 'fr' | 'mixed'
  domain TEXT,                     -- Domaine juridique détecté par le classifier
  router_confidence FLOAT,         -- Confiance du routeur (0.0–1.0)

  -- Résultats de retrieval
  retrieved_chunk_ids UUID[],      -- IDs des chunks retournés (top-k)
  retrieved_scores FLOAT[],        -- Scores de similarité correspondants
  avg_similarity FLOAT,            -- Similarité moyenne
  sources_count INTEGER,           -- Nombre de sources retournées

  -- Qualité de la réponse
  quality_gate_triggered BOOLEAN DEFAULT FALSE,
  abstention_reason TEXT,          -- 'quality_gate' | 'no_results' | 'error' | NULL
  answer_length INTEGER,           -- Longueur de la réponse (chars)
  quality_indicator TEXT,          -- 'high' | 'medium' | 'low'
  latency_ms INTEGER,              -- Latence totale (ms)

  -- Feedback utilisateur (mis à jour ultérieurement via trigger/update)
  user_feedback TEXT,              -- 'positive' | 'negative' | NULL
  feedback_tags TEXT[],            -- ['incorrect', 'incomplete', ...] depuis chat_message_feedback

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les analyses temporelles
CREATE INDEX IF NOT EXISTS idx_rag_query_log_created ON rag_query_log(created_at DESC);
-- Index pour le gap analysis par domaine
CREATE INDEX IF NOT EXISTS idx_rag_query_log_domain ON rag_query_log(domain);
-- Index sparse pour les abstentions (principal signal de gap)
CREATE INDEX IF NOT EXISTS idx_rag_query_log_abstention ON rag_query_log(abstention_reason)
  WHERE abstention_reason IS NOT NULL;
-- Index pour le suivi par conversation
CREATE INDEX IF NOT EXISTS idx_rag_query_log_conversation ON rag_query_log(conversation_id)
  WHERE conversation_id IS NOT NULL;
-- Index composite pour la silver generation (feedback positif + bonne similarité)
CREATE INDEX IF NOT EXISTS idx_rag_query_log_silver_candidates
  ON rag_query_log(user_feedback, avg_similarity)
  WHERE user_feedback = 'positive';

-- TTL implicite : garder 90 jours (purge par cron)
COMMENT ON TABLE rag_query_log IS
  'Log des requêtes RAG en production — fondation du data flywheel. Purge automatique > 90 jours.';

-- =============================================================================
-- TABLE: rag_silver_dataset
-- Cas de test "Silver" générés automatiquement depuis les queries prod
-- validés par feedback positif et similarité élevée
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_silver_dataset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origine
  source_query_log_id UUID REFERENCES rag_query_log(id) ON DELETE SET NULL,
  domain TEXT,
  difficulty TEXT DEFAULT 'medium',  -- 'easy' | 'medium' | 'hard'

  -- Question et réponse
  question TEXT NOT NULL,
  actual_answer TEXT,                -- Réponse générée ayant reçu feedback positif
  key_points TEXT[],                 -- Key points extraits par LLM depuis actual_answer

  -- Contexte d'évaluation
  gold_chunk_ids UUID[],             -- Chunks récupérés lors de la génération originale
  avg_similarity FLOAT,

  -- Workflow de validation
  status TEXT NOT NULL DEFAULT 'draft',
    -- 'draft'     → généré automatiquement, pas encore validé
    -- 'validated' → approuvé par avocat/admin pour usage en eval
    -- 'rejected'  → rejeté (réponse incorrecte ou trop simple)
  reviewed_by UUID,                  -- user_id de l'avocat/admin qui a validé
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_silver_domain ON rag_silver_dataset(domain);
CREATE INDEX IF NOT EXISTS idx_rag_silver_status ON rag_silver_dataset(status);
CREATE INDEX IF NOT EXISTS idx_rag_silver_created ON rag_silver_dataset(created_at DESC);

COMMENT ON TABLE rag_silver_dataset IS
  'Dataset Silver auto-généré depuis les queries prod avec feedback positif. '
  'Statut draft → validated par un avocat avant usage en benchmark eval.';
