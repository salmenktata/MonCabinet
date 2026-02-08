-- Migration: Import en lot pour la base de connaissances
-- Date: 2026-02-10
-- Description: Table pour gérer les imports groupés de documents KB

-- ============================================================================
-- TABLE kb_bulk_imports
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_bulk_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partially_completed', 'failed')),

  -- Configuration par défaut pour le lot
  default_category VARCHAR(50),
  default_language VARCHAR(5) DEFAULT 'ar',
  default_tags TEXT[] DEFAULT '{}',
  auto_index BOOLEAN DEFAULT true,

  -- Résultats
  document_ids UUID[] DEFAULT '{}',
  errors JSONB DEFAULT '[]'::jsonb,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FK sur knowledge_base
-- ============================================================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS bulk_import_id UUID REFERENCES kb_bulk_imports(id) ON DELETE SET NULL;

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kb_bulk_imports_user ON kb_bulk_imports(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_kb_bulk_imports_status ON kb_bulk_imports(status);
CREATE INDEX IF NOT EXISTS idx_kb_bulk_import_ref ON knowledge_base(bulk_import_id) WHERE bulk_import_id IS NOT NULL;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration kb_bulk_imports terminée';
  RAISE NOTICE 'Table kb_bulk_imports créée';
  RAISE NOTICE 'FK bulk_import_id ajoutée à knowledge_base';
END $$;
