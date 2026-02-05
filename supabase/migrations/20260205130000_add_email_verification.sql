-- Migration: Ajout colonnes email verification dans table users
-- Date: 2026-02-05
-- Description: Support vérification email pour nouveaux utilisateurs

-- Ajouter colonnes si elles n'existent pas déjà
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;

-- Index pour recherche rapide par token
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
ON users(email_verification_token)
WHERE email_verified = FALSE AND email_verification_token IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN users.email_verified IS 'Email vérifié (TRUE) ou non (FALSE)';
COMMENT ON COLUMN users.email_verification_token IS 'Token unique pour vérification email';
COMMENT ON COLUMN users.email_verification_expires IS 'Date expiration du token (24h)';

-- Mettre à jour les utilisateurs existants (considérés comme vérifiés)
UPDATE users
SET email_verified = TRUE
WHERE email_verified IS NULL;
