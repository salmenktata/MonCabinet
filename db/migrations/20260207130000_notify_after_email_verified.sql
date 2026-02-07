-- Migration: Notification admin après vérification email
-- Description: Modifie le trigger pour créer la notification admin seulement après
--              que l'utilisateur ait vérifié son email (et non à l'inscription)

-- Supprimer l'ancien trigger qui se déclenchait à l'inscription
DROP TRIGGER IF EXISTS trigger_notify_new_registration ON users;

-- Créer le nouveau trigger qui se déclenche quand email_verified passe à TRUE
-- Condition: email_verified passe de FALSE à TRUE ET le statut est 'pending'
CREATE TRIGGER trigger_notify_email_verified
  AFTER UPDATE OF email_verified ON users
  FOR EACH ROW
  WHEN (OLD.email_verified = FALSE AND NEW.email_verified = TRUE AND NEW.status = 'pending')
  EXECUTE FUNCTION notify_new_registration();

-- Commentaire explicatif
COMMENT ON TRIGGER trigger_notify_email_verified ON users IS
  'Notifie le super admin quand un utilisateur vérifie son email (et est en attente de validation)';
