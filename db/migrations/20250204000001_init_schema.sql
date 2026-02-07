-- Migration initiale : Schéma de base de données pour Avocat SaaS
-- Date : 2025-02-04
-- Description : Tables principales pour le MVP (Extreme MVP)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: profiles (Extension de auth.users)
-- ============================================================================
-- Stocke les informations additionnelles des utilisateurs (avocats)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT,
  email TEXT UNIQUE NOT NULL,
  telephone TEXT,
  matricule_avocat TEXT, -- Numéro d'inscription au barreau
  barreau TEXT, -- Ex: "Tunis", "Sfax"
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: clients
-- ============================================================================
CREATE TABLE public.clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Informations personnelles
  nom TEXT NOT NULL,
  prenom TEXT,
  cin TEXT, -- Carte d'Identité Nationale (8 chiffres)
  date_naissance DATE,
  sexe TEXT CHECK (sexe IN ('M', 'F', 'Autre')),

  -- Contact
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,

  -- Informations complémentaires
  profession TEXT,
  notes TEXT, -- Notes privées de l'avocat

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_clients_nom ON public.clients(nom);
CREATE INDEX idx_clients_cin ON public.clients(cin);

-- Trigger updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: dossiers
-- ============================================================================
CREATE TABLE public.dossiers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,

  -- Informations du dossier
  numero_dossier TEXT UNIQUE NOT NULL,
  type_procedure TEXT NOT NULL DEFAULT 'civil', -- MVP: uniquement 'civil'
  objet TEXT NOT NULL, -- Brève description du litige

  -- Procédure
  tribunal TEXT NOT NULL,
  numero_rg TEXT, -- Numéro de Rôle Général (attribué par le tribunal)
  partie_adverse TEXT, -- Nom de la partie adverse

  -- Statut et dates
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'cloture', 'archive')),
  date_ouverture DATE NOT NULL DEFAULT CURRENT_DATE,
  date_cloture DATE,

  -- Montants (optionnel pour MVP)
  montant_demande DECIMAL(12, 2),
  montant_obtenu DECIMAL(12, 2),

  -- Notes privées
  notes TEXT,

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_dossiers_user_id ON public.dossiers(user_id);
CREATE INDEX idx_dossiers_client_id ON public.dossiers(client_id);
CREATE INDEX idx_dossiers_statut ON public.dossiers(statut);
CREATE INDEX idx_dossiers_numero ON public.dossiers(numero_dossier);
CREATE INDEX idx_dossiers_date_ouverture ON public.dossiers(date_ouverture);

-- Trigger updated_at
CREATE TRIGGER update_dossiers_updated_at
  BEFORE UPDATE ON public.dossiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: actions (Tâches et actions à effectuer)
-- ============================================================================
CREATE TABLE public.actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE NOT NULL,

  -- Contenu de l'action
  titre TEXT NOT NULL,
  description TEXT,

  -- Statut
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'terminee', 'annulee')),
  priorite TEXT DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),

  -- Dates
  date_echeance DATE,
  date_rappel DATE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_actions_dossier_id ON public.actions(dossier_id);
CREATE INDEX idx_actions_statut ON public.actions(statut);
CREATE INDEX idx_actions_date_echeance ON public.actions(date_echeance);
CREATE INDEX idx_actions_priorite ON public.actions(priorite);

-- Trigger updated_at
CREATE TRIGGER update_actions_updated_at
  BEFORE UPDATE ON public.actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: echeances (Dates importantes et délais légaux)
