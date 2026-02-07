-- Migration: Champs divorce tunisiens (Code Statut Personnel)
-- Date: 2026-02-05
-- Description: Ajoute colonnes spécifiques pour dossiers divorce CSP avec calculs pensions

-- Ajouter colonnes divorce à la table dossiers
ALTER TABLE dossiers
ADD COLUMN IF NOT EXISTS type_divorce TEXT CHECK (
  type_divorce IN (
    'consentement_mutuel',
    'prejudice',
    'unilateral_epoux',
    'unilateral_epouse'
  )
),
ADD COLUMN IF NOT EXISTS date_mariage DATE,
ADD COLUMN IF NOT EXISTS lieu_mariage TEXT,
ADD COLUMN IF NOT EXISTS acte_mariage_numero TEXT,
ADD COLUMN IF NOT EXISTS acte_mariage_date DATE,
ADD COLUMN IF NOT EXISTS regime_matrimonial TEXT CHECK (
  regime_matrimonial IN ('communaute', 'separation')
),
ADD COLUMN IF NOT EXISTS duree_mariage_annees DECIMAL(5,1),
ADD COLUMN IF NOT EXISTS revenus_epoux DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS revenus_epouse DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS revenus_pere DECIMAL(10,3),
ADD COLUMN IF NOT EXISTS pension_alimentaire_par_enfant DECIMAL(10,3) CHECK (pension_alimentaire_par_enfant >= 0),
ADD COLUMN IF NOT EXISTS pension_alimentaire_total DECIMAL(10,3) CHECK (pension_alimentaire_total >= 0),
ADD COLUMN IF NOT EXISTS pension_compensatoire_moutaa DECIMAL(10,3) CHECK (pension_compensatoire_moutaa >= 0),
ADD COLUMN IF NOT EXISTS coefficient_moutaa DECIMAL(4,2) DEFAULT 2.0 CHECK (coefficient_moutaa > 0),
ADD COLUMN IF NOT EXISTS garde_enfants TEXT CHECK (
  garde_enfants IN ('mere', 'pere', 'partagee')
),
ADD COLUMN IF NOT EXISTS droit_visite TEXT,
ADD COLUMN IF NOT EXISTS tentative_conciliation_1 DATE,
ADD COLUMN IF NOT EXISTS tentative_conciliation_2 DATE,
ADD COLUMN IF NOT EXISTS tentative_conciliation_3 DATE,
ADD COLUMN IF NOT EXISTS echec_conciliation_date DATE,
ADD COLUMN IF NOT EXISTS delai_reflexion_debut DATE,
ADD COLUMN IF NOT EXISTS delai_reflexion_fin DATE,
ADD COLUMN IF NOT EXISTS date_transcription DATE,
ADD COLUMN IF NOT EXISTS biens_communs TEXT, -- JSON ou texte libre
ADD COLUMN IF NOT EXISTS valeur_biens_communs DECIMAL(12,3);

-- Table enfants pour dossiers divorce
CREATE TABLE IF NOT EXISTS dossier_enfants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dossier_id UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  prenom TEXT NOT NULL,
  nom TEXT,
  date_naissance DATE NOT NULL,
  sexe TEXT CHECK (sexe IN ('M', 'F')),
  age_actuel INTEGER,
  est_mineur BOOLEAN DEFAULT true,
  garde_attribuee_a TEXT CHECK (garde_attribuee_a IN ('mere', 'pere', 'tiers', 'indecis')),
  pension_alimentaire_montant DECIMAL(10,3),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherches divorce
CREATE INDEX IF NOT EXISTS idx_dossiers_type_divorce ON dossiers(type_divorce) WHERE type_divorce IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossiers_date_mariage ON dossiers(date_mariage) WHERE date_mariage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossiers_pension_compensatoire ON dossiers(pension_compensatoire_moutaa) WHERE pension_compensatoire_moutaa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossier_enfants_dossier_id ON dossier_enfants(dossier_id);

