-- Migration: Ajout de métadonnées de classification multi-signaux
-- Date: 2026-02-08
-- Description: Ajoute des colonnes pour tracer la source et les signaux
--              utilisés lors de la classification (structure, règles, LLM)

-- Ajouter les colonnes de métadonnées
ALTER TABLE legal_classifications
ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IN ('llm', 'rules', 'structure', 'hybrid')),
ADD COLUMN IF NOT EXISTS signals_used JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS rules_matched TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS structure_hints JSONB DEFAULT NULL;

-- Index pour recherche par source de classification
CREATE INDEX IF NOT EXISTS idx_legal_classifications_source
ON legal_classifications(classification_source);

-- Index GIN pour recherche dans les signaux
CREATE INDEX IF NOT EXISTS idx_legal_classifications_signals
ON legal_classifications USING gin(signals_used);

-- Commentaires sur les colonnes
COMMENT ON COLUMN legal_classifications.classification_source IS 'Source principale de la classification: llm, rules, structure, ou hybrid';
COMMENT ON COLUMN legal_classifications.signals_used IS 'Signaux utilisés pour la classification (structure, règles, LLM) avec confiances';
COMMENT ON COLUMN legal_classifications.rules_matched IS 'IDs des règles de classification matchées';
COMMENT ON COLUMN legal_classifications.structure_hints IS 'Indices structurels détectés (breadcrumbs, URL, navigation)';
