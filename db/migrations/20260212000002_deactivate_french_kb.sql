-- Migration: Désactivation soft des documents KB en français
-- Date: 2026-02-12
-- Description: Marque les documents français comme inactifs (réversible)
-- Rollback: UPDATE knowledge_base SET is_active = true WHERE metadata->>'deactivated_reason' = 'arabic_only_strategy';

-- Désactiver les documents français existants (soft delete)
UPDATE knowledge_base
SET is_active = false,
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"deactivated_reason": "arabic_only_strategy"}'::jsonb,
    updated_at = NOW()
WHERE language = 'fr' AND is_active = true;

-- Log du nombre de documents désactivés
DO $$
DECLARE
  deactivated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deactivated_count
  FROM knowledge_base
  WHERE metadata->>'deactivated_reason' = 'arabic_only_strategy';
  RAISE NOTICE 'Documents FR désactivés: %', deactivated_count;
END $$;
