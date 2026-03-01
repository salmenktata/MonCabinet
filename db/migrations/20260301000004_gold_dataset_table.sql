-- Migration: Création de la table rag_gold_dataset
-- Remplace la gestion via fichier JSON statique par une table PostgreSQL

CREATE TABLE IF NOT EXISTS rag_gold_dataset (
  id TEXT PRIMARY KEY,                          -- ex: "civil_easy_01"
  domain TEXT NOT NULL,
  difficulty TEXT NOT NULL,                     -- easy | medium | hard | expert
  question TEXT NOT NULL,
  intent_type TEXT NOT NULL DEFAULT 'factual',  -- factual | citation_lookup | procedural | interpretive | comparative
  key_points TEXT[] NOT NULL DEFAULT '{}',
  mandatory_citations TEXT[] NOT NULL DEFAULT '{}',
  expected_articles TEXT[] NOT NULL DEFAULT '{}',
  gold_chunk_ids TEXT[] NOT NULL DEFAULT '{}',
  gold_document_ids TEXT[] NOT NULL DEFAULT '{}',
  min_recall_at_5 NUMERIC,
  eval_criteria JSONB,
  expert_validation JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour filtres fréquents
CREATE INDEX IF NOT EXISTS idx_gold_dataset_domain ON rag_gold_dataset (domain);
CREATE INDEX IF NOT EXISTS idx_gold_dataset_difficulty ON rag_gold_dataset (difficulty);
CREATE INDEX IF NOT EXISTS idx_gold_dataset_intent_type ON rag_gold_dataset (intent_type);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_gold_dataset_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gold_dataset_updated_at_trigger ON rag_gold_dataset;
CREATE TRIGGER gold_dataset_updated_at_trigger
  BEFORE UPDATE ON rag_gold_dataset
  FOR EACH ROW EXECUTE FUNCTION update_gold_dataset_updated_at();
