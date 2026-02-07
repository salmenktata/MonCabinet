-- Migration: Intégration paiements mobiles Flouci
-- Date: 2026-02-05
-- Description: Table transactions Flouci pour paiements factures par QR code mobile

-- Table transactions Flouci
CREATE TABLE IF NOT EXISTS flouci_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,

  -- Identifiants Flouci
  flouci_payment_id TEXT UNIQUE NOT NULL,
  flouci_transaction_id TEXT,

  -- Montant et devise
  montant DECIMAL(10,3) NOT NULL CHECK (montant > 0),
  devise TEXT DEFAULT 'TND' CHECK (devise IN ('TND')),

  -- Commission Flouci (1.5%)
  commission_flouci DECIMAL(10,3) DEFAULT 0,
  montant_net DECIMAL(10,3) GENERATED ALWAYS AS (montant - COALESCE(commission_flouci, 0)) STORED,

  -- Statut transaction
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'initiated', 'completed', 'failed', 'expired', 'refunded', 'cancelled')
  ),

  -- Client
  client_telephone TEXT,
  client_nom TEXT,

  -- URLs et codes
  qr_code_url TEXT,
  qr_code_data TEXT, -- Données brutes QR code
  payment_url TEXT, -- URL paiement web (fallback)
  deep_link TEXT, -- Deep link app Flouci

  -- Dates
  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '15 minutes'), -- Expiration 15 min

  -- Métadonnées Flouci
  flouci_response JSONB, -- Réponse complète API Flouci
  webhook_received_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Index
  CONSTRAINT flouci_facture_unique UNIQUE (facture_id, flouci_payment_id)
);

