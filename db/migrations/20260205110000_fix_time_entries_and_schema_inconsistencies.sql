-- Migration: Corriger les incohérences du schéma standalone
-- Date: 2026-02-05
-- Description: Ajouter les colonnes manquantes pour time_entries et corriger les noms de colonnes

-- ============================================================================
-- Corriger la table time_entries
-- ============================================================================

-- Ajouter les colonnes manquantes
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS heure_debut TIME,
ADD COLUMN IF NOT EXISTS heure_fin TIME,
ADD COLUMN IF NOT EXISTS facture_id UUID REFERENCES factures(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ajouter montant_calcule comme colonne générée
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS montant_calcule DECIMAL(10,3) GENERATED ALWAYS AS ((duree_minutes::NUMERIC / 60) * COALESCE(taux_horaire, 0)) STORED;

-- Créer les index manquants
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_dossier_id ON time_entries(dossier_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_facturable ON time_entries(facturable);
CREATE INDEX IF NOT EXISTS idx_time_entries_facture_id ON time_entries(facture_id);

-- ============================================================================
-- Note: Les colonnes suivantes ont été renommées dans le schéma standalone
-- et doivent être référencées avec leurs nouveaux noms dans le code :
-- - dossiers.numero_dossier → dossiers.numero
-- - factures.numero_facture → factures.numero
-- - clients.type → clients.type_client
-- - clients.denomination n'existe plus (uniquement pour personnes morales)
-- ============================================================================

COMMENT ON TABLE time_entries IS 'Table de suivi du temps avec support du timer et facturation';
