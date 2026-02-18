-- Table pour le suivi d'hallucination en production (Sprint 2 B2)
-- Échantillonnage 10% des conversations, LLM Judge asynchrone

CREATE TABLE IF NOT EXISTS rag_hallucination_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  message_id UUID,
  question TEXT NOT NULL,
  answer_preview TEXT,
  sources_count INTEGER,
  faithfulness_score FLOAT NOT NULL,
  covered_points INTEGER,
  total_points INTEGER,
  reasoning TEXT,
  model TEXT,
  flagged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hallucination_flagged
ON rag_hallucination_checks(flagged) WHERE flagged = true;

CREATE INDEX IF NOT EXISTS idx_hallucination_created
ON rag_hallucination_checks(created_at DESC);
