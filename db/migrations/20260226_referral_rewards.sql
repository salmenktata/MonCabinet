-- Migration: table referral_rewards
-- Stocke les récompenses attribuées au parrain pour chaque filleul
-- Permet d'éviter les doubles récompenses (un parrain = 1 récompense / filleul)

CREATE TABLE IF NOT EXISTS referral_rewards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type   VARCHAR(50) NOT NULL DEFAULT '1_month',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (referrer_id, referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referee  ON referral_rewards(referee_id);

DO $$ BEGIN RAISE NOTICE '✅ Table referral_rewards créée'; END $$;
