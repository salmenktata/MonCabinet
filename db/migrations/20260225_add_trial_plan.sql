/**
 * Migration : Ajout du plan "trial" (essai gratuit 14 jours)
 *
 * Changements :
 * - Mise à jour contrainte CHECK sur users.plan pour inclure 'trial' et 'expired_trial'
 * - Ajout colonne trial_started_at (timestamp de début d'essai)
 * - Ajout colonne trial_ai_uses_remaining (utilisations IA restantes dans l'essai)
 * - Renommage 'free' → reste 'free' (gardé pour compatibilité), 'pro' reste 'pro' (affiché "Solo" en UI)
 */

-- ============================================================================
-- MISE À JOUR CONTRAINTE PLAN
-- ============================================================================

-- Supprimer l'ancienne contrainte CHECK sur le plan
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;

-- Ajouter la nouvelle contrainte incluant 'trial' et 'expired_trial'
ALTER TABLE users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'trial', 'pro', 'enterprise', 'expired_trial'));

-- ============================================================================
-- NOUVELLES COLONNES TRIAL
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ai_uses_remaining INTEGER DEFAULT 30;

-- ============================================================================
-- INDEX
-- ============================================================================

-- Index pour retrouver les trials actifs rapidement
CREATE INDEX IF NOT EXISTS idx_users_trial ON users(trial_started_at)
  WHERE plan = 'trial';

-- Index pour détecter les trials expirés (cron nightly)
CREATE INDEX IF NOT EXISTS idx_users_plan_expires ON users(plan, plan_expires_at)
  WHERE plan IN ('trial', 'pro', 'enterprise');

-- ============================================================================
-- INITIALISATION : Mettre les utilisateurs 'free' existants en trial
-- (À ajuster selon votre politique de migration)
-- ============================================================================

-- NE PAS migrer automatiquement les free existants — garder leur plan intact.
-- Les nouveaux inscrits auront plan='trial' dès l'inscription.

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration trial plan terminée';
  RAISE NOTICE '📊 Nouveaux plans: trial, expired_trial';
  RAISE NOTICE '📋 Nouvelles colonnes: trial_started_at, trial_ai_uses_remaining';
END $$;
