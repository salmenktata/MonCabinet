-- Migration: Champs litiges commerciaux tunisiens
-- Date: 2026-02-05
-- Description: Ajoute colonnes spécifiques pour dossiers commerciaux avec calculs intérêts TMM+7

-- Ajouter colonnes commerciales à la table dossiers
ALTER TABLE dossiers
ADD COLUMN IF NOT EXISTS registre_commerce_demandeur TEXT,
ADD COLUMN IF NOT EXISTS registre_commerce_defendeur TEXT,
ADD COLUMN IF NOT EXISTS type_litige_commercial TEXT CHECK (
  type_litige_commercial IN (
    'cheque_sans_provision',
    'rupture_contrat',
    'concurrence_deloyale',
    'recouvrement',
    'litige_societes',
    'fonds_commerce',
    'bail_commercial'
  )
),
ADD COLUMN IF NOT EXISTS montant_principal DECIMAL(12,3) CHECK (montant_principal >= 0),
ADD COLUMN IF NOT EXISTS date_mise_en_demeure DATE,
ADD COLUMN IF NOT EXISTS taux_interet DECIMAL(5,2) DEFAULT 14.5 CHECK (taux_interet >= 0),
ADD COLUMN IF NOT EXISTS interets_calcules DECIMAL(12,3) DEFAULT 0 CHECK (interets_calcules >= 0),
ADD COLUMN IF NOT EXISTS indemnite_forfaitaire DECIMAL(10,3) DEFAULT 40 CHECK (indemnite_forfaitaire >= 0),
ADD COLUMN IF NOT EXISTS total_du DECIMAL(12,3) GENERATED ALWAYS AS (
  COALESCE(montant_principal, 0) + COALESCE(interets_calcules, 0) + COALESCE(indemnite_forfaitaire, 0)
) STORED,
ADD COLUMN IF NOT EXISTS est_refere BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS date_cheque DATE,
ADD COLUMN IF NOT EXISTS montant_cheque DECIMAL(12,3) CHECK (montant_cheque >= 0),
ADD COLUMN IF NOT EXISTS numero_cheque TEXT,
ADD COLUMN IF NOT EXISTS banque_tiree TEXT;

-- Commentaires explicatifs
COMMENT ON COLUMN dossiers.registre_commerce_demandeur IS 'Numéro registre commerce du demandeur (si société)';
COMMENT ON COLUMN dossiers.registre_commerce_defendeur IS 'Numéro registre commerce du défendeur (si société)';
COMMENT ON COLUMN dossiers.type_litige_commercial IS 'Type de litige commercial: chèque, rupture contrat, concurrence déloyale, etc.';
COMMENT ON COLUMN dossiers.montant_principal IS 'Créance principale en TND (base calcul intérêts)';
COMMENT ON COLUMN dossiers.date_mise_en_demeure IS 'Date mise en demeure = point départ calcul intérêts moratoires';
COMMENT ON COLUMN dossiers.taux_interet IS 'Taux intérêts moratoires annuel (%) - Défaut: TMM+7 = 14.5%';
COMMENT ON COLUMN dossiers.interets_calcules IS 'Montant intérêts moratoires calculés (actualisé manuellement)';
COMMENT ON COLUMN dossiers.indemnite_forfaitaire IS 'Indemnité forfaitaire recouvrement (loi 2017) - Défaut: 40 TND';
COMMENT ON COLUMN dossiers.total_du IS 'Total dû = Principal + Intérêts + Indemnité (calculé automatiquement)';
COMMENT ON COLUMN dossiers.est_refere IS 'Procédure en référé commercial (mesures urgentes)';
COMMENT ON COLUMN dossiers.date_cheque IS 'Date du chèque sans provision (si applicable)';
COMMENT ON COLUMN dossiers.montant_cheque IS 'Montant du chèque sans provision (si applicable)';
COMMENT ON COLUMN dossiers.numero_cheque IS 'Numéro du chèque sans provision';
COMMENT ON COLUMN dossiers.banque_tiree IS 'Banque tirée du chèque sans provision';

