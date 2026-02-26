-- Migration: Codes promo + colonne upgrade_promo_code

-- Table des codes promotionnels
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(30) UNIQUE NOT NULL,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  applies_to     TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('pro', 'expert', 'all')),
  max_uses       INTEGER DEFAULT NULL,     -- NULL = illimité
  used_count     INTEGER DEFAULT 0 NOT NULL,
  expires_at     TIMESTAMPTZ DEFAULT NULL, -- NULL = jamais
  is_active      BOOLEAN DEFAULT TRUE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active, expires_at);

-- Colonne pour stocker le code promo utilisé lors d'une demande d'upgrade
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS upgrade_promo_code VARCHAR(30) REFERENCES promo_codes(code) ON DELETE SET NULL;
