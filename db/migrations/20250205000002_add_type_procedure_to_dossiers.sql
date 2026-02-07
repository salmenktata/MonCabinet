-- Migration : Ajouter type_procedure aux dossiers pour supporter différents workflows
-- Date : 2025-02-05

-- Ajouter la colonne type_procedure
ALTER TABLE public.dossiers
ADD COLUMN IF NOT EXISTS type_procedure TEXT DEFAULT 'civil_premiere_instance' CHECK (
  type_procedure IN (
    'civil_premiere_instance',
    'divorce',
    'commercial',
    'refere',
    'autre'
  )
);

-- Index pour la recherche par type de procédure
CREATE INDEX IF NOT EXISTS idx_dossiers_type_procedure ON public.dossiers(type_procedure);

-- Commentaire
COMMENT ON COLUMN public.dossiers.type_procedure IS 'Type de procédure juridique (détermine le workflow applicable)';

-- Mettre à jour les dossiers existants pour utiliser le workflow civil par défaut
UPDATE public.dossiers
SET type_procedure = 'civil_premiere_instance'
WHERE type_procedure IS NULL;
