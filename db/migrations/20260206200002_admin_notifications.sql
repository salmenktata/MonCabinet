/**
 * Migration Super Admin - Table admin_notifications
 *
 * Système de notifications pour les super admins :
 * - Nouvelles inscriptions
 * - Alertes système
 * - Actions requises
 */

-- ============================================================================
-- TABLE ADMIN_NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type de notification
  notification_type VARCHAR(50) NOT NULL,
  -- Types possibles:
  -- new_registration : nouvelle demande d'inscription
  -- user_activity : activité utilisateur notable
  -- system_alert : alerte système
  -- kb_update : mise à jour base de connaissance
  -- plan_expiring : plan qui expire bientôt

  -- Priorité
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Contenu
  title VARCHAR(255) NOT NULL,
  message TEXT,

  -- Référence optionnelle
  target_type VARCHAR(50), -- user, knowledge_base, system
  target_id UUID,

  -- Métadonnées additionnelles
  metadata JSONB DEFAULT '{}'::jsonb,

  -- État de lecture
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  read_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Action prise
  is_actioned BOOLEAN DEFAULT FALSE,
  actioned_at TIMESTAMP,
  actioned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  action_result VARCHAR(50), -- approved, rejected, dismissed, etc.

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP -- NULL = n'expire jamais
);

-- ============================================================================
-- INDEX POUR PERFORMANCES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_admin_notif_type ON admin_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_admin_notif_priority ON admin_notifications(priority);
CREATE INDEX IF NOT EXISTS idx_admin_notif_is_read ON admin_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notif_target ON admin_notifications(target_type, target_id);

-- Index composite pour notifications non lues urgentes
CREATE INDEX IF NOT EXISTS idx_admin_notif_unread_priority
  ON admin_notifications(priority, created_at DESC)
  WHERE is_read = FALSE;

-- ============================================================================
-- TRIGGER: NOTIFICATION AUTOMATIQUE NOUVELLE INSCRIPTION
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_new_registration()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer une notification seulement si le nouveau user est en pending
  IF NEW.status = 'pending' THEN
    INSERT INTO admin_notifications (
      notification_type,
      priority,
      title,
      message,
      target_type,
      target_id,
      metadata
    ) VALUES (
      'new_registration',
      'high',
      'Nouvelle demande d''inscription',
      format('L''utilisateur %s (%s) demande l''accès à la plateforme.',
        COALESCE(NEW.prenom || ' ' || NEW.nom, NEW.email),
        NEW.email
      ),
      'user',
      NEW.id,
      jsonb_build_object(
        'user_email', NEW.email,
        'user_name', COALESCE(NEW.prenom || ' ' || NEW.nom, NEW.email),
        'registered_at', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur INSERT dans users
DROP TRIGGER IF EXISTS trigger_notify_new_registration ON users;
CREATE TRIGGER trigger_notify_new_registration
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_registration();

-- ============================================================================
-- TRIGGER: NOTIFICATION EXPIRATION PLAN
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_plan_expiring()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le plan expire dans les 7 prochains jours
  IF NEW.plan_expires_at IS NOT NULL
     AND NEW.plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
     AND (OLD.plan_expires_at IS NULL OR OLD.plan_expires_at != NEW.plan_expires_at) THEN
    INSERT INTO admin_notifications (
      notification_type,
      priority,
      title,
      message,
      target_type,
      target_id,
      metadata,
      expires_at
    ) VALUES (
      'plan_expiring',
      'normal',
      'Plan utilisateur expire bientôt',
      format('Le plan %s de %s expire le %s.',
        NEW.plan,
        NEW.email,
        TO_CHAR(NEW.plan_expires_at, 'DD/MM/YYYY')
      ),
      'user',
      NEW.id,
      jsonb_build_object(
        'user_email', NEW.email,
        'plan', NEW.plan,
        'expires_at', NEW.plan_expires_at
      ),
      NEW.plan_expires_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur UPDATE de plan_expires_at
DROP TRIGGER IF EXISTS trigger_notify_plan_expiring ON users;
CREATE TRIGGER trigger_notify_plan_expiring
  AFTER UPDATE OF plan_expires_at ON users
  FOR EACH ROW
  EXECUTE FUNCTION notify_plan_expiring();

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Marquer une notification comme lue
CREATE OR REPLACE FUNCTION mark_notification_read(
  p_notification_id UUID,
  p_admin_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE admin_notifications
  SET
    is_read = TRUE,
    read_at = NOW(),
    read_by = p_admin_id
  WHERE id = p_notification_id AND is_read = FALSE;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Marquer toutes les notifications comme lues
CREATE OR REPLACE FUNCTION mark_all_notifications_read(
  p_admin_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  count_updated INTEGER;
BEGIN
  UPDATE admin_notifications
  SET
    is_read = TRUE,
    read_at = NOW(),
    read_by = p_admin_id
  WHERE is_read = FALSE;

  GET DIAGNOSTICS count_updated = ROW_COUNT;
  RETURN count_updated;
END;
$$ LANGUAGE plpgsql;

-- Compter les notifications non lues
CREATE OR REPLACE FUNCTION count_unread_notifications()
RETURNS TABLE(total INTEGER, urgent INTEGER, high INTEGER, normal INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total,
    COUNT(*) FILTER (WHERE priority = 'urgent')::INTEGER as urgent,
    COUNT(*) FILTER (WHERE priority = 'high')::INTEGER as high,
    COUNT(*) FILTER (WHERE priority = 'normal')::INTEGER as normal
  FROM admin_notifications
  WHERE is_read = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VUE NOTIFICATIONS ACTIVES
-- ============================================================================

CREATE OR REPLACE VIEW active_admin_notifications AS
SELECT
  n.*,
  u.email as target_email,
  u.nom as target_nom,
  u.prenom as target_prenom
FROM admin_notifications n
LEFT JOIN users u ON n.target_type = 'user' AND n.target_id = u.id
WHERE n.is_read = FALSE
  AND (n.expires_at IS NULL OR n.expires_at > NOW())
ORDER BY
  CASE n.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  n.created_at DESC;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration admin_notifications terminée';
  RAISE NOTICE '📊 Table créée avec triggers automatiques';
  RAISE NOTICE '🔔 Notifications auto pour: new_registration, plan_expiring';
END $$;
