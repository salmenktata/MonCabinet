-- Migration : Ajout colonne domain et verified à legal_abrogations
-- Date : 2026-02-13
-- Description : Ajouter champ domaine juridique et statut verified pour Phase 3.1

-- Ajouter colonne domain
ALTER TABLE legal_abrogations
ADD COLUMN IF NOT EXISTS domain TEXT;

-- Ajouter colonne verified (boolean)
ALTER TABLE legal_abrogations
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;

-- Ajouter colonne confidence
ALTER TABLE legal_abrogations
ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')) DEFAULT 'high';

-- Index pour filtrage par domaine
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_domain
  ON legal_abrogations(domain)
  WHERE domain IS NOT NULL;

-- Index pour filtrage verified
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_verified
  ON legal_abrogations(verified)
  WHERE verified = true;

-- Commentaires
COMMENT ON COLUMN legal_abrogations.domain IS
  'Domaine juridique : travail, penal, fiscal, administratif, constitutionnel, autre';

COMMENT ON COLUMN legal_abrogations.verified IS
  'Abrogation vérifiée via JORT ou source officielle';

COMMENT ON COLUMN legal_abrogations.confidence IS
  'Niveau de confiance dans l''abrogation : high, medium, low';
