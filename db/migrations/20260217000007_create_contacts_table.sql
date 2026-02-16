/**
 * Migration: Création table contacts
 * Date: 2026-02-17
 * Phase: 4.3 - TODOs Critiques - Modals Consultation
 *
 * Permet d'enregistrer experts, témoins, notaires, huissiers
 * mentionnés dans les consultations juridiques
 */

-- Créer table contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Informations personnelles
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255),

  -- Type de contact
  type VARCHAR(50) NOT NULL CHECK (type IN ('expert', 'temoin', 'notaire', 'huissier', 'autre')),

  -- Coordonnées
  email VARCHAR(255),
  telephone VARCHAR(50),

  -- Informations professionnelles
  specialite VARCHAR(255),

  -- Notes
  notes TEXT,

  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index sur user_id pour performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);

-- Index sur type pour filtrage
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);

-- Trigger de mise à jour automatique updated_at
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_contacts_updated_at();

-- Commentaires
COMMENT ON TABLE contacts IS 'Contacts professionnels (experts, témoins, etc.) liés aux dossiers';
COMMENT ON COLUMN contacts.type IS 'Type de contact: expert, temoin, notaire, huissier, autre';
COMMENT ON COLUMN contacts.specialite IS 'Spécialité professionnelle (ex: expert comptable, médecin légiste)';
