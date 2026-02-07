-- Migration : Ajouter support personnes physiques et morales
-- Date : 2025-02-04
-- Description : Ajoute la colonne type et les champs pour personnes morales

-- Ajouter l'enum type_client
DO $$ BEGIN
  CREATE TYPE client_type AS ENUM ('PERSONNE_PHYSIQUE', 'PERSONNE_MORALE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ajouter la colonne type (par défaut PERSONNE_PHYSIQUE pour les clients existants)
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS type client_type DEFAULT 'PERSONNE_PHYSIQUE' NOT NULL;

-- Ajouter les colonnes pour personnes morales
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS denomination TEXT,
ADD COLUMN IF NOT EXISTS registre_commerce TEXT;

-- Rendre certaines colonnes optionnelles (nullable)
ALTER TABLE public.clients
ALTER COLUMN nom DROP NOT NULL;

-- Contrainte : si type = PERSONNE_PHYSIQUE, nom requis
-- Si type = PERSONNE_MORALE, denomination requis
ALTER TABLE public.clients
DROP CONSTRAINT IF EXISTS clients_type_fields_check;

ALTER TABLE public.clients
ADD CONSTRAINT clients_type_fields_check CHECK (
  (type = 'PERSONNE_PHYSIQUE' AND nom IS NOT NULL) OR
  (type = 'PERSONNE_MORALE' AND denomination IS NOT NULL)
);

-- Index pour recherche
CREATE INDEX IF NOT EXISTS idx_clients_type ON public.clients(type);
CREATE INDEX IF NOT EXISTS idx_clients_denomination ON public.clients(denomination);
CREATE INDEX IF NOT EXISTS idx_clients_registre_commerce ON public.clients(registre_commerce);