-- Commentaires explicatifs
COMMENT ON COLUMN dossiers.type_divorce IS 'Type divorce CSP Art.31: consentement_mutuel, prejudice (Darar), unilateral_epoux, unilateral_epouse (Khol'')';
COMMENT ON COLUMN dossiers.date_mariage IS 'Date du mariage (pour calcul durée → Moutaa)';
COMMENT ON COLUMN dossiers.lieu_mariage IS 'Lieu du mariage (ville, délégation)';
COMMENT ON COLUMN dossiers.acte_mariage_numero IS 'Numéro acte de mariage (transcription divorce obligatoire)';
COMMENT ON COLUMN dossiers.regime_matrimonial IS 'Régime matrimonial: communauté ou séparation de biens';
COMMENT ON COLUMN dossiers.duree_mariage_annees IS 'Durée mariage en années (auto-calculée ou manuelle)';
COMMENT ON COLUMN dossiers.revenus_epoux IS 'Revenus mensuels époux en TND (base calcul Moutaa)';
COMMENT ON COLUMN dossiers.revenus_epouse IS 'Revenus mensuels épouse en TND (si applicable)';
COMMENT ON COLUMN dossiers.revenus_pere IS 'Revenus mensuels du père en TND (base calcul pension alimentaire enfants)';
COMMENT ON COLUMN dossiers.pension_alimentaire_par_enfant IS 'Pension alimentaire suggérée par enfant en TND';
COMMENT ON COLUMN dossiers.pension_alimentaire_total IS 'Pension alimentaire totale (tous enfants) en TND';
COMMENT ON COLUMN dossiers.pension_compensatoire_moutaa IS 'Pension compensatoire (Moutaa) selon formule CSP: Durée × Coefficient (2) × Revenus époux';
COMMENT ON COLUMN dossiers.coefficient_moutaa IS 'Coefficient calcul Moutaa (défaut: 2 = 1 an mariage = 2 mois revenus)';
COMMENT ON COLUMN dossiers.garde_enfants IS 'Garde des enfants mineurs: mère, père, ou partagée';
COMMENT ON COLUMN dossiers.droit_visite IS 'Modalités droit de visite parent non-gardien';
COMMENT ON COLUMN dossiers.tentative_conciliation_1 IS 'Date 1ère tentative conciliation (CSP: 3 obligatoires)';
COMMENT ON COLUMN dossiers.tentative_conciliation_2 IS 'Date 2ème tentative conciliation';
COMMENT ON COLUMN dossiers.tentative_conciliation_3 IS 'Date 3ème tentative conciliation';
COMMENT ON COLUMN dossiers.echec_conciliation_date IS 'Date constat échec conciliation (PV)';
COMMENT ON COLUMN dossiers.delai_reflexion_debut IS 'Début délai réflexion 2 mois minimum (CSP)';
COMMENT ON COLUMN dossiers.delai_reflexion_fin IS 'Fin délai réflexion 2 mois';
COMMENT ON COLUMN dossiers.date_transcription IS 'Date transcription jugement divorce sur acte mariage (OBLIGATOIRE)';
COMMENT ON COLUMN dossiers.biens_communs IS 'Liste biens communs à partager (JSON ou texte)';
COMMENT ON COLUMN dossiers.valeur_biens_communs IS 'Valeur estimée totale biens communs en TND';

COMMENT ON TABLE dossier_enfants IS 'Enfants concernés par dossier divorce (garde, pension alimentaire)';
COMMENT ON COLUMN dossier_enfants.prenom IS 'Prénom de l''enfant';
COMMENT ON COLUMN dossier_enfants.date_naissance IS 'Date naissance enfant (calcul âge et statut mineur)';
COMMENT ON COLUMN dossier_enfants.age_actuel IS 'Âge actuel de l''enfant (calculé ou manuel)';
COMMENT ON COLUMN dossier_enfants.est_mineur IS 'TRUE si enfant < 18 ans (majorité tunisienne)';
COMMENT ON COLUMN dossier_enfants.garde_attribuee_a IS 'Garde attribuée à: mère, père, tiers, ou indécis';
COMMENT ON COLUMN dossier_enfants.pension_alimentaire_montant IS 'Montant pension alimentaire pour cet enfant en TND';

-- Vue pour dossiers divorce avec calculs
CREATE OR REPLACE VIEW dossiers_divorce AS
SELECT
  d.*,
  CASE
    WHEN d.date_mariage IS NOT NULL
    THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, d.date_mariage))::NUMERIC +
         (EXTRACT(MONTH FROM AGE(CURRENT_DATE, d.date_mariage))::NUMERIC / 12)
    ELSE 0
  END as duree_mariage_calculee,
  (SELECT COUNT(*) FROM dossier_enfants de WHERE de.dossier_id = d.id AND de.est_mineur = true) as nb_enfants_mineurs,
  (SELECT COUNT(*) FROM dossier_enfants de WHERE de.dossier_id = d.id) as nb_enfants_total,
  CASE
    WHEN d.tentative_conciliation_1 IS NOT NULL AND d.tentative_conciliation_2 IS NOT NULL AND d.tentative_conciliation_3 IS NOT NULL
    THEN 3
    WHEN d.tentative_conciliation_1 IS NOT NULL AND d.tentative_conciliation_2 IS NOT NULL
    THEN 2
    WHEN d.tentative_conciliation_1 IS NOT NULL
    THEN 1
    ELSE 0
  END as nb_tentatives_conciliation,
  CASE
    WHEN d.delai_reflexion_debut IS NOT NULL AND d.delai_reflexion_fin IS NOT NULL
    THEN (d.delai_reflexion_fin - d.delai_reflexion_debut)::INTEGER
    ELSE NULL
  END as duree_delai_reflexion_jours