-- ============================================================================
CREATE TABLE public.echeances (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE NOT NULL,

  -- Type d'échéance
  type_echeance TEXT NOT NULL CHECK (type_echeance IN ('audience', 'delai_legal', 'delai_interne', 'autre')),

  -- Contenu
  titre TEXT NOT NULL,
  description TEXT,
  date_echeance DATE NOT NULL,

  -- Pour les délais légaux
  delai_type TEXT, -- Ex: 'appel_civil', 'opposition'
  date_point_depart DATE, -- Date à partir de laquelle le délai court
  nombre_jours INTEGER, -- Nombre de jours du délai

  -- Rappels
  rappel_j15 BOOLEAN DEFAULT FALSE,
  rappel_j7 BOOLEAN DEFAULT TRUE,
  rappel_j3 BOOLEAN DEFAULT TRUE,
  rappel_j1 BOOLEAN DEFAULT TRUE,

  -- Statut
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif', 'respecte', 'depasse')),

  -- Notes
  notes TEXT,

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_echeances_dossier_id ON public.echeances(dossier_id);
CREATE INDEX idx_echeances_date ON public.echeances(date_echeance);
CREATE INDEX idx_echeances_type ON public.echeances(type_echeance);
CREATE INDEX idx_echeances_statut ON public.echeances(statut);

-- Trigger updated_at
CREATE TRIGGER update_echeances_updated_at
  BEFORE UPDATE ON public.echeances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: documents
-- ============================================================================
CREATE TABLE public.documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Informations du fichier
  nom_fichier TEXT NOT NULL,
  type_fichier TEXT, -- MIME type (application/pdf, image/jpeg, etc.)
  taille_fichier INTEGER, -- En bytes
  storage_path TEXT NOT NULL, -- Chemin dans Supabase Storage

  -- Catégorie (optionnel pour MVP)
  categorie TEXT, -- Ex: 'assignation', 'conclusions', 'piece', 'jugement'

  -- Description
  description TEXT,

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_documents_dossier_id ON public.documents(dossier_id);
CREATE INDEX idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX idx_documents_created_at ON public.documents(created_at);

-- Trigger updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: factures
-- ============================================================================
CREATE TABLE public.factures (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,

  -- Numérotation
  numero_facture TEXT UNIQUE NOT NULL,
  annee INTEGER NOT NULL,
  sequence INTEGER NOT NULL, -- Séquence dans l'année

  -- Montants
  montant_ht DECIMAL(10, 2) NOT NULL,
  taux_tva DECIMAL(5, 2) DEFAULT 19.00, -- TVA en Tunisie = 19%
  montant_tva DECIMAL(10, 2),
  montant_ttc DECIMAL(10, 2) NOT NULL,

  -- Dates
  date_emission DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance DATE,
  date_paiement DATE,

  -- Statut
  statut TEXT NOT NULL DEFAULT 'impayee' CHECK (statut IN ('impayee', 'payee', 'annulee', 'en_retard')),

  -- Détails
  objet TEXT, -- Description des prestations
  notes TEXT, -- Notes privées

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_factures_user_id ON public.factures(user_id);
CREATE INDEX idx_factures_client_id ON public.factures(client_id);
CREATE INDEX idx_factures_dossier_id ON public.factures(dossier_id);
CREATE INDEX idx_factures_numero ON public.factures(numero_facture);
CREATE INDEX idx_factures_statut ON public.factures(statut);
CREATE INDEX idx_factures_date_emission ON public.factures(date_emission);

-- Trigger updated_at
CREATE TRIGGER update_factures_updated_at
  BEFORE UPDATE ON public.factures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour calculer montant TTC automatiquement
CREATE OR REPLACE FUNCTION calculate_facture_montants()
RETURNS TRIGGER AS $$
BEGIN
  NEW.montant_tva := ROUND(NEW.montant_ht * NEW.taux_tva / 100, 2);
  NEW.montant_ttc := NEW.montant_ht + NEW.montant_tva;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_facture_montants_trigger
  BEFORE INSERT OR UPDATE ON public.factures
  FOR EACH ROW
  EXECUTE FUNCTION calculate_facture_montants();

-- ============================================================================
-- STORAGE BUCKETS (Supabase Storage)
-- ============================================================================
-- Bucket pour les documents des dossiers
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Activer RLS sur toutes les tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies pour profiles
-- ============================================================================
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- Policies pour clients
-- ============================================================================
CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON public.clients FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Policies pour dossiers
-- ============================================================================
CREATE POLICY "Users can view their own dossiers"
  ON public.dossiers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dossiers"
  ON public.dossiers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dossiers"
  ON public.dossiers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dossiers"
  ON public.dossiers FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Policies pour actions
-- ============================================================================
CREATE POLICY "Users can view actions of their dossiers"
  ON public.actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = actions.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert actions in their dossiers"
  ON public.actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update actions in their dossiers"
  ON public.actions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = actions.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete actions in their dossiers"
  ON public.actions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = actions.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Policies pour echeances
-- ============================================================================
CREATE POLICY "Users can view echeances of their dossiers"
  ON public.echeances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = echeances.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert echeances in their dossiers"
  ON public.echeances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update echeances in their dossiers"
  ON public.echeances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = echeances.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete echeances in their dossiers"
  ON public.echeances FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = echeances.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Policies pour documents
-- ============================================================================
CREATE POLICY "Users can view documents of their dossiers"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = documents.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents in their dossiers"
  ON public.documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents in their dossiers"
  ON public.documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = documents.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents in their dossiers"
  ON public.documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.dossiers
      WHERE dossiers.id = documents.dossier_id
      AND dossiers.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Policies pour factures
-- ============================================================================
CREATE POLICY "Users can view their own factures"
  ON public.factures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own factures"
  ON public.factures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own factures"
  ON public.factures FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own factures"
  ON public.factures FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Storage Policies pour documents bucket
-- ============================================================================
CREATE POLICY "Users can upload documents to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Fonction pour créer automatiquement un profile lors de l'inscription
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nom, prenom)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    COALESCE(NEW.raw_user_meta_data->>'prenom', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour créer le profile automatiquement
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- VUE: Statistiques dashboard
-- ============================================================================
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
  d.user_id,
  COUNT(DISTINCT d.id) FILTER (WHERE d.statut = 'actif') AS dossiers_actifs,
  COUNT(DISTINCT c.id) AS total_clients,
  COUNT(DISTINCT a.id) FILTER (WHERE a.statut != 'terminee' AND a.date_echeance <= CURRENT_DATE + INTERVAL '7 days') AS actions_urgentes,
  COUNT(DISTINCT e.id) FILTER (WHERE e.statut = 'actif' AND e.date_echeance <= CURRENT_DATE + INTERVAL '7 days') AS echeances_prochaines,
  COUNT(DISTINCT f.id) FILTER (WHERE f.statut = 'impayee') AS factures_impayees,
  COALESCE(SUM(f.montant_ttc) FILTER (WHERE f.statut = 'impayee'), 0) AS montant_impaye
FROM
  public.dossiers d
  LEFT JOIN public.clients c ON c.user_id = d.user_id
  LEFT JOIN public.actions a ON a.dossier_id = d.id
  LEFT JOIN public.echeances e ON e.dossier_id = d.id
  LEFT JOIN public.factures f ON f.user_id = d.user_id
GROUP BY
  d.user_id;

-- ============================================================================
-- Fin de la migration initiale
-- ============================================================================