-- Index pour recherches
CREATE INDEX IF NOT EXISTS idx_flouci_facture_id ON flouci_transactions(facture_id);
CREATE INDEX IF NOT EXISTS idx_flouci_payment_id ON flouci_transactions(flouci_payment_id);
CREATE INDEX IF NOT EXISTS idx_flouci_status ON flouci_transactions(status);
CREATE INDEX IF NOT EXISTS idx_flouci_completed_at ON flouci_transactions(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flouci_telephone ON flouci_transactions(client_telephone) WHERE client_telephone IS NOT NULL;

-- Commentaires
COMMENT ON TABLE flouci_transactions IS 'Transactions paiements mobiles Flouci pour factures (QR code, commission 1.5%)';
COMMENT ON COLUMN flouci_transactions.flouci_payment_id IS 'ID unique paiement Flouci (payment_id API)';
COMMENT ON COLUMN flouci_transactions.flouci_transaction_id IS 'ID transaction Flouci après confirmation (transaction_id API)';
COMMENT ON COLUMN flouci_transactions.montant IS 'Montant payé par le client en TND';
COMMENT ON COLUMN flouci_transactions.commission_flouci IS 'Commission Flouci 1.5% du montant';
COMMENT ON COLUMN flouci_transactions.montant_net IS 'Montant net reçu = Montant - Commission (calculé automatiquement)';
COMMENT ON COLUMN flouci_transactions.status IS 'Statut: pending → initiated → completed | failed | expired';
COMMENT ON COLUMN flouci_transactions.qr_code_url IS 'URL image QR code Flouci (à scanner avec app)';
COMMENT ON COLUMN flouci_transactions.qr_code_data IS 'Données brutes QR code (pour génération locale si besoin)';
COMMENT ON COLUMN flouci_transactions.payment_url IS 'URL paiement web Flouci (fallback si pas d''app)';
COMMENT ON COLUMN flouci_transactions.deep_link IS 'Deep link pour ouvrir directement app Flouci';
COMMENT ON COLUMN flouci_transactions.expired_at IS 'Date expiration paiement (défaut: 15 minutes)';
COMMENT ON COLUMN flouci_transactions.flouci_response IS 'Réponse complète API Flouci (JSON) pour debug';

-- Vue transactions récentes avec factures
CREATE OR REPLACE VIEW flouci_transactions_recentes AS
SELECT
  ft.*,
  f.numero_facture,
  f.montant_ttc as facture_montant_ttc,
  f.statut as facture_statut,
  c.nom as client_nom_facture,
  c.prenom as client_prenom,
  c.telephone as client_telephone_facture
FROM flouci_transactions ft
JOIN factures f ON ft.facture_id = f.id
JOIN clients c ON f.client_id = c.id
ORDER BY ft.created_at DESC;

COMMENT ON VIEW flouci_transactions_recentes IS 'Vue transactions Flouci récentes avec détails facture et client';

-- Fonction pour calculer commission Flouci (1.5%)
CREATE OR REPLACE FUNCTION calculer_commission_flouci(montant DECIMAL)
RETURNS DECIMAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Commission Flouci: 1.5% du montant
  RETURN ROUND((montant * 0.015)::NUMERIC, 3);
END;
$$;

COMMENT ON FUNCTION calculer_commission_flouci IS 'Calcule commission Flouci (1.5% du montant)';

-- Fonction pour marquer facture comme payée après transaction Flouci réussie
CREATE OR REPLACE FUNCTION marquer_facture_payee_flouci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si transaction completed, marquer facture comme PAYEE
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE factures
    SET
      statut = 'PAYEE',
      date_paiement = NEW.completed_at,
      mode_paiement = 'flouci',
      updated_at = now()
    WHERE id = NEW.facture_id
      AND statut != 'PAYEE'; -- Éviter double paiement

    -- Log
    RAISE NOTICE 'Facture % marquée PAYÉE via Flouci (transaction %)', NEW.facture_id, NEW.flouci_payment_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_flouci_marquer_facture_payee
AFTER INSERT OR UPDATE OF status ON flouci_transactions
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION marquer_facture_payee_flouci();

COMMENT ON FUNCTION marquer_facture_payee_flouci IS 'Trigger: Marque automatiquement facture comme PAYÉE quand transaction Flouci completed';

-- Fonction pour nettoyer transactions expirées (job quotidien recommandé)
CREATE OR REPLACE FUNCTION nettoyer_transactions_flouci_expirees()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Marquer comme expired les transactions pending/initiated au-delà de expired_at
  UPDATE flouci_transactions
  SET
    status = 'expired',
    updated_at = now()
  WHERE status IN ('pending', 'initiated')
    AND expired_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION nettoyer_transactions_flouci_expirees IS 'Marque comme expired les transactions Flouci non complétées après expiration (15 min)';

-- Trigger pour calculer commission automatiquement
CREATE OR REPLACE FUNCTION set_commission_flouci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculer commission si pas déjà définie
  IF NEW.commission_flouci IS NULL OR NEW.commission_flouci = 0 THEN
    NEW.commission_flouci := calculer_commission_flouci(NEW.montant);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_commission_flouci
BEFORE INSERT OR UPDATE OF montant ON flouci_transactions
FOR EACH ROW
EXECUTE FUNCTION set_commission_flouci();

-- Trigger pour updated_at
CREATE TRIGGER trigger_flouci_updated_at
BEFORE UPDATE ON flouci_transactions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Stats Flouci pour tableau de bord
CREATE OR REPLACE VIEW flouci_stats_mensuel AS
SELECT
  DATE_TRUNC('month', completed_at) as mois,
  COUNT(*) as nb_transactions,
  SUM(montant) as montant_total,
  SUM(commission_flouci) as commission_totale,
  SUM(montant_net) as montant_net_total,
  AVG(montant) as montant_moyen,
  COUNT(*) FILTER (WHERE status = 'completed') as nb_reussies,
  COUNT(*) FILTER (WHERE status = 'failed') as nb_echouees,
  COUNT(*) FILTER (WHERE status = 'expired') as nb_expirees
FROM flouci_transactions
WHERE completed_at IS NOT NULL
GROUP BY DATE_TRUNC('month', completed_at)
ORDER BY mois DESC;

COMMENT ON VIEW flouci_stats_mensuel IS 'Statistiques mensuelles transactions Flouci (montants, commissions, taux succès)';

-- Note: Pour automatiser le nettoyage quotidien avec pg_cron:
-- SELECT cron.schedule(
--   'nettoyer-flouci-expired',
--   '0 2 * * *', -- 2h00 quotidien
--   $$
--   SELECT nettoyer_transactions_flouci_expirees();
--   $$
-- );
