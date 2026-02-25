-- Migration : Ajouter les 4 nouveaux types de procédure
-- Date : 2026-02-25
-- Contexte : Ajout des workflows Pénal, Administratif, Faillite, Exécution forcée

-- PostgreSQL n'autorise pas ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT
-- directement sur les CHECK constraints inline. On utilise la syntaxe standard.

-- 1. Supprimer l'ancienne contrainte CHECK
ALTER TABLE public.dossiers
  DROP CONSTRAINT IF EXISTS dossiers_type_procedure_check;

-- 2. Recréer la contrainte avec les nouveaux types inclus
ALTER TABLE public.dossiers
  ADD CONSTRAINT dossiers_type_procedure_check CHECK (
    type_procedure IN (
      'civil_premiere_instance',
      'divorce',
      'commercial',
      'refere',
      'penal',
      'administratif',
      'faillite',
      'execution_forcee',
      'autre'
    )
  );

-- Commentaire mis à jour
COMMENT ON COLUMN public.dossiers.type_procedure IS 'Type de procédure juridique (détermine le workflow applicable) — v2 : penal, administratif, faillite, execution_forcee ajoutés le 2026-02-25';
