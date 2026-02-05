-- Créer table users pour NextAuth
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nom VARCHAR(100),
  prenom VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Créer index sur email pour performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Afficher confirmation
SELECT 'Table users créée avec succès' AS status;
