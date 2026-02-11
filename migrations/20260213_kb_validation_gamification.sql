-- Migration : Gamification Validation KB (Phase 1.3)
-- Date : 2026-02-13
-- Description : Table de statistiques pour système de points validateurs

-- =============================================================================
-- Table : user_validation_stats
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_validation_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  documents_validated INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  last_validation_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_validation_stats IS
'Statistiques de validation KB par utilisateur (gamification)';

COMMENT ON COLUMN user_validation_stats.documents_validated IS
'Nombre total de documents validés par cet utilisateur';

COMMENT ON COLUMN user_validation_stats.points IS
'Points totaux accumulés (1 point = 1 doc validé)';

COMMENT ON COLUMN user_validation_stats.last_validation_at IS
'Date de dernière validation (pour calculer périodes actives)';

-- =============================================================================
-- Index pour performance
-- =============================================================================

-- Index pour tri par points (leaderboard)
CREATE INDEX IF NOT EXISTS idx_validation_stats_points
ON user_validation_stats (points DESC);

-- Index pour tri par docs validés
CREATE INDEX IF NOT EXISTS idx_validation_stats_docs_validated
ON user_validation_stats (documents_validated DESC);

-- Index pour filtre période active
CREATE INDEX IF NOT EXISTS idx_validation_stats_last_validation
ON user_validation_stats (last_validation_at DESC);

-- =============================================================================
-- Vue : Badges utilisateurs
-- =============================================================================

CREATE OR REPLACE VIEW v_user_validation_badges AS
SELECT
  user_id,
  documents_validated,
  points,
  last_validation_at,
  CASE
    WHEN points >= 100 THEN 'or'
    WHEN points >= 50 THEN 'argent'
    WHEN points >= 10 THEN 'bronze'
    ELSE 'novice'
  END as badge,
  CASE
    WHEN points >= 100 THEN '🥇 Or'
    WHEN points >= 50 THEN '🥈 Argent'
    WHEN points >= 10 THEN '🥉 Bronze'
    ELSE '🔰 Novice'
  END as badge_label,
  RANK() OVER (ORDER BY points DESC) as global_rank
FROM user_validation_stats;

COMMENT ON VIEW v_user_validation_badges IS
'Vue calculant badges et rangs des validateurs';

-- =============================================================================
-- Fonction : Get user badge
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_badge(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_points INTEGER;
BEGIN
  SELECT points INTO user_points
  FROM user_validation_stats
  WHERE user_id = p_user_id;

  IF user_points IS NULL THEN
    RETURN 'novice';
  ELSIF user_points >= 100 THEN
    RETURN 'or';
  ELSIF user_points >= 50 THEN
    RETURN 'argent';
  ELSIF user_points >= 10 THEN
    RETURN 'bronze';
  ELSE
    RETURN 'novice';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_badge(UUID) IS
'Retourne le badge d''un utilisateur selon ses points';

-- =============================================================================
-- Fonction : Get leaderboard position
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_leaderboard_position(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  user_rank INTEGER;
BEGIN
  SELECT global_rank INTO user_rank
  FROM v_user_validation_badges
  WHERE user_id = p_user_id;

  RETURN COALESCE(user_rank, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_leaderboard_position(UUID) IS
'Retourne la position d''un utilisateur dans le leaderboard global';

-- =============================================================================
-- Données initiales (optionnel)
-- =============================================================================

-- Exemple : Créer stats pour utilisateurs existants (0 points)
INSERT INTO user_validation_stats (user_id, documents_validated, points)
SELECT id, 0, 0
FROM users
WHERE id NOT IN (SELECT user_id FROM user_validation_stats)
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- Statistiques migration
-- =============================================================================

DO $$
DECLARE
  total_users INTEGER;
  stats_created INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM users;
  SELECT COUNT(*) INTO stats_created FROM user_validation_stats;

  RAISE NOTICE '=== MIGRATION GAMIFICATION ===';
  RAISE NOTICE 'Total utilisateurs       : %', total_users;
  RAISE NOTICE 'Stats créées             : %', stats_created;
  RAISE NOTICE 'Table user_validation_stats créée avec 3 index';
  RAISE NOTICE 'Vue v_user_validation_badges créée';
  RAISE NOTICE 'Fonction get_user_badge() créée';
  RAISE NOTICE 'Fonction get_user_leaderboard_position() créée';
END $$;
