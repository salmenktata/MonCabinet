-- Migration : Suivi des demandes d'upgrade
-- Permet à l'admin de voir les demandes en attente et d'approuver en 1 clic

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS upgrade_requested_plan VARCHAR(20),
  ADD COLUMN IF NOT EXISTS upgrade_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upgrade_request_note   TEXT;

CREATE INDEX IF NOT EXISTS idx_users_upgrade_request
  ON users(upgrade_requested_at)
  WHERE upgrade_requested_plan IS NOT NULL;

DO $$ BEGIN RAISE NOTICE '✅ Colonnes upgrade_request ajoutées à users'; END $$;
