-- Migration: Ajouter norm_level à legal_documents
-- Objectif: Permettre la navigation hiérarchique (pyramide de Kelsen) sur la page LD
-- La colonne norm_level est copiée depuis knowledge_base lors de l'indexation

-- Étape 1: Ajouter la colonne (le type ENUM norm_level existe déjà via 20260223000001)
ALTER TABLE legal_documents
  ADD COLUMN IF NOT EXISTS norm_level norm_level;

-- Étape 2: Populer depuis knowledge_base pour les docs déjà indexés
UPDATE legal_documents ld
SET norm_level = kb.norm_level
FROM knowledge_base kb
WHERE ld.knowledge_base_id = kb.id
  AND kb.norm_level IS NOT NULL
  AND ld.norm_level IS NULL;

-- Étape 3: Index pour filtrage rapide
CREATE INDEX IF NOT EXISTS idx_ld_norm_level
  ON legal_documents (norm_level);
