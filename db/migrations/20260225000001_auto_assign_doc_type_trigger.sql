-- Migration: Auto-assign doc_type via trigger PostgreSQL
-- Problème: les INSERT dans knowledge_base ne populent pas doc_type
--           → 4870 docs NULL en prod (Feb 25, 2026)
-- Solution: trigger BEFORE INSERT OR UPDATE qui mappe category → doc_type

-- 1. Fonction de mapping category → doc_type (miroir de lib/categories/doc-types.ts)
CREATE OR REPLACE FUNCTION fn_assign_doc_type_from_category()
RETURNS TRIGGER AS $$
BEGIN
  -- Ne rien faire si doc_type est déjà défini
  IF NEW.doc_type IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.doc_type := CASE NEW.category
    -- TEXTES (normes légales)
    WHEN 'legislation'    THEN 'TEXTES'::document_type
    WHEN 'codes'          THEN 'TEXTES'::document_type
    WHEN 'constitution'   THEN 'TEXTES'::document_type
    WHEN 'conventions'    THEN 'TEXTES'::document_type
    WHEN 'jort'           THEN 'TEXTES'::document_type
    -- JURIS (jurisprudence)
    WHEN 'jurisprudence'  THEN 'JURIS'::document_type
    -- PROC (procédures)
    WHEN 'procedures'     THEN 'PROC'::document_type
    WHEN 'formulaires'    THEN 'PROC'::document_type
    -- TEMPLATES (modèles)
    WHEN 'modeles'        THEN 'TEMPLATES'::document_type
    WHEN 'google_drive'   THEN 'TEMPLATES'::document_type
    -- DOCTRINE (catch-all)
    WHEN 'doctrine'       THEN 'DOCTRINE'::document_type
    WHEN 'guides'         THEN 'DOCTRINE'::document_type
    WHEN 'lexique'        THEN 'DOCTRINE'::document_type
    WHEN 'actualites'     THEN 'DOCTRINE'::document_type
    WHEN 'autre'          THEN 'DOCTRINE'::document_type
    -- Fallback pour toute catégorie inconnue
    ELSE 'DOCTRINE'::document_type
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger BEFORE INSERT OR UPDATE (ne se déclenche que si doc_type IS NULL)
DROP TRIGGER IF EXISTS trg_auto_assign_doc_type ON knowledge_base;
CREATE TRIGGER trg_auto_assign_doc_type
  BEFORE INSERT OR UPDATE OF category ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION fn_assign_doc_type_from_category();

-- 3. Backfill: corriger les 4870 docs existants avec doc_type NULL
UPDATE knowledge_base
SET doc_type = CASE category
  WHEN 'legislation'    THEN 'TEXTES'::document_type
  WHEN 'codes'          THEN 'TEXTES'::document_type
  WHEN 'constitution'   THEN 'TEXTES'::document_type
  WHEN 'conventions'    THEN 'TEXTES'::document_type
  WHEN 'jort'           THEN 'TEXTES'::document_type
  WHEN 'jurisprudence'  THEN 'JURIS'::document_type
  WHEN 'procedures'     THEN 'PROC'::document_type
  WHEN 'formulaires'    THEN 'PROC'::document_type
  WHEN 'modeles'        THEN 'TEMPLATES'::document_type
  WHEN 'google_drive'   THEN 'TEMPLATES'::document_type
  WHEN 'doctrine'       THEN 'DOCTRINE'::document_type
  WHEN 'guides'         THEN 'DOCTRINE'::document_type
  WHEN 'lexique'        THEN 'DOCTRINE'::document_type
  WHEN 'actualites'     THEN 'DOCTRINE'::document_type
  WHEN 'autre'          THEN 'DOCTRINE'::document_type
  ELSE                       'DOCTRINE'::document_type
END
WHERE doc_type IS NULL;

-- Vérification post-migration
DO $$
DECLARE
  v_null_count  INTEGER;
  v_fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM knowledge_base WHERE doc_type IS NULL;
  SELECT COUNT(*) INTO v_fixed_count FROM knowledge_base WHERE doc_type IS NOT NULL;
  RAISE NOTICE 'Migration doc_type terminée: % docs corrigés, % NULL restants', v_fixed_count, v_null_count;
  IF v_null_count > 0 THEN
    RAISE WARNING '% docs ont encore doc_type NULL (category inconnue ou NULL)', v_null_count;
  END IF;
END $$;
