-- Table pour le suivi du temps passé sur les dossiers (time tracking)
CREATE TABLE IF NOT EXISTS public.time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dossier_id UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,

    -- Informations de la session
    description TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_debut TIME,
    heure_fin TIME,
    duree_minutes INTEGER NOT NULL CHECK (duree_minutes >= 0),

    -- Facturation
    taux_horaire NUMERIC(10, 3), -- TND par heure
    montant_calcule NUMERIC(10, 3) GENERATED ALWAYS AS ((duree_minutes::NUMERIC / 60) * COALESCE(taux_horaire, 0)) STORED,
    facturable BOOLEAN NOT NULL DEFAULT true,
    facture_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,

    -- Métadonnées
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_dossier_id ON public.time_entries(dossier_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON public.time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_facturable ON public.time_entries(facturable);
CREATE INDEX IF NOT EXISTS idx_time_entries_facture_id ON public.time_entries(facture_id);

-- Trigger pour updated_at
CREATE TRIGGER update_time_entries_updated_at
    BEFORE UPDATE ON public.time_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres entrées de temps
CREATE POLICY "Users can view their own time entries"
    ON public.time_entries
    FOR SELECT
    USING (user_id = auth.uid());

-- Politique : Les utilisateurs peuvent créer leurs propres entrées de temps
CREATE POLICY "Users can create their own time entries"
    ON public.time_entries
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Politique : Les utilisateurs peuvent modifier leurs propres entrées non facturées
CREATE POLICY "Users can update their own unfactured time entries"
    ON public.time_entries
    FOR UPDATE
    USING (user_id = auth.uid() AND facture_id IS NULL);

-- Politique : Les utilisateurs peuvent supprimer leurs propres entrées non facturées
CREATE POLICY "Users can delete their own unfactured time entries"
    ON public.time_entries
    FOR DELETE
    USING (user_id = auth.uid() AND facture_id IS NULL);

-- Commentaires
COMMENT ON TABLE public.time_entries IS 'Suivi du temps passé sur les dossiers pour facturation';
COMMENT ON COLUMN public.time_entries.duree_minutes IS 'Durée en minutes de la session de travail';
COMMENT ON COLUMN public.time_entries.montant_calcule IS 'Montant calculé automatiquement : (duree_minutes / 60) * taux_horaire';
COMMENT ON COLUMN public.time_entries.facturable IS 'Indique si cette entrée doit être facturée au client';
COMMENT ON COLUMN public.time_entries.facture_id IS 'Référence à la facture si cette entrée a été facturée';