-- Index pour recherches commerciales
CREATE INDEX IF NOT EXISTS idx_dossiers_type_litige_commercial ON dossiers(type_litige_commercial) WHERE type_litige_commercial IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossiers_montant_principal ON dossiers(montant_principal) WHERE montant_principal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossiers_date_mise_en_demeure ON dossiers(date_mise_en_demeure) WHERE date_mise_en_demeure IS NOT NULL;

-- Vue pour dossiers commerciaux avec calculs
CREATE OR REPLACE VIEW dossiers_commerciaux AS
SELECT
  d.*,
  CASE
    WHEN d.date_mise_en_demeure IS NOT NULL AND d.montant_principal IS NOT NULL
    THEN (CURRENT_DATE - d.date_mise_en_demeure)::INTEGER
    ELSE 0
  END as jours_retard,
  CASE
    WHEN d.date_mise_en_demeure IS NOT NULL AND d.montant_principal IS NOT NULL
    THEN (
      d.montant_principal *
      (COALESCE(d.taux_interet, 14.5) / 100) *
      ((CURRENT_DATE - d.date_mise_en_demeure)::NUMERIC / 365)
    )::DECIMAL(12,3)
    ELSE 0
  END as interets_a_jour
FROM dossiers d
WHERE d.type_litige_commercial IS NOT NULL;

COMMENT ON VIEW dossiers_commerciaux IS 'Vue dossiers commerciaux avec calcul automatique intérêts à jour';

-- Fonction pour mettre à jour les intérêts calculés
CREATE OR REPLACE FUNCTION actualiser_interets_commerciaux(dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_montant_principal DECIMAL(12,3);
  v_date_mise_en_demeure DATE;
  v_taux_interet DECIMAL(5,2);
  v_jours_retard INTEGER;
  v_interets DECIMAL(12,3);
BEGIN
  -- Récupérer les données du dossier
  SELECT montant_principal, date_mise_en_demeure, COALESCE(taux_interet, 14.5)
  INTO v_montant_principal, v_date_mise_en_demeure, v_taux_interet
  FROM dossiers
  WHERE id = dossier_id;

  -- Vérifier données valides
  IF v_montant_principal IS NULL OR v_date_mise_en_demeure IS NULL THEN
    RETURN;
  END IF;

  -- Calculer jours de retard
  v_jours_retard := (CURRENT_DATE - v_date_mise_en_demeure)::INTEGER;

  -- Calculer intérêts
  v_interets := (v_montant_principal * (v_taux_interet / 100) * (v_jours_retard::DECIMAL / 365))::DECIMAL(12,3);

  -- Mettre à jour
  UPDATE dossiers
  SET interets_calcules = v_interets
  WHERE id = dossier_id;
END;
$$;

COMMENT ON FUNCTION actualiser_interets_commerciaux IS 'Recalcule et met à jour les intérêts moratoires d''un dossier commercial';

-- Fonction pour actualiser tous les dossiers commerciaux actifs
CREATE OR REPLACE FUNCTION actualiser_tous_interets_commerciaux()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_dossier RECORD;
BEGIN
  FOR v_dossier IN
    SELECT id
    FROM dossiers
    WHERE type_litige_commercial IS NOT NULL
      AND montant_principal IS NOT NULL
      AND date_mise_en_demeure IS NOT NULL
      AND statut NOT IN ('TERMINE', 'ABANDONNE')
  LOOP
    PERFORM actualiser_interets_commerciaux(v_dossier.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION actualiser_tous_interets_commerciaux IS 'Actualise les intérêts de tous les dossiers commerciaux actifs - Retourne nombre dossiers mis à jour';

-- Note: Pour automatiser l'actualisation quotidienne avec pg_cron:
-- SELECT cron.schedule(
--   'actualiser-interets-commerciaux',
--   '0 6 * * *', -- 6h00 quotidien
--   $$
--   SELECT actualiser_tous_interets_commerciaux();
--   $$
-- );
