-- Migration: Colonnes détection et validation abrogation sur knowledge_base
-- Date: 2026-02-22
-- Contexte: Les docs abrogés doivent pouvoir être suspectés (scan auto),
-- puis confirmés ou rejetés manuellement par un admin.

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS abroge_suspected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS abroge_confidence TEXT CHECK (abroge_confidence IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS abroge_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abroge_validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_abroge BOOLEAN DEFAULT false;

-- Index partiel pour retrouver rapidement les docs suspects
CREATE INDEX IF NOT EXISTS idx_kb_abroge_suspected
  ON knowledge_base(abroge_suspected)
  WHERE abroge_suspected = true;

-- Index pour retrouver les docs confirmés abrogés
CREATE INDEX IF NOT EXISTS idx_kb_is_abroge
  ON knowledge_base(is_abroge)
  WHERE is_abroge = true;

-- Seed initial depuis legal_documents.is_abrogated (si la colonne existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_documents' AND column_name = 'is_abrogated'
  ) THEN
    UPDATE knowledge_base kb
    SET
      abroge_suspected = true,
      abroge_confidence = 'high'
    FROM legal_documents ld
    WHERE ld.knowledge_base_id = kb.id
      AND ld.is_abrogated = true
      AND kb.abroge_suspected = false;
  END IF;
END $$;
