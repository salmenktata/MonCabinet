-- Migration: Ajout de la hiérarchie des normes juridiques tunisiennes
-- Date: 2026-02-23
-- Description: Crée l'ENUM norm_level (7 niveaux), ajoute la colonne sur knowledge_base,
--              auto-populate depuis subcategory/category, et sync vers metadata JSONB + chunks

-- 1. Créer le type ENUM (idempotent)
DO $$ BEGIN
  CREATE TYPE norm_level AS ENUM (
    'constitution',
    'traite_international',
    'loi_organique',
    'loi_ordinaire',
    'decret_presidentiel',
    'arrete_ministeriel',
    'acte_local'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajouter la colonne (idempotent)
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS norm_level norm_level;

-- 3. Index pour les filtres UI et requêtes RAG
CREATE INDEX IF NOT EXISTS idx_kb_norm_level
  ON knowledge_base (norm_level)
  WHERE norm_level IS NOT NULL;

-- 4. Auto-populate depuis subcategory/category existants
UPDATE knowledge_base SET norm_level = CASE
  -- Niveau 1 : Constitution
  WHEN subcategory = 'constitution' OR category = 'constitution'
    THEN 'constitution'

  -- Niveau 2 : Traités internationaux
  WHEN category = 'conventions'
    THEN 'traite_international'

  -- Niveau 3 : Lois organiques
  WHEN subcategory = 'loi_organique'
    THEN 'loi_organique'

  -- Niveau 4 : Lois ordinaires / Codes
  WHEN subcategory IN (
    'coc', 'code_penal', 'code_commerce', 'code_travail',
    'csp', 'code_fiscal', 'code_article'
  )
    THEN 'loi_ordinaire'
  WHEN category IN ('legislation', 'codes', 'jort')
    THEN 'loi_ordinaire'

  -- Niveau 5 : Décrets présidentiels
  WHEN subcategory IN ('decret_loi', 'decret')
    THEN 'decret_presidentiel'

  -- Niveau 6 : Arrêtés ministériels / circulaires
  WHEN subcategory IN ('arrete', 'circulaire')
    THEN 'arrete_ministeriel'

  ELSE NULL  -- JURIS, DOCTRINE, PROC, TEMPLATES → hors pyramide normative
END::norm_level
WHERE doc_type = 'TEXTES'
  OR category IN ('legislation', 'codes', 'constitution', 'conventions', 'jort');

-- 5. Sync vers metadata JSONB sur knowledge_base (pour accès RAG via metadata.norm_level)
UPDATE knowledge_base
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('norm_level', norm_level::text)
WHERE norm_level IS NOT NULL;

-- 6. Sync vers les chunks (knowledge_base_chunks.metadata hérite du doc parent)
UPDATE knowledge_base_chunks kbc
SET metadata = COALESCE(kbc.metadata, '{}'::jsonb) || jsonb_build_object('norm_level', kb.norm_level::text)
FROM knowledge_base kb
WHERE kbc.knowledge_base_id = kb.id
  AND kb.norm_level IS NOT NULL;

-- Vérification finale
SELECT norm_level, COUNT(*) as count
FROM knowledge_base
GROUP BY norm_level
ORDER BY norm_level NULLS LAST;
