-- Migration: Ajout tracking quotas journaliers pour plan trial
-- Le plan trial passe de "30 requêtes totales" à "30/mois + 5/jour max"

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS daily_ai_queries_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_ai_queries_reset_date DATE DEFAULT CURRENT_DATE;

-- Réinitialiser trial_ai_uses_remaining sur users (colonne désormais inutilisée pour le tracking réel)
-- On garde la colonne pour compatibilité mais le vrai tracking passe dans feature_flags

COMMENT ON COLUMN feature_flags.daily_ai_queries_used IS 'Requêtes IA utilisées aujourd''hui (reset journalier)';
COMMENT ON COLUMN feature_flags.daily_ai_queries_reset_date IS 'Date du dernier reset journalier';
