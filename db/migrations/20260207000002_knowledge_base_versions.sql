-- Migration: Historique des versions de la base de connaissances
-- Date: 2026-02-07
-- Description: Table pour l'historique des versions des documents

-- ============================================================================
-- TABLE KNOWLEDGE_BASE_VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,

  -- Snapshot des données au moment de la version
  title VARCHAR(500),
  description TEXT,
  full_text TEXT,
  source_file TEXT,
  metadata JSONB,
  category TEXT,
  subcategory VARCHAR(50),
  tags TEXT[],
  language VARCHAR(5),

  -- Audit
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason TEXT,
  change_type VARCHAR(50) DEFAULT 'update' CHECK (change_type IN ('create', 'update', 'content_update', 'file_replace', 'restore')),

  -- Contrainte d'unicité: une seule entrée par version par document
  UNIQUE (knowledge_base_id, version)
);

-- ============================================================================
-- INDEX
-- ============================================================================

-- Index pour récupérer l'historique d'un document
CREATE INDEX IF NOT EXISTS idx_kb_versions_doc ON knowledge_base_versions(knowledge_base_id);

-- Index pour trier par version
CREATE INDEX IF NOT EXISTS idx_kb_versions_doc_version ON knowledge_base_versions(knowledge_base_id, version DESC);

-- Index pour audit par utilisateur
CREATE INDEX IF NOT EXISTS idx_kb_versions_changed_by ON knowledge_base_versions(changed_by);

-- Index pour recherche par date
CREATE INDEX IF NOT EXISTS idx_kb_versions_changed_at ON knowledge_base_versions(changed_at DESC);

-- ============================================================================
-- FONCTION POUR CRÉER UNE VERSION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_knowledge_base_version(
  p_knowledge_base_id UUID,
  p_changed_by UUID,
  p_change_reason TEXT DEFAULT NULL,
  p_change_type VARCHAR(50) DEFAULT 'update'
)
RETURNS UUID AS $$
DECLARE
  v_version_id UUID;
  v_new_version INTEGER;
BEGIN
  -- Calculer le nouveau numéro de version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM knowledge_base_versions
  WHERE knowledge_base_id = p_knowledge_base_id;

  -- Insérer la nouvelle version avec snapshot des données actuelles
  INSERT INTO knowledge_base_versions (
    knowledge_base_id,
    version,
    title,
    description,
    full_text,
    source_file,
    metadata,
    category,
    subcategory,
    tags,
    language,
    changed_by,
    change_reason,
    change_type
  )
  SELECT
    id,
    v_new_version,
    title,
    description,
    full_text,
    source_file,
    metadata,
    category,
    subcategory,
    tags,
    language,
    p_changed_by,
    p_change_reason,
    p_change_type
  FROM knowledge_base
  WHERE id = p_knowledge_base_id
  RETURNING id INTO v_version_id;

  -- Mettre à jour le numéro de version sur le document principal
  UPDATE knowledge_base
  SET version = v_new_version
  WHERE id = p_knowledge_base_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION POUR RESTAURER UNE VERSION
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_knowledge_base_version(
  p_knowledge_base_id UUID,
  p_version_id UUID,
  p_restored_by UUID,
  p_reason TEXT DEFAULT 'Restauration de version'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version_data RECORD;
BEGIN
  -- Récupérer les données de la version à restaurer
  SELECT * INTO v_version_data
  FROM knowledge_base_versions
  WHERE id = p_version_id AND knowledge_base_id = p_knowledge_base_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version non trouvée';
  END IF;

  -- Créer d'abord une version de sauvegarde de l'état actuel
  PERFORM create_knowledge_base_version(
    p_knowledge_base_id,
    p_restored_by,
    'Sauvegarde avant restauration vers version ' || v_version_data.version,
    'update'
  );

  -- Restaurer les données
  UPDATE knowledge_base
  SET
    title = v_version_data.title,
    description = v_version_data.description,
    full_text = v_version_data.full_text,
    source_file = v_version_data.source_file,
    metadata = v_version_data.metadata,
    category = v_version_data.category,
    subcategory = v_version_data.subcategory,
    tags = v_version_data.tags,
    language = v_version_data.language,
    is_indexed = false, -- Nécessite ré-indexation
    updated_at = NOW()
  WHERE id = p_knowledge_base_id;

  -- Créer une entrée de version pour la restauration
  PERFORM create_knowledge_base_version(
    p_knowledge_base_id,
    p_restored_by,
    p_reason || ' (depuis version ' || v_version_data.version || ')',
    'restore'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION POUR OBTENIR L'HISTORIQUE DES VERSIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_knowledge_base_versions(
  p_knowledge_base_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  title VARCHAR(500),
  change_type VARCHAR(50),
  change_reason TEXT,
  changed_by UUID,
  changed_by_email TEXT,
  changed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbv.id,
    kbv.version,
    kbv.title,
    kbv.change_type,
    kbv.change_reason,
    kbv.changed_by,
    u.email::TEXT as changed_by_email,
    kbv.changed_at
  FROM knowledge_base_versions kbv
  LEFT JOIN users u ON kbv.changed_by = u.id
  WHERE kbv.knowledge_base_id = p_knowledge_base_id
  ORDER BY kbv.version DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER POUR CRÉER VERSION INITIALE À LA CRÉATION
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_create_initial_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer la version initiale
  PERFORM create_knowledge_base_version(
    NEW.id,
    NEW.uploaded_by,
    'Version initiale',
    'create'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Le trigger est commenté car il nécessite que le document existe d'abord
-- Il sera déclenché manuellement lors de l'upload via le service
-- CREATE TRIGGER knowledge_base_initial_version
--   AFTER INSERT ON knowledge_base
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_create_initial_version();

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Table knowledge_base_versions créée!';
  RAISE NOTICE '📝 Fonctions: create_knowledge_base_version, restore_knowledge_base_version, get_knowledge_base_versions';
  RAISE NOTICE '🔄 Support du versioning activé';
END $$;