FROM dossiers d
WHERE d.type_divorce IS NOT NULL;

COMMENT ON VIEW dossiers_divorce IS 'Vue dossiers divorce avec calculs automatiques (durée mariage, nb enfants, tentatives conciliation)';

-- Fonction pour calculer et mettre à jour Moutaa automatiquement
CREATE OR REPLACE FUNCTION actualiser_pension_compensatoire(dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_mariage DATE;
  v_revenus_epoux DECIMAL(10,3);
  v_coefficient DECIMAL(4,2);
  v_duree_annees DECIMAL(5,1);
  v_moutaa DECIMAL(10,3);
BEGIN
  -- Récupérer les données du dossier
  SELECT date_mariage, revenus_epoux, COALESCE(coefficient_moutaa, 2.0)
  INTO v_date_mariage, v_revenus_epoux, v_coefficient
  FROM dossiers
  WHERE id = dossier_id;

  -- Vérifier données valides
  IF v_date_mariage IS NULL OR v_revenus_epoux IS NULL OR v_revenus_epoux <= 0 THEN
    RETURN;
  END IF;

  -- Calculer durée mariage
  v_duree_annees := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_date_mariage))::NUMERIC +
                    (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_date_mariage))::NUMERIC / 12);

  -- Calculer Moutaa: Durée (années) × Coefficient (2) × Revenus mensuels
  v_moutaa := (v_duree_annees * v_coefficient * v_revenus_epoux)::DECIMAL(10,3);

  -- Mettre à jour
  UPDATE dossiers
  SET
    duree_mariage_annees = v_duree_annees,
    pension_compensatoire_moutaa = v_moutaa
  WHERE id = dossier_id;
END;
$$;

COMMENT ON FUNCTION actualiser_pension_compensatoire IS 'Calcule et met à jour la pension compensatoire (Moutaa) selon formule CSP: Durée mariage × 2 × Revenus époux';

-- Fonction pour calculer et mettre à jour pension alimentaire enfants
CREATE OR REPLACE FUNCTION actualiser_pension_alimentaire(dossier_id UUID, pourcentage_revenus DECIMAL DEFAULT 25)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenus_pere DECIMAL(10,3);
  v_nb_enfants_mineurs INTEGER;
  v_total_central DECIMAL(10,3);
  v_par_enfant DECIMAL(10,3);
BEGIN
  -- Récupérer revenus père et compter enfants mineurs
  SELECT revenus_pere
  INTO v_revenus_pere
  FROM dossiers
  WHERE id = dossier_id;

  SELECT COUNT(*)
  INTO v_nb_enfants_mineurs
  FROM dossier_enfants
  WHERE dossier_id = actualiser_pension_alimentaire.dossier_id
    AND est_mineur = true;

  -- Vérifier données valides
  IF v_revenus_pere IS NULL OR v_revenus_pere <= 0 OR v_nb_enfants_mineurs = 0 THEN
    RETURN;
  END IF;

  -- Calcul: 25% revenus père ÷ nb enfants
  v_total_central := (v_revenus_pere * pourcentage_revenus / 100)::DECIMAL(10,3);
  v_par_enfant := (v_total_central / v_nb_enfants_mineurs)::DECIMAL(10,3);

  -- Mettre à jour dossier
  UPDATE dossiers
  SET
    pension_alimentaire_par_enfant = v_par_enfant,
    pension_alimentaire_total = v_total_central
  WHERE id = dossier_id;

  -- Mettre à jour chaque enfant mineur
  UPDATE dossier_enfants
  SET pension_alimentaire_montant = v_par_enfant
  WHERE dossier_id = actualiser_pension_alimentaire.dossier_id
    AND est_mineur = true;
END;
$$;

COMMENT ON FUNCTION actualiser_pension_alimentaire IS 'Calcule et met à jour pension alimentaire enfants: 20-30% revenus père (défaut 25%) ÷ nb enfants mineurs';

-- Trigger pour auto-calculer âge et statut mineur des enfants
CREATE OR REPLACE FUNCTION update_enfant_age()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculer âge actuel
  NEW.age_actuel := EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.date_naissance))::INTEGER;

  -- Déterminer si mineur (< 18 ans)
  NEW.est_mineur := (NEW.age_actuel < 18);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_enfant_age
BEFORE INSERT OR UPDATE OF date_naissance ON dossier_enfants
FOR EACH ROW
EXECUTE FUNCTION update_enfant_age();

COMMENT ON FUNCTION update_enfant_age IS 'Trigger: Calcule automatiquement âge et statut mineur enfant à chaque insertion/modification';

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_dossier_enfants_updated_at
BEFORE UPDATE ON dossier_enfants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
