/**
 * Migration - Fix toutes les tables pour super-admin
 *
 * Assure que toutes les colonnes nécessaires existent.
 */

-- ============================================================================
-- TABLE USERS - Colonnes admin
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP;

-- ============================================================================
-- TABLE AI_USAGE_LOGS - Stats IA
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  request_type VARCHAR(50),
  operation_type VARCHAR(50),
  duration_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ajouter colonnes si table existe déjà
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50);
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at DESC);

-- ============================================================================
-- TABLE KNOWLEDGE_BASE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT,
  file_path VARCHAR(500),
  file_type VARCHAR(50),
  file_size INTEGER,
  category VARCHAR(100) DEFAULT 'autre',
  langue VARCHAR(10) DEFAULT 'fr',
  is_indexed BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  indexed_at TIMESTAMP,
  chunk_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_indexed ON knowledge_base(is_indexed);

-- ============================================================================
-- TABLE KNOWLEDGE_BASE_CHUNKS (RAG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON knowledge_base_chunks(document_id);

-- ============================================================================
-- TABLE ADMIN_NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  target_type VARCHAR(50),
  target_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  read_by UUID,
  is_actioned BOOLEAN DEFAULT FALSE,
  actioned_at TIMESTAMP,
  actioned_by UUID,
  action_result VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_is_read ON admin_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON admin_notifications(created_at DESC);

-- ============================================================================
-- TABLE ADMIN_AUDIT_LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID,
  target_identifier VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- ============================================================================
-- TABLE USER_ACTIVITY_LOGS (INPDP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  resource_label VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_logs(created_at DESC);

-- ============================================================================
-- SUPER ADMIN PERMANENT
-- ============================================================================

UPDATE users
SET
  role = 'super_admin',
  status = 'approved',
  is_approved = TRUE,
  email_verified = TRUE
WHERE email = 'salmen.ktata@gmail.com';

-- Protection trigger
CREATE OR REPLACE FUNCTION ensure_super_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.role != 'super_admin' THEN
    NEW.role := 'super_admin';
  END IF;
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.status != 'approved' THEN
    NEW.status := 'approved';
    NEW.is_approved := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_super_admin ON users;
CREATE TRIGGER protect_super_admin
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_super_admin();

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration super-admin tables complète';
  RAISE NOTICE '🔐 salmen.ktata@gmail.com = super_admin permanent';
END $$;
