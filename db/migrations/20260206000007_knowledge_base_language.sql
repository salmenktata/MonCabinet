-- Migration: Ajout du champ langue pour la base de connaissances
-- Date: 2026-02-06

-- Ajouter la colonne language à knowledge_base
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'ar'
CHECK (language IN ('ar', 'fr'));

-- Commenter la colonne
COMMENT ON COLUMN knowledge_base.language IS 'Langue du document: ar (arabe) ou fr (français)';

-- Index pour filtrer par langue
CREATE INDEX IF NOT EXISTS idx_knowledge_base_language ON knowledge_base(language);

-- Message de succès
DO $$
BEGIN
  RAISE NOTICE '✅ Colonne language ajoutée à knowledge_base';
END $$;
