-- Migration: Système de feedback sur les sources RAG
-- Date: 2026-02-08
-- Description: Table pour stocker les feedbacks utilisateurs sur les sources juridiques

CREATE TABLE IF NOT EXISTS source_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id VARCHAR(255) NOT NULL,
  source_titre TEXT NOT NULL,
  is_positive BOOLEAN DEFAULT FALSE,
  is_negative BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, source_id)
);

-- Index pour améliorer les performances
CREATE INDEX idx_source_feedback_user_id ON source_feedback(user_id);
CREATE INDEX idx_source_feedback_source_id ON source_feedback(source_id);
CREATE INDEX idx_source_feedback_positive ON source_feedback(is_positive) WHERE is_positive = true;
CREATE INDEX idx_source_feedback_negative ON source_feedback(is_negative) WHERE is_negative = true;

-- Commentaires
COMMENT ON TABLE source_feedback IS 'Feedback utilisateurs sur les sources juridiques RAG';
COMMENT ON COLUMN source_feedback.source_id IS 'Identifiant de la source (hash du titre ou ID KB)';
COMMENT ON COLUMN source_feedback.is_positive IS 'Source jugée utile/pertinente';
COMMENT ON COLUMN source_feedback.is_negative IS 'Source jugée non pertinente';
