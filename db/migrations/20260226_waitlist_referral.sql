/**
 * Migration : Waitlist, Invitations Beta, Parrainage
 *
 * Phase 1 — Table waitlist (liste d'attente publique)
 * Phase 2 — Colonnes invitation sur users
 * Phase 3 — Colonnes referral sur users
 */

-- ============================================================================
-- PHASE 1 : TABLE WAITLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  nom VARCHAR(100),
  prenom VARCHAR(100),
  -- Source de l'inscription (landing_page, linkedin, direct, referral, etc.)
  source VARCHAR(50) DEFAULT 'landing_page',
  -- Statut : pending → invited → converted | rejected
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'invited', 'converted', 'rejected')),
  -- Token d'invitation envoyé (une fois l'invitation générée)
  invitation_token VARCHAR(255) UNIQUE,
  invited_at TIMESTAMPTZ,
  -- Conversion : l'utilisateur a créé un compte depuis cette invitation
  converted_at TIMESTAMPTZ,
  converted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Notes admin
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_invitation_token ON waitlist(invitation_token);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at DESC);

-- Trigger updated_at
CREATE TRIGGER update_waitlist_updated_at
  BEFORE UPDATE ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PHASE 2 : COLONNES INVITATION SUR USERS
-- ============================================================================

-- Token d'invitation qui a permis l'inscription (lie l'user à la waitlist)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invited_from_waitlist_id UUID REFERENCES waitlist(id) ON DELETE SET NULL,
  -- Indique que l'inscription vient d'une invitation (bypass approbation manuelle)
  ADD COLUMN IF NOT EXISTS invited_user BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);

-- ============================================================================
-- PHASE 3 : COLONNES REFERRAL SUR USERS
-- ============================================================================

-- Code de parrainage unique de l'utilisateur (généré à l'approbation)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
  -- Code de parrainage utilisé lors de l'inscription
  ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20),
  -- Lien vers le parrain
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Récompenses accordées au parrain (nombre de mois offerts)
  ADD COLUMN IF NOT EXISTS referral_rewards_given INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

-- ============================================================================
-- FONCTION : Générer un code de parrainage unique (8 chars alphanumériques)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sans O, 0, I, 1 (confusables)
  code TEXT := '';
  i INT;
  exists_check INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
    END LOOP;
    -- Vérifier unicité
    SELECT COUNT(*) INTO exists_check FROM users WHERE referral_code = code;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration waitlist/referral terminée';
  RAISE NOTICE '📋 Table créée: waitlist';
  RAISE NOTICE '📋 Colonnes users: invitation_token, invited_from_waitlist_id, invited_user';
  RAISE NOTICE '📋 Colonnes referral: referral_code, referred_by_code, referred_by_user_id, referral_rewards_given';
END $$;
