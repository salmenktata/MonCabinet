/**
 * Migration: Multi-catégories pour les sources web
 * Date: 2026-03-02
 * Description: Passer de category TEXT (scalaire) vers categories TEXT[] (tableau)
 *              Une source web peut désormais appartenir à plusieurs catégories.
 */

-- ============================================================================
-- ÉTAPE 1 : Ajouter la nouvelle colonne categories TEXT[]
-- ============================================================================

ALTER TABLE web_sources ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- ÉTAPE 2 : Migrer les données existantes (category → categories)
-- ============================================================================

UPDATE web_sources SET categories = ARRAY[category] WHERE categories = '{}';

-- ============================================================================
-- ÉTAPE 3 : Supprimer l'ancienne colonne category
-- ============================================================================

ALTER TABLE web_sources DROP COLUMN IF EXISTS category;

-- ============================================================================
-- ÉTAPE 4 : Contrainte CHECK sur le tableau
-- ============================================================================

ALTER TABLE web_sources ADD CONSTRAINT web_sources_categories_check
  CHECK (
    array_length(categories, 1) > 0
    AND categories <@ ARRAY[
      'legislation','jurisprudence','doctrine','jort','modeles',
      'procedures','formulaires','codes','constitution','conventions',
      'guides','lexique','actualites','google_drive','autre'
    ]::text[]
  );

-- ============================================================================
-- ÉTAPE 5 : Remplacer l'index simple par un index GIN pour tableau
-- ============================================================================

DROP INDEX IF EXISTS idx_web_sources_category;
CREATE INDEX IF NOT EXISTS idx_web_sources_categories ON web_sources USING GIN(categories);
