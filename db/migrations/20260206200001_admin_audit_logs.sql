/**
 * Migration Super Admin - Table admin_audit_logs
 *
 * Trace toutes les actions administratives pour :
 * - Audit de sécurité
 * - Historique des modifications
 * - Conformité réglementaire
 */

-- ============================================================================
-- TABLE ADMIN_AUDIT_LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qui a fait l'action
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  admin_email VARCHAR(255) NOT NULL,

  -- Type d'action
  action_type VARCHAR(50) NOT NULL,
  -- Types possibles:
  -- user_approved, user_rejected, user_suspended, user_reactivated
  -- role_changed, plan_changed
  -- kb_upload, kb_delete, kb_index
  -- config_updated

  -- Cible de l'action
  target_type VARCHAR(50) NOT NULL,
  -- Types possibles: user, knowledge_base, config, plan

  target_id UUID,
  target_identifier VARCHAR(255), -- email ou titre pour référence facile

  -- Valeurs avant/après
  old_value JSONB,
  new_value JSONB,

  -- Métadonnées additionnelles
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEX POUR PERFORMANCES ET RECHERCHE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON admin_audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON admin_audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- Index composite pour recherche par admin + date
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_date ON admin_audit_logs(admin_id, created_at DESC);

-- ============================================================================
-- FONCTION UTILITAIRE POUR CRÉER UN LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION create_audit_log(
  p_admin_id UUID,
  p_admin_email VARCHAR(255),
  p_action_type VARCHAR(50),
  p_target_type VARCHAR(50),
  p_target_id UUID DEFAULT NULL,
  p_target_identifier VARCHAR(255) DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_ip_address VARCHAR(45) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO admin_audit_logs (
    admin_id, admin_email, action_type, target_type,
    target_id, target_identifier, old_value, new_value,
    ip_address, user_agent
  ) VALUES (
    p_admin_id, p_admin_email, p_action_type, p_target_type,
    p_target_id, p_target_identifier, p_old_value, p_new_value,
    p_ip_address, p_user_agent
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VUE POUR FACILITER LA CONSULTATION
-- ============================================================================

CREATE OR REPLACE VIEW audit_logs_view AS
SELECT
  al.id,
  al.admin_id,
  al.admin_email,
  al.action_type,
  al.target_type,
  al.target_id,
  al.target_identifier,
  al.old_value,
  al.new_value,
  al.ip_address,
  al.created_at,
  -- Libellé lisible de l'action
  CASE al.action_type
    WHEN 'user_approved' THEN 'Utilisateur approuvé'
    WHEN 'user_rejected' THEN 'Utilisateur rejeté'
    WHEN 'user_suspended' THEN 'Utilisateur suspendu'
    WHEN 'user_reactivated' THEN 'Utilisateur réactivé'
    WHEN 'role_changed' THEN 'Rôle modifié'
    WHEN 'plan_changed' THEN 'Plan modifié'
    WHEN 'kb_upload' THEN 'Document uploadé (KB)'
    WHEN 'kb_delete' THEN 'Document supprimé (KB)'
    WHEN 'kb_index' THEN 'Document indexé (KB)'
    WHEN 'config_updated' THEN 'Configuration mise à jour'
    ELSE al.action_type
  END AS action_label
FROM admin_audit_logs al
ORDER BY al.created_at DESC;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration admin_audit_logs terminée';
  RAISE NOTICE '📊 Table créée avec colonnes: admin_id, admin_email, action_type, target_type, target_id, old_value, new_value';
  RAISE NOTICE '🔍 Vue audit_logs_view créée pour consultation facile';
END $$;
