-- Migration : Synchronise knowledge_base.branch → knowledge_base_chunks.metadata.branch
-- Cause racine : metadata.branch était NULL pour la majorité des chunks web (doctrine 9anoun.tn,
-- cassation.tn, JORT), empêchant la pénalité de branche 0.4× dans rerankSources() de s'activer.
-- Sans cette migration, des documents hors-domaine (ex: droit civil pour une requête pénale)
-- n'étaient jamais pénalisés car la condition `if (branch && ...)` évaluait toujours à FALSE.
--
-- Impact : résout le problème systématique pour TOUS les domaines (pénal, travail, famille, etc.)
-- Aucun changement de code requis — la logique existante fonctionne dès que metadata.branch est renseigné.
--
-- Appliquer : psql -h 127.0.0.1 -p 5434 -U moncabinet -d qadhya -f 20260228_sync_branch_to_chunks.sql

BEGIN;

-- Vérification avant migration
DO $$
DECLARE
  v_before_count INTEGER;
  v_kb_with_branch INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before_count
  FROM knowledge_base_chunks
  WHERE metadata->>'branch' IS NOT NULL AND metadata->>'branch' != '';

  SELECT COUNT(DISTINCT kb.id) INTO v_kb_with_branch
  FROM knowledge_base kb
  WHERE kb.branch IS NOT NULL AND kb.branch::text != 'autre';

  RAISE NOTICE 'Avant migration : % chunks ont déjà metadata.branch', v_before_count;
  RAISE NOTICE 'KBs avec branch connu (non-autre) : %', v_kb_with_branch;
END $$;

-- Migration principale : copie kb.branch → kbc.metadata.branch
UPDATE knowledge_base_chunks kbc
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'),
  '{branch}',
  to_jsonb(kb.branch::text)
)
FROM knowledge_base kb
WHERE kbc.knowledge_base_id = kb.id
  AND kb.branch IS NOT NULL
  AND kb.branch::text != 'autre'
  AND (kbc.metadata->>'branch' IS NULL OR kbc.metadata->>'branch' = '');

-- Vérification après migration
DO $$
DECLARE
  v_after_count INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_after_count
  FROM knowledge_base_chunks
  WHERE metadata->>'branch' IS NOT NULL AND metadata->>'branch' != '';

  RAISE NOTICE 'Après migration : % chunks ont metadata.branch', v_after_count;
END $$;

-- Distribution par branche (pour vérification)
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '--- Distribution par branche ---';
  FOR rec IN
    SELECT metadata->>'branch' as branch, COUNT(*) as cnt
    FROM knowledge_base_chunks
    WHERE metadata->>'branch' IS NOT NULL
    GROUP BY metadata->>'branch'
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE '  % : % chunks', rec.branch, rec.cnt;
  END LOOP;
END $$;

COMMIT;
