-- Migration: Ajouter informations cabinet pour factures conformes ONAT
-- Date: 2026-02-05

-- Étendre la table profiles avec informations cabinet
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS cabinet_nom TEXT,
ADD COLUMN IF NOT EXISTS cabinet_adresse TEXT,
ADD COLUMN IF NOT EXISTS cabinet_ville TEXT,
ADD COLUMN IF NOT EXISTS cabinet_code_postal TEXT,
ADD COLUMN IF NOT EXISTS rne TEXT; -- Numéro RNE (Registre National des Entreprises)

-- Commentaires pour documentation
COMMENT ON COLUMN public.profiles.logo_url IS 'URL du logo du cabinet (Supabase Storage)';
COMMENT ON COLUMN public.profiles.cabinet_nom IS 'Nom officiel du cabinet d''avocat';
COMMENT ON COLUMN public.profiles.cabinet_adresse IS 'Adresse complète du cabinet';
COMMENT ON COLUMN public.profiles.cabinet_ville IS 'Ville du cabinet';
COMMENT ON COLUMN public.profiles.cabinet_code_postal IS 'Code postal du cabinet';
COMMENT ON COLUMN public.profiles.rne IS 'Numéro RNE (Registre National des Entreprises) - optionnel';

-- Créer le bucket Supabase Storage pour les logos si nécessaire
-- Note: Cette commande doit être exécutée manuellement dans le dashboard Supabase
-- ou via l'API Storage, car CREATE ne fonctionne pas pour les buckets depuis SQL

-- Bucket: cabinet-logos
-- Public: true (les logos doivent être accessibles publiquement)
-- Allowed MIME types: image/png, image/jpeg, image/jpg, image/svg+xml
-- Max file size: 2MB

-- Politique RLS pour le bucket cabinet-logos (à configurer manuellement) :
-- INSERT : auth.uid() = user_id
-- SELECT : public (accessible à tous)
-- UPDATE : auth.uid() = user_id
-- DELETE : auth.uid() = user_id
