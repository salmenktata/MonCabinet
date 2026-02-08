-- Migration: Tables pour l'apprentissage automatique
-- Date: 2026-02-08
-- Description: Tables pour enregistrer les corrections et générer automatiquement des règles

-- Table des corrections de classification
CREATE TABLE IF NOT EXISTS classification_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,

  -- Informations de la page
  page_url TEXT NOT NULL,
  page_title TEXT,
  page_structure JSONB,

  -- Classification originale (avant correction)
  original_category TEXT,
  original_domain TEXT,
  original_document_type TEXT,
  original_confidence DOUBLE PRECISION,
  classification_signals JSONB DEFAULT '{}'::jsonb,

  -- Classification corrigée (après correction humaine)
  corrected_category TEXT,
  corrected_domain TEXT,
  corrected_document_type TEXT,

  -- Apprentissage
  used_for_learning BOOLEAN DEFAULT false,
  generated_rule_id UUID REFERENCES source_classification_rules(id) ON DELETE SET NULL,

  -- Métadonnées
  corrected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  corrected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_corrections_page ON classification_corrections(web_page_id);
CREATE INDEX IF NOT EXISTS idx_corrections_unused ON classification_corrections(used_for_learning) WHERE used_for_learning = false;
CREATE INDEX IF NOT EXISTS idx_corrections_rule ON classification_corrections(generated_rule_id) WHERE generated_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corrections_user ON classification_corrections(corrected_by, corrected_at DESC);

-- Table de log pour l'apprentissage automatique
CREATE TABLE IF NOT EXISTS classification_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES source_classification_rules(id) ON DELETE CASCADE,
  learned_from_page_id UUID REFERENCES web_pages(id) ON DELETE SET NULL,
  learned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pattern_type TEXT NOT NULL,
  pattern_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_log_rule ON classification_learning_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_learning_log_date ON classification_learning_log(created_at DESC);

-- Commentaires
COMMENT ON TABLE classification_corrections IS 'Enregistre les corrections manuelles pour apprentissage automatique';
COMMENT ON TABLE classification_learning_log IS 'Log des règles générées automatiquement';
