-- Migration: tracking emails onboarding trial
-- Colonne JSONB pour suivre quels emails de séquence ont été envoyés
-- Exemple : '["j0_welcome","j3_nudge","j7_midway"]'

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_emails_sent JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_trial_onboarding
  ON users(trial_started_at, plan)
  WHERE plan = 'trial';

DO $$ BEGIN RAISE NOTICE '✅ Colonne trial_emails_sent ajoutée'; END $$;
