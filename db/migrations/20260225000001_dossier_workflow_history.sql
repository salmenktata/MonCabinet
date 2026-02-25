-- Migration: Table historique des transitions de workflow des dossiers
-- Date: 2026-02-25

CREATE TABLE IF NOT EXISTS dossier_workflow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  etape_from TEXT,            -- NULL pour la première étape (transition 'initial')
  etape_to TEXT NOT NULL,
  type_transition TEXT NOT NULL CHECK (type_transition IN ('initial', 'normal', 'bypass', 'revert')),
  note TEXT,                  -- Commentaire optionnel de l'avocat (ex: "Renvoi du juge")
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dossier_workflow_history_dossier
  ON dossier_workflow_history(dossier_id, created_at DESC);

-- RLS : chaque avocat voit uniquement ses propres historiques
ALTER TABLE dossier_workflow_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dossier_workflow_history'
      AND policyname = 'dossier_workflow_history_user_policy'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY dossier_workflow_history_user_policy
        ON dossier_workflow_history
        FOR ALL
        USING (user_id = auth.uid())
    $policy$;
  END IF;
END$$;

COMMENT ON TABLE dossier_workflow_history IS 'Traçabilité des transitions de workflow pour chaque dossier juridique';
COMMENT ON COLUMN dossier_workflow_history.type_transition IS 'initial=première étape, normal=étape suivante directe, bypass=saut d''étapes, revert=retour en arrière';
