-- Migration: Fix contrainte relation_type dans kb_legal_relations
-- Date: 2026-02-17
-- Description: La migration 20260216_enrich_legal_relations.sql créait l'enum legal_relation_type
--              mais ne mettait pas à jour la contrainte CHECK existante sur la colonne text.
--              Ce fix ajoute les nouveaux types (similar_to, complements, etc.) à la contrainte.

-- =============================================================================
-- 1. MISE À JOUR CONTRAINTE RELATION_TYPE
-- =============================================================================

DO $$ BEGIN
  -- Supprimer l'ancienne contrainte si elle existe
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'kb_legal_relations'::regclass
    AND conname = 'kb_legal_relations_relation_type_check'
  ) THEN
    ALTER TABLE kb_legal_relations
    DROP CONSTRAINT kb_legal_relations_relation_type_check;

    RAISE NOTICE 'Ancienne contrainte relation_type_check supprimée';
  END IF;
END $$;

-- Ajouter nouvelle contrainte avec tous les types (anciens + Phase 4)
ALTER TABLE kb_legal_relations
ADD CONSTRAINT kb_legal_relations_relation_type_check
CHECK (relation_type = ANY (ARRAY[
  -- Types originaux
  'cites'::text,
  'cited_by'::text,
  'supersedes'::text,
  'superseded_by'::text,
  'implements'::text,
  'interpreted_by'::text,
  'commented_by'::text,
  'related_case'::text,
  'same_topic'::text,
  -- Phase 4: Nouveaux types
  'similar_to'::text,
  'complements'::text,
  'contradicts'::text,
  'amends'::text,
  'abrogates'::text,
  'doctrine_cites'::text,
  'jurisprudence_applies'::text
]));

RAISE NOTICE 'Nouvelle contrainte relation_type_check créée avec 17 types';

-- =============================================================================
-- 2. RÉSUMÉ
-- =============================================================================

DO $$
DECLARE
  v_count INTEGER;
  v_similar_to INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM kb_legal_relations;
  SELECT COUNT(*) INTO v_similar_to FROM kb_legal_relations WHERE relation_type = 'similar_to';

  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Fix contrainte kb_legal_relations - Résumé';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Total relations: %', v_count;
  RAISE NOTICE 'Relations similar_to: %', v_similar_to;
  RAISE NOTICE 'Contrainte mise à jour avec 17 types de relations';
  RAISE NOTICE '=================================================================';
END $$;
