/**
 * Migration - Logs d'activité utilisateur pour conformité INPDP
 *
 * Trace les accès aux données personnelles :
 * - Consultation de clients/dossiers
 * - Création/modification/suppression
 * - Exports de données
 * - Connexions/déconnexions
 */

-- ============================================================================
-- TABLE USER_ACTIVITY_LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qui a fait l'action
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,

  -- Type d'action
  action VARCHAR(50) NOT NULL,
  -- Actions possibles:
  -- login, logout, login_failed
  -- client_view, client_create, client_update, client_delete
  -- dossier_view, dossier_create, dossier_update, dossier_delete
  -- document_view, document_upload, document_download, document_delete
  -- facture_view, facture_create, facture_pdf_generate
  -- export_clients, export_dossiers, export_factures

  -- Ressource concernée
  resource_type VARCHAR(50) NOT NULL,
  -- Types: client, dossier, document, facture, session, export

  resource_id UUID,
  resource_label VARCHAR(255), -- Référence lisible (ex: "Dossier D2024/0015")

  -- Détails additionnels
  details JSONB,

  -- Informations de connexion
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEX POUR PERFORMANCES ET CONFORMITÉ
-- ============================================================================

-- Recherche par utilisateur
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_email ON user_activity_logs(user_email);

-- Recherche par action
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_resource_type ON user_activity_logs(resource_type);

-- Recherche par ressource
CREATE INDEX IF NOT EXISTS idx_user_activity_resource_id ON user_activity_logs(resource_id);

-- Recherche par date (très important pour audit)
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_logs(created_at DESC);

-- Index composite pour audit INPDP (qui a accédé à quoi et quand)
CREATE INDEX IF NOT EXISTS idx_user_activity_audit
  ON user_activity_logs(resource_type, resource_id, created_at DESC);

-- Index pour rechercher les accès d'un utilisateur sur une période
CREATE INDEX IF NOT EXISTS idx_user_activity_user_date
  ON user_activity_logs(user_id, created_at DESC);

-- ============================================================================
-- FONCTION POUR CRÉER UN LOG D'ACTIVITÉ
-- ============================================================================

CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id UUID,
  p_user_email VARCHAR(255),
  p_action VARCHAR(50),
  p_resource_type VARCHAR(50),
  p_resource_id UUID DEFAULT NULL,
  p_resource_label VARCHAR(255) DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address VARCHAR(45) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO user_activity_logs (
    user_id, user_email, action, resource_type,
    resource_id, resource_label, details,
    ip_address, user_agent, session_id
  ) VALUES (
    p_user_id, p_user_email, p_action, p_resource_type,
    p_resource_id, p_resource_label, p_details,
    p_ip_address, p_user_agent, p_session_id
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VUE POUR RAPPORT INPDP - Accès aux données personnelles
-- ============================================================================

CREATE OR REPLACE VIEW inpdp_data_access_report AS
SELECT
  ual.user_email AS "Utilisateur",
  ual.action AS "Action",
  ual.resource_type AS "Type de donnée",
  ual.resource_label AS "Référence",
  ual.ip_address AS "Adresse IP",
  ual.created_at AS "Date et heure"
FROM user_activity_logs ual
WHERE ual.resource_type IN ('client', 'dossier')
  AND ual.action IN ('client_view', 'client_update', 'client_delete',
                     'dossier_view', 'dossier_update', 'dossier_delete',
                     'export_clients', 'export_dossiers')
ORDER BY ual.created_at DESC;

-- ============================================================================
-- VUE POUR STATISTIQUES DE SÉCURITÉ
-- ============================================================================

CREATE OR REPLACE VIEW security_stats AS
SELECT
  DATE(created_at) AS date,
  COUNT(*) FILTER (WHERE action = 'login') AS connexions,
  COUNT(*) FILTER (WHERE action = 'login_failed') AS echecs_connexion,
  COUNT(*) FILTER (WHERE action LIKE '%_view') AS consultations,
  COUNT(*) FILTER (WHERE action LIKE '%_create') AS creations,
  COUNT(*) FILTER (WHERE action LIKE '%_update') AS modifications,
  COUNT(*) FILTER (WHERE action LIKE '%_delete') AS suppressions,
  COUNT(*) FILTER (WHERE action LIKE 'export_%') AS exports
FROM user_activity_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- POLITIQUE DE RÉTENTION (conservation 2 ans minimum pour INPDP)
-- ============================================================================

-- Cette fonction peut être appelée par un cron pour nettoyer les vieux logs
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(retention_years INTEGER DEFAULT 2)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_activity_logs
  WHERE created_at < NOW() - (retention_years || ' years')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration user_activity_logs terminée';
  RAISE NOTICE '📊 Table créée pour conformité INPDP';
  RAISE NOTICE '🔍 Vues: inpdp_data_access_report, security_stats';
  RAISE NOTICE '⏰ Rétention: 2 ans minimum';
END $$;
