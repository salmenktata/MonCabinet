-- Migration: Préférences notifications utilisateur
-- Date: 2026-02-05
-- Description: Table préférences notifications pour personnalisation alertes email

-- Table préférences notifications par utilisateur
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notifications activées/désactivées
  enabled BOOLEAN DEFAULT true,

  -- Email quotidien
  daily_digest_enabled BOOLEAN DEFAULT true,
  daily_digest_time TIME DEFAULT '06:00:00', -- 6h00 du matin (heure Tunisie)

  -- Alertes échéances
  alerte_j15_enabled BOOLEAN DEFAULT true,
  alerte_j7_enabled BOOLEAN DEFAULT true,
  alerte_j3_enabled BOOLEAN DEFAULT true,
  alerte_j1_enabled BOOLEAN DEFAULT true,

  -- Alertes actions urgentes
  alerte_actions_urgentes BOOLEAN DEFAULT true,
  alerte_actions_priorite_haute BOOLEAN DEFAULT true,

  -- Alertes audiences
  alerte_audiences_semaine BOOLEAN DEFAULT true,
  alerte_audiences_veille BOOLEAN DEFAULT true,

  -- Alertes factures
  alerte_factures_impayees BOOLEAN DEFAULT true,
  alerte_factures_impayees_delai_jours INTEGER DEFAULT 30 CHECK (alerte_factures_impayees_delai_jours > 0),

  -- Alertes délais légaux
  alerte_delais_appel BOOLEAN DEFAULT true, -- 20j civil, 10j commercial
  alerte_delais_cassation BOOLEAN DEFAULT true, -- 60j
  alerte_delais_opposition BOOLEAN DEFAULT true, -- 10j

  -- Format email
  email_format TEXT DEFAULT 'html' CHECK (email_format IN ('html', 'text')),
  langue_email TEXT DEFAULT 'fr' CHECK (langue_email IN ('fr', 'ar')),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Contrainte unique user_id
  UNIQUE(user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled ON notification_preferences(enabled) WHERE enabled = true;

-- Commentaires
COMMENT ON TABLE notification_preferences IS 'Préférences notifications email par utilisateur (échéances, actions, audiences, factures)';
COMMENT ON COLUMN notification_preferences.enabled IS 'Activer/désactiver toutes les notifications';
COMMENT ON COLUMN notification_preferences.daily_digest_enabled IS 'Email quotidien récapitulatif activé';
COMMENT ON COLUMN notification_preferences.daily_digest_time IS 'Heure envoi email quotidien (heure locale Tunisie)';
COMMENT ON COLUMN notification_preferences.alerte_j15_enabled IS 'Alerte échéances dans 15 jours';
COMMENT ON COLUMN notification_preferences.alerte_j7_enabled IS 'Alerte échéances dans 7 jours';
COMMENT ON COLUMN notification_preferences.alerte_j3_enabled IS 'Alerte échéances dans 3 jours';
COMMENT ON COLUMN notification_preferences.alerte_j1_enabled IS 'Alerte échéances demain';
COMMENT ON COLUMN notification_preferences.alerte_actions_urgentes IS 'Alerte actions priorité URGENTE';
COMMENT ON COLUMN notification_preferences.alerte_factures_impayees IS 'Alerte factures impayées > X jours';
COMMENT ON COLUMN notification_preferences.alerte_factures_impayees_delai_jours IS 'Nombre jours avant alerte facture impayée (défaut: 30j)';
COMMENT ON COLUMN notification_preferences.alerte_delais_appel IS 'Alertes spéciales délais appel (20j civil, 10j commercial)';
COMMENT ON COLUMN notification_preferences.email_format IS 'Format email: html (défaut) ou text';
COMMENT ON COLUMN notification_preferences.langue_email IS 'Langue email: fr (défaut) ou ar';

-- Trigger pour updated_at
CREATE TRIGGER trigger_notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour créer préférences par défaut lors création utilisateur
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger pour créer automatiquement les préférences lors création compte
CREATE TRIGGER trigger_create_default_notification_preferences
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_default_notification_preferences();

COMMENT ON FUNCTION create_default_notification_preferences IS 'Crée automatiquement préférences notifications par défaut lors création utilisateur';

-- Row-Level Security (RLS)
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateur peut voir ses propres préférences
CREATE POLICY "Users can view own notification preferences"
ON notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Utilisateur peut créer ses propres préférences
CREATE POLICY "Users can create own notification preferences"
ON notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Utilisateur peut modifier ses propres préférences
CREATE POLICY "Users can update own notification preferences"
ON notification_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Utilisateur peut supprimer ses propres préférences
CREATE POLICY "Users can delete own notification preferences"
ON notification_preferences
FOR DELETE
USING (auth.uid() = user_id);

-- Vue pour obtenir préférences avec valeurs par défaut si non définies
CREATE OR REPLACE VIEW user_notification_settings AS
SELECT
  u.id as user_id,
  u.email,
  COALESCE(np.enabled, true) as enabled,
  COALESCE(np.daily_digest_enabled, true) as daily_digest_enabled,
  COALESCE(np.daily_digest_time, '06:00:00'::TIME) as daily_digest_time,
  COALESCE(np.alerte_j15_enabled, true) as alerte_j15_enabled,
  COALESCE(np.alerte_j7_enabled, true) as alerte_j7_enabled,
  COALESCE(np.alerte_j3_enabled, true) as alerte_j3_enabled,
  COALESCE(np.alerte_j1_enabled, true) as alerte_j1_enabled,
  COALESCE(np.alerte_actions_urgentes, true) as alerte_actions_urgentes,
  COALESCE(np.alerte_actions_priorite_haute, true) as alerte_actions_priorite_haute,
  COALESCE(np.alerte_audiences_semaine, true) as alerte_audiences_semaine,
  COALESCE(np.alerte_audiences_veille, true) as alerte_audiences_veille,
  COALESCE(np.alerte_factures_impayees, true) as alerte_factures_impayees,
  COALESCE(np.alerte_factures_impayees_delai_jours, 30) as alerte_factures_impayees_delai_jours,
  COALESCE(np.alerte_delais_appel, true) as alerte_delais_appel,
  COALESCE(np.alerte_delais_cassation, true) as alerte_delais_cassation,
  COALESCE(np.alerte_delais_opposition, true) as alerte_delais_opposition,
  COALESCE(np.email_format, 'html') as email_format,
  COALESCE(np.langue_email, 'fr') as langue_email
FROM auth.users u
LEFT JOIN notification_preferences np ON u.id = np.user_id;

COMMENT ON VIEW user_notification_settings IS 'Vue préférences notifications avec valeurs par défaut si non définies';
