-- Migration: Support notes d'honoraires ONAT
-- Date: 2026-02-05
-- Description: Ajoute colonnes pour gérer les différents types d'honoraires conformes ONAT

-- Ajouter colonnes honoraires à la table factures
ALTER TABLE factures
ADD COLUMN IF NOT EXISTS type_honoraires TEXT CHECK (type_honoraires IN ('forfait', 'horaire', 'resultat', 'mixte')),
ADD COLUMN IF NOT EXISTS base_calcul TEXT,
ADD COLUMN IF NOT EXISTS taux_horaire DECIMAL(10,2) CHECK (taux_horaire >= 0),
ADD COLUMN IF NOT EXISTS heures DECIMAL(10,2) CHECK (heures >= 0),
ADD COLUMN IF NOT EXISTS pourcentage_resultat DECIMAL(5,2) CHECK (pourcentage_resultat >= 0 AND pourcentage_resultat <= 100),
ADD COLUMN IF NOT EXISTS montant_debours DECIMAL(10,2) DEFAULT 0 CHECK (montant_debours >= 0),
ADD COLUMN IF NOT EXISTS provisions_recues DECIMAL(10,2) DEFAULT 0 CHECK (provisions_recues >= 0),
ADD COLUMN IF NOT EXISTS solde_a_payer DECIMAL(10,2) GENERATED ALWAYS AS (montant_ttc - provisions_recues) STORED;

-- Commentaires explicatifs
COMMENT ON COLUMN factures.type_honoraires IS 'Type d''honoraires: forfait, horaire (taux × heures), résultat (% gain), ou mixte';
COMMENT ON COLUMN factures.base_calcul IS 'Description textuelle de la base de calcul des honoraires';
COMMENT ON COLUMN factures.taux_horaire IS 'Taux horaire en TND pour type "horaire" ou "mixte"';
COMMENT ON COLUMN factures.heures IS 'Nombre d''heures facturées pour type "horaire" ou "mixte"';
COMMENT ON COLUMN factures.pourcentage_resultat IS 'Pourcentage du résultat obtenu (0-100%) pour type "résultat" ou "mixte"';
COMMENT ON COLUMN factures.montant_debours IS 'Montant total des débours et frais (greffe, huissier, etc.) - séparé des honoraires';
COMMENT ON COLUMN factures.provisions_recues IS 'Total des provisions (acomptes) déjà versées par le client';
COMMENT ON COLUMN factures.solde_a_payer IS 'Solde restant dû = montant_ttc - provisions_recues (calculé automatiquement)';

-- Table détail des débours (optionnelle mais recommandée pour transparence)
CREATE TABLE IF NOT EXISTS facture_debours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  nature TEXT NOT NULL, -- 'Frais greffe', 'Frais huissier', 'Frais expertise', etc.
  date DATE NOT NULL,
  montant DECIMAL(10,2) NOT NULL CHECK (montant >= 0),
  justificatif_url TEXT, -- URL document justificatif (scan reçu/facture)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour débours
CREATE INDEX idx_facture_debours_facture_id ON facture_debours(facture_id);

-- Commentaires
COMMENT ON TABLE facture_debours IS 'Détail des débours et frais par facture pour transparence ONAT';
COMMENT ON COLUMN facture_debours.nature IS 'Nature du débours (greffe, huissier, expert, déplacement, etc.)';
COMMENT ON COLUMN facture_debours.justificatif_url IS 'URL scan du justificatif (reçu, facture) dans Supabase Storage';

-- RLS policies pour facture_debours
ALTER TABLE facture_debours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir les débours de leurs factures"
  ON facture_debours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_debours.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent créer les débours de leurs factures"
  ON facture_debours
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_debours.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent modifier les débours de leurs factures"
  ON facture_debours
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_debours.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent supprimer les débours de leurs factures"
  ON facture_debours
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_debours.facture_id
      AND factures.user_id = auth.uid()
    )
  );

-- Table historique des provisions (optionnelle mais utile pour traçabilité)
CREATE TABLE IF NOT EXISTS facture_provisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  date_versement DATE NOT NULL,
  montant DECIMAL(10,2) NOT NULL CHECK (montant > 0),
  mode_paiement TEXT CHECK (mode_paiement IN ('especes', 'cheque', 'virement', 'flouci', 'carte')),
  reference_paiement TEXT, -- Numéro chèque, référence virement, etc.
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour provisions
CREATE INDEX idx_facture_provisions_facture_id ON facture_provisions(facture_id);

-- Commentaires
COMMENT ON TABLE facture_provisions IS 'Historique des provisions (acomptes) versées par le client';
COMMENT ON COLUMN facture_provisions.mode_paiement IS 'Mode de règlement de la provision';
COMMENT ON COLUMN facture_provisions.reference_paiement IS 'Numéro chèque, référence virement, transaction ID';

-- RLS policies pour facture_provisions
ALTER TABLE facture_provisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir les provisions de leurs factures"
  ON facture_provisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_provisions.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent créer les provisions de leurs factures"
  ON facture_provisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_provisions.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent modifier les provisions de leurs factures"
  ON facture_provisions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_provisions.facture_id
      AND factures.user_id = auth.uid()
    )
  );

CREATE POLICY "Les utilisateurs peuvent supprimer les provisions de leurs factures"
  ON facture_provisions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM factures
      WHERE factures.id = facture_provisions.facture_id
      AND factures.user_id = auth.uid()
    )
  );

-- Fonction trigger pour recalculer solde_a_payer automatiquement
-- Note: Avec GENERATED ALWAYS AS, le calcul est automatique
-- Cette fonction est optionnelle si on veut ajouter une logique métier supplémentaire

-- View pour faciliter les requêtes avec détails honoraires complets
CREATE OR REPLACE VIEW factures_avec_details AS
SELECT
  f.*,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', d.id,
        'nature', d.nature,
        'date', d.date,
        'montant', d.montant,
        'notes', d.notes
      )
      ORDER BY d.date
    )
    FROM facture_debours d
    WHERE d.facture_id = f.id
  ), '[]'::json) as debours_details,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', p.id,
        'date_versement', p.date_versement,
        'montant', p.montant,
        'mode_paiement', p.mode_paiement,
        'reference_paiement', p.reference_paiement
      )
      ORDER BY p.date_versement
    )
    FROM facture_provisions p
    WHERE p.facture_id = f.id
  ), '[]'::json) as provisions_details
FROM factures f;

COMMENT ON VIEW factures_avec_details IS 'Vue enrichie des factures avec détails débours et provisions';

-- Note: RLS policies de la table factures s'appliquent à la vue automatiquement
