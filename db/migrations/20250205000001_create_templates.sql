-- Création de la table templates pour les modèles de documents juridiques
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL pour templates système publics

  -- Informations du template
  titre TEXT NOT NULL,
  description TEXT,
  type_document TEXT NOT NULL CHECK (type_document IN (
    'assignation', 'requete', 'conclusions_demandeur', 'conclusions_defenseur',
    'constitution_avocat', 'mise_en_demeure', 'appel', 'refere',
    'procuration', 'autre'
  )),

  -- Contenu du template (avec variables {{variable}})
  contenu TEXT NOT NULL,

  -- Variables disponibles (JSON array)
  -- Ex: ["client.nom", "client.cin", "tribunal", "date_audience"]
  variables JSONB DEFAULT '[]'::jsonb,

  -- Métadonnées
  est_public BOOLEAN DEFAULT false, -- Peut être partagé avec d'autres utilisateurs
  nombre_utilisations INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches
CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_type ON templates(type_document);
CREATE INDEX idx_templates_public ON templates(est_public) WHERE est_public = true;

-- RLS (Row Level Security)
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres templates + les templates publics
CREATE POLICY "Users can view own templates and public templates"
  ON templates FOR SELECT
  USING (
    auth.uid() = user_id OR est_public = true OR user_id IS NULL
  );

-- Politique : Les utilisateurs peuvent insérer leurs propres templates
CREATE POLICY "Users can insert own templates"
  ON templates FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Politique : Les utilisateurs peuvent modifier leurs propres templates
CREATE POLICY "Users can update own templates"
  ON templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres templates
CREATE POLICY "Users can delete own templates"
  ON templates FOR DELETE
  USING (auth.uid() = user_id);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION update_templates_updated_at();

-- Insertion de templates par défaut pour la Tunisie (templates système publics)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL, -- Template système public
  'Assignation en matière civile',
  'Modèle d''assignation devant le tribunal de première instance',
  'assignation',
  E'TRIBUNAL DE PREMIÈRE INSTANCE DE {{tribunal}}

ASSIGNATION EN MATIÈRE CIVILE

L''an {{annee}}, le {{date_assignation}}

À la requête de :

{{demandeur.civilite}} {{demandeur.nom}} {{demandeur.prenom}}
Demeurant à {{demandeur.adresse}}
CIN n° {{demandeur.cin}}

Ayant pour avocat :
Maître {{avocat.nom}} {{avocat.prenom}}
Inscrit au Barreau de {{barreau}}

J''ai, {{huissier.nom}}, huissier notaire près le Tribunal de Première Instance de {{tribunal}}, soussigné, donné assignation à :

{{defendeur.civilite}} {{defendeur.nom}} {{defendeur.prenom}}
Demeurant à {{defendeur.adresse}}
CIN n° {{defendeur.cin}}

D''avoir à comparaître devant le Tribunal de Première Instance de {{tribunal}}, le {{date_audience}} à {{heure_audience}}, pour s''entendre condamner à :

{{objet_demande}}

MOTIFS ET MOYENS :

{{motifs}}

DISPOSITIF :

PAR CES MOTIFS,

Plaise au Tribunal :

{{dispositif}}

Sous toutes réserves de droit.

Fait et dressé à {{lieu}}, le {{date_assignation}}

L''Huissier Notaire                    L''Avocat
{{huissier.nom}}                      Me {{avocat.nom}}',
  '["tribunal", "annee", "date_assignation", "demandeur.civilite", "demandeur.nom", "demandeur.prenom", "demandeur.adresse", "demandeur.cin", "avocat.nom", "avocat.prenom", "barreau", "huissier.nom", "defendeur.civilite", "defendeur.nom", "defendeur.prenom", "defendeur.adresse", "defendeur.cin", "date_audience", "heure_audience", "objet_demande", "motifs", "dispositif", "lieu"]'::jsonb,
  true
),
(
  NULL, -- Template système public
  'Constitution d''avocat',
  'Modèle de constitution d''avocat',
  'constitution_avocat',
  E'CONSTITUTION D''AVOCAT

Je soussigné(e) :

{{client.civilite}} {{client.nom}} {{client.prenom}}
Né(e) le {{client.date_naissance}} à {{client.lieu_naissance}}
Demeurant à {{client.adresse}}
CIN n° {{client.cin}}

Déclare constituer pour mon avocat :

Maître {{avocat.nom}} {{avocat.prenom}}
Avocat inscrit au Barreau de {{barreau}}
Cabinet sis à {{avocat.adresse}}

Pour me représenter, assister et défendre mes intérêts dans l''affaire qui m''oppose à :

{{partie_adverse.nom}} {{partie_adverse.prenom}}

Devant le {{juridiction}} de {{ville}}

Dossier n° {{numero_dossier}}

En conséquence, je donne tous pouvoirs à mon avocat pour :
- Me représenter devant toutes les juridictions
- Accomplir tous actes de procédure nécessaires
- Former tous recours et voies de recours
- Transiger si besoin
- Élire domicile en son cabinet

Fait à {{lieu}}, le {{date}}

Signature du client                    Signature de l''avocat
{{client.nom}}                        Me {{avocat.nom}}',
  '["client.civilite", "client.nom", "client.prenom", "client.date_naissance", "client.lieu_naissance", "client.adresse", "client.cin", "avocat.nom", "avocat.prenom", "barreau", "avocat.adresse", "partie_adverse.nom", "partie_adverse.prenom", "juridiction", "ville", "numero_dossier", "lieu", "date"]'::jsonb,
  true
),
(
  NULL, -- Template système public
  'Lettre de mise en demeure',
  'Modèle de lettre de mise en demeure',
  'mise_en_demeure',
  E'{{expediteur.nom}} {{expediteur.prenom}}
{{expediteur.adresse}}

{{destinataire.nom}} {{destinataire.prenom}}
{{destinataire.adresse}}

{{lieu}}, le {{date}}

Objet : Mise en demeure
Lettre recommandée avec accusé de réception

Madame, Monsieur,

Par la présente, je vous mets en demeure de {{objet_mise_en_demeure}}.

En effet, {{motifs}}.

Conformément aux dispositions légales en vigueur, vous disposez d''un délai de {{delai}} jours à compter de la réception de la présente pour {{action_demandee}}.

À défaut de régularisation dans le délai imparti, je me verrai contraint(e) d''engager une procédure judiciaire à votre encontre, aux fins d''obtenir {{recours_envisage}}, et ce, à vos frais, risques et périls.

Je vous prie d''agréer, Madame, Monsieur, l''expression de mes salutations distinguées.

{{expediteur.nom}} {{expediteur.prenom}}

Signature',
  '["expediteur.nom", "expediteur.prenom", "expediteur.adresse", "destinataire.nom", "destinataire.prenom", "destinataire.adresse", "lieu", "date", "objet_mise_en_demeure", "motifs", "delai", "action_demandee", "recours_envisage"]'::jsonb,
  true
);

COMMENT ON TABLE templates IS 'Bibliothèque de templates de documents juridiques réutilisables';
COMMENT ON COLUMN templates.variables IS 'Liste des variables disponibles dans le template (format JSON array)';
COMMENT ON COLUMN templates.est_public IS 'Si true, le template est visible par tous les utilisateurs';
