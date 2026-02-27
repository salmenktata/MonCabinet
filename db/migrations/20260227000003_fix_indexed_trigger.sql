-- Migration: Fix permanent is_indexed/chunk_count inconsistency via trigger
-- Date: 2026-02-27
-- Problem: is_indexed and chunk_count can get out of sync when indexation fails mid-process
-- Solution: PostgreSQL trigger that auto-syncs is_indexed/chunk_count on knowledge_base_chunks INSERT/DELETE

CREATE OR REPLACE FUNCTION sync_kb_indexed_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE knowledge_base
    SET
      is_indexed = true,
      chunk_count = (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = NEW.knowledge_base_id)
    WHERE id = NEW.knowledge_base_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE knowledge_base
    SET
      chunk_count = (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = OLD.knowledge_base_id),
      is_indexed = (SELECT COUNT(*) > 0 FROM knowledge_base_chunks WHERE knowledge_base_id = OLD.knowledge_base_id)
    WHERE id = OLD.knowledge_base_id;
  END IF;
  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_kb_indexed ON knowledge_base_chunks;

CREATE TRIGGER trg_sync_kb_indexed
AFTER INSERT OR DELETE ON knowledge_base_chunks
FOR EACH ROW EXECUTE FUNCTION sync_kb_indexed_status();

-- One-time reconciliation: fix any existing inconsistencies
-- Fix docs with real chunks but is_indexed=false
UPDATE knowledge_base kb
SET
  is_indexed = true,
  chunk_count = (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id)
WHERE kb.is_indexed = false
  AND (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id) > 0;

-- Fix docs marked as indexed but with no real chunks
UPDATE knowledge_base kb
SET
  is_indexed = false,
  chunk_count = 0
WHERE kb.is_indexed = true
  AND (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id) = 0;

-- Fix stale chunk_count for indexed docs
UPDATE knowledge_base kb
SET chunk_count = (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id)
WHERE kb.is_indexed = true
  AND kb.chunk_count != (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id);
