-- Migration: Ajout flag is_system_account sur la table users
-- Les comptes système/test sont exclus des statistiques de consommation IA

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_system_account BOOLEAN NOT NULL DEFAULT false;

-- Marquer le compte de test E2E comme compte système
UPDATE users
  SET is_system_account = true
  WHERE email = 'e2e-test@qadhya.tn';

-- Index partiel pour filtrage rapide (très peu de comptes système)
CREATE INDEX IF NOT EXISTS idx_users_is_system_account
  ON users(is_system_account)
  WHERE is_system_account = true;

COMMENT ON COLUMN users.is_system_account IS 'Compte système/test — exclu des statistiques de consommation IA';
