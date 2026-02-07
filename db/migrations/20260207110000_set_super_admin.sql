/**
 * Migration - Définir salmen.ktata@gmail.com comme super_admin permanent
 *
 * Ce compte est le seul administrateur de la plateforme MonCabinet.
 */

-- Mettre à jour le rôle de salmen.ktata@gmail.com
UPDATE users
SET
  role = 'super_admin',
  status = 'approved',
  is_approved = TRUE,
  email_verified = TRUE,
  updated_at = NOW()
WHERE email = 'salmen.ktata@gmail.com';

-- Vérification
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM users
  WHERE email = 'salmen.ktata@gmail.com' AND role = 'super_admin';

  IF admin_count = 1 THEN
    RAISE NOTICE '✅ salmen.ktata@gmail.com configuré comme super_admin';
  ELSE
    RAISE NOTICE '⚠️ Utilisateur non trouvé - il sera configuré à la prochaine inscription';
  END IF;
END $$;

-- Créer un trigger pour s'assurer que ce compte reste toujours super_admin
CREATE OR REPLACE FUNCTION ensure_super_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Empêcher la modification du rôle de l'admin principal
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.role != 'super_admin' THEN
    NEW.role := 'super_admin';
    RAISE NOTICE 'Protection: salmen.ktata@gmail.com reste super_admin';
  END IF;

  -- Empêcher la suspension de l'admin principal
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.status != 'approved' THEN
    NEW.status := 'approved';
    NEW.is_approved := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer le trigger s'il existe
DROP TRIGGER IF EXISTS protect_super_admin ON users;

-- Créer le trigger
CREATE TRIGGER protect_super_admin
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_super_admin();

-- Confirmation finale
DO $$
BEGIN
  RAISE NOTICE '🔐 Protection super_admin activée pour salmen.ktata@gmail.com';
END $$;
