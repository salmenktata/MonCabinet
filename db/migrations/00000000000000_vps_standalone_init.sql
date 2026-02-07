/**
 * Migration VPS Standalone - Schéma complet PostgreSQL
 * Remplace toutes les migrations Supabase par un schéma standalone
 *
 * À exécuter sur PostgreSQL 15 (VPS)
 */

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Pour recherche full-text

-- ============================================================================
-- TABLES PRINCIPALES
-- ============================================================================

-- Table profiles (informations cabinet avocat)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nom_cabinet VARCHAR(255),
  adresse TEXT,
  telephone VARCHAR(50),
  email VARCHAR(255),
  site_web VARCHAR(255),
  numero_onat VARCHAR(50),
  rib VARCHAR(50),
  logo_url TEXT,
  notification_preferences JSONB DEFAULT '{"email_enabled": true, "frequency": "daily"}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255),
  type_client VARCHAR(50) DEFAULT 'personne_physique' CHECK (type_client IN ('personne_physique', 'personne_morale')),
  cin VARCHAR(50),
  adresse TEXT,
  telephone VARCHAR(50),
  email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table dossiers
CREATE TABLE IF NOT EXISTS dossiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  numero VARCHAR(100) UNIQUE NOT NULL,
  objet TEXT NOT NULL,
  type_procedure VARCHAR(100),
  statut VARCHAR(50) DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'clos', 'archive')),
  tribunal VARCHAR(255),
  adverse_partie TEXT,
  date_ouverture DATE DEFAULT CURRENT_DATE,
  date_cloture DATE,
  notes TEXT,
  workflow_statut VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  chemin_fichier TEXT NOT NULL,
  taille_fichier BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table actions
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  type_action VARCHAR(100),
  statut VARCHAR(50) DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'termine')),
  date_action DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table echeances
CREATE TABLE IF NOT EXISTS echeances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE CASCADE,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  date_echeance DATE NOT NULL,
  type VARCHAR(100),
  rappel_jours INT DEFAULT 7,
  terminee BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table factures
CREATE TABLE IF NOT EXISTS factures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  numero VARCHAR(100) UNIQUE NOT NULL,
  date_emission DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  montant_ht DECIMAL(15,2) NOT NULL,
  montant_tva DECIMAL(15,2) DEFAULT 0,
  montant_ttc DECIMAL(15,2) NOT NULL,
  statut VARCHAR(50) DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoyee', 'payee', 'annulee')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table time_entries (suivi temps)
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  duree_minutes INT NOT NULL,
  taux_horaire DECIMAL(10,2),
  montant DECIMAL(10,2),
  facturable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  type_document VARCHAR(100),
  contenu TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  destinataire VARCHAR(255) NOT NULL,
  sujet VARCHAR(255),
  contenu TEXT,
  statut VARCHAR(50) DEFAULT 'envoye',
  date_envoi TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table cloud_providers_config
CREATE TABLE IF NOT EXISTS cloud_providers_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),
  enabled BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  folder_id VARCHAR(255),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Table messaging_webhooks_config
CREATE TABLE IF NOT EXISTS messaging_webhooks_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  enabled BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,
  phone_number VARCHAR(50),
  api_token TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Table pending_documents (documents non classés)
CREATE TABLE IF NOT EXISTS pending_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom_fichier VARCHAR(255) NOT NULL,
  chemin_fichier TEXT NOT NULL,
  source VARCHAR(50),
  statut VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table sync_logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  statut VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table flouci_transactions (paiement en ligne)
CREATE TABLE IF NOT EXISTS flouci_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id UUID REFERENCES factures(id) ON DELETE CASCADE,
  payment_id VARCHAR(255) UNIQUE,
  montant DECIMAL(15,2) NOT NULL,
  statut VARCHAR(50) DEFAULT 'pending',
  webhook_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEX POUR PERFORMANCES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_user_id ON dossiers(user_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_client_id ON dossiers(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_dossier_id ON documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_actions_user_id ON actions(user_id);
CREATE INDEX IF NOT EXISTS idx_actions_dossier_id ON actions(dossier_id);
CREATE INDEX IF NOT EXISTS idx_echeances_user_id ON echeances(user_id);
CREATE INDEX IF NOT EXISTS idx_echeances_date ON echeances(date_echeance);
CREATE INDEX IF NOT EXISTS idx_factures_user_id ON factures(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);

-- Index full-text search
CREATE INDEX IF NOT EXISTS idx_clients_fulltext ON clients USING gin(to_tsvector('french', COALESCE(nom, '') || ' ' || COALESCE(prenom, '')));
CREATE INDEX IF NOT EXISTS idx_dossiers_fulltext ON dossiers USING gin(to_tsvector('french', COALESCE(numero, '') || ' ' || COALESCE(objet, '')));
CREATE INDEX IF NOT EXISTS idx_factures_fulltext ON factures USING gin(to_tsvector('french', COALESCE(numero, '')));

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dossiers_updated_at BEFORE UPDATE ON dossiers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_echeances_updated_at BEFORE UPDATE ON echeances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_factures_updated_at BEFORE UPDATE ON factures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DONNÉES DE DÉMONSTRATION (optionnel)
-- ============================================================================

-- Fonction pour obtenir le premier utilisateur (pour init)
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  SELECT id INTO first_user_id FROM users LIMIT 1;

  IF first_user_id IS NOT NULL THEN
    -- Créer profil pour le premier utilisateur
    INSERT INTO profiles (user_id, nom_cabinet, notification_preferences)
    VALUES (first_user_id, 'Cabinet Juridique', '{"email_enabled": true, "frequency": "daily"}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- Message de succès
DO $$
BEGIN
  RAISE NOTICE '✅ Schéma VPS standalone créé avec succès!';
  RAISE NOTICE '📊 Tables créées: users, profiles, clients, dossiers, documents, actions, echeances, factures, templates, etc.';
  RAISE NOTICE '🔐 Prêt pour NextAuth + PostgreSQL standalone';
END $$;
