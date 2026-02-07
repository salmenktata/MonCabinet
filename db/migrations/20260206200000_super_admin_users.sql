/**
 * Migration Super Admin - Extension table users
 *
 * Ajoute les champs nécessaires pour :
 * - Approbation des inscriptions (status, is_approved, approved_by, etc.)
 * - Suivi des connexions (last_login_at, login_count)
 * - Gestion des plans/abonnements (plan, plan_expires_at)
 */

-- ============================================================================
-- EXTENSION TABLE USERS
-- ============================================================================

-- Ajouter le champ role s'il n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
  END IF;
END $$;

-- Ajouter les champs de status
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- Champs d'approbation
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Champs de tracking connexion
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

-- Champs de plan/abonnement
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free'
  CHECK (plan IN ('free', 'pro', 'enterprise'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP;

-- ============================================================================
-- MIGRATION DES UTILISATEURS EXISTANTS
-- ============================================================================

-- Marquer tous les utilisateurs existants comme approuvés
UPDATE users
SET
  status = 'approved',
  is_approved = TRUE,
  approved_at = created_at
WHERE status IS NULL OR status = 'pending';

-- S'assurer que le status par défaut est 'pending' pour les nouveaux
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending';

-- ============================================================================
-- INDEX POUR PERFORMANCES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_approved_by ON users(approved_by);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- ============================================================================
-- CONTRAINTES ADDITIONNELLES
-- ============================================================================

-- Fonction pour valider les transitions de status
CREATE OR REPLACE FUNCTION validate_user_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Les super_admin peuvent passer à n'importe quel status
  -- Empêcher les transitions invalides
  IF OLD.status = 'rejected' AND NEW.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Un compte rejeté ne peut pas passer directement à %', NEW.status;
  END IF;

  -- Mettre à jour les timestamps appropriés
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    NEW.approved_at = NOW();
    NEW.is_approved = TRUE;
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    NEW.rejected_at = NOW();
    NEW.is_approved = FALSE;
  ELSIF NEW.status = 'suspended' AND OLD.status != 'suspended' THEN
    NEW.suspended_at = NOW();
    NEW.is_approved = FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger
DROP TRIGGER IF EXISTS trigger_user_status_transition ON users;
CREATE TRIGGER trigger_user_status_transition
  BEFORE UPDATE OF status ON users
  FOR EACH ROW
  EXECUTE FUNCTION validate_user_status_transition();

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration super_admin_users terminée';
  RAISE NOTICE '📊 Champs ajoutés: status, is_approved, approved_by, approved_at, rejected_at, suspended_at, rejection_reason, suspension_reason, last_login_at, login_count, plan, plan_expires_at';
END $$;
