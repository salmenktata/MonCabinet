-- Fix constitution 2022 titles: remove "مشروع" and add promulgated metadata
-- Run via tunnel: psql -h 127.0.0.1 -p 5434 -U moncabinet -d qadhya < scripts/fix-constitution-titles.sql
-- OR on VPS: docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < scripts/fix-constitution-titles.sql

BEGIN;

-- 1. Fix titles in knowledge_base
UPDATE knowledge_base
SET
  title = TRIM(
    REPLACE(
      REPLACE(
        REPLACE(title, 'مشروع دستور', 'دستور'),
        ' (صيغة محيّنة)', ''
      ),
      '  ', ' '
    )
  ),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'promulgated', true,
    'promulgated_date', '2022-07-27',
    'jort_number', '58',
    'status', 'enacted'
  )
WHERE category = 'constitution'
  AND title ILIKE '%مشروع%دستور%2022%';

-- 2. Fix metadata in knowledge_base_chunks (title fix cascades via JOIN, but metadata is per-chunk)
UPDATE knowledge_base_chunks kbc
SET metadata = COALESCE(kbc.metadata, '{}'::jsonb) || jsonb_build_object(
  'promulgated', true,
  'promulgated_date', '2022-07-27',
  'status', 'enacted'
)
FROM knowledge_base kb
WHERE kbc.knowledge_base_id = kb.id
  AND kb.category = 'constitution'
  AND kb.title ILIKE '%دستور%2022%';

-- Verify
SELECT id, title, metadata->>'promulgated' as promulgated, metadata->>'promulgated_date' as date
FROM knowledge_base
WHERE category = 'constitution'
ORDER BY title;

COMMIT;
