-- Migration: Table des tokens de réinitialisation de mot de passe
-- Date: 2026-02-05
-- Description: Stockage sécurisé des tokens temporaires pour reset password

-- Créer la table password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Index pour performance
  CONSTRAINT check_expiration CHECK (expires_at > created_at)
);

-- Index pour recherche rapide par token
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE used_at IS NULL;

-- Index pour recherche par user_id
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Index pour nettoyage des tokens expirés
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Commentaires
COMMENT ON TABLE password_reset_tokens IS 'Tokens temporaires pour réinitialisation de mot de passe (expiration: 1h)';
COMMENT ON COLUMN password_reset_tokens.token IS 'Token unique haché envoyé par email';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Date expiration du token (1 heure après création)';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Date utilisation du token (NULL si non utilisé)';

-- Politique RLS (Row Level Security)
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne peuvent voir que leurs propres tokens
CREATE POLICY "Users can view own reset tokens" ON password_reset_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Fonction de nettoyage automatique des tokens expirés (optionnel)
CREATE OR REPLACE FUNCTION cleanup_expired_password_reset_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_password_reset_tokens IS 'Nettoie les tokens expirés depuis plus de 7 jours';
