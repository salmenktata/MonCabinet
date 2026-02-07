-- Migration : Ajouter colonnes workflow et autres champs manquants
-- Date : 2025-02-04
-- Description : Ajoute workflow_etape_actuelle, avocat_adverse, description, montant_litige

-- Ajouter les colonnes manquantes
ALTER TABLE public.dossiers
ADD COLUMN IF NOT EXISTS workflow_etape_actuelle TEXT DEFAULT 'ASSIGNATION',
ADD COLUMN IF NOT EXISTS avocat_adverse TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS montant_litige NUMERIC(10, 3);

-- Index pour la recherche par étape de workflow
CREATE INDEX IF NOT EXISTS idx_dossiers_workflow_etape ON public.dossiers(workflow_etape_actuelle);

-- Commentaires
COMMENT ON COLUMN public.dossiers.workflow_etape_actuelle IS 'Étape actuelle du workflow (ASSIGNATION, MISE_EN_ETAT, etc.)';
COMMENT ON COLUMN public.dossiers.avocat_adverse IS 'Nom de l''avocat de la partie adverse';
COMMENT ON COLUMN public.dossiers.description IS 'Description détaillée du dossier';
COMMENT ON COLUMN public.dossiers.montant_litige IS 'Montant du litige en TND';
