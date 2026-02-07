-- Migration : Ajouter le champ langue aux templates
-- Date : 2026-02-06
-- Description : Support bilingue FR/AR pour les templates

-- Ajouter la colonne langue
ALTER TABLE templates ADD COLUMN IF NOT EXISTS langue TEXT DEFAULT 'fr'
  CHECK (langue IN ('fr', 'ar'));

-- Index pour filtrage par langue
CREATE INDEX IF NOT EXISTS idx_templates_langue ON templates(langue);

-- Fonction pour détecter automatiquement la langue basée sur le contenu
CREATE OR REPLACE FUNCTION detect_template_language(content TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Détecter la présence de caractères arabes (plage Unicode arabe)
  IF content ~ '[\u0600-\u06FF]' THEN
    RETURN 'ar';
  ELSE
    RETURN 'fr';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mettre à jour les templates existants avec la langue détectée
UPDATE templates
SET langue = detect_template_language(contenu)
WHERE langue IS NULL OR langue = 'fr';

-- Mettre à jour les templates arabes connus par leur titre
UPDATE templates SET langue = 'ar' WHERE titre LIKE '%عربي%' OR titre LIKE '%مطلب%' OR titre LIKE '%مرافعات%' OR titre LIKE '%وكالة%' OR titre LIKE '%اتفاقية%';

-- Trigger pour détecter automatiquement la langue à l'insertion
CREATE OR REPLACE FUNCTION set_template_language()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la langue n'est pas spécifiée, la détecter automatiquement
  IF NEW.langue IS NULL THEN
    NEW.langue := detect_template_language(NEW.contenu);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS templates_auto_language ON templates;

-- Créer le trigger
CREATE TRIGGER templates_auto_language
  BEFORE INSERT OR UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION set_template_language();

COMMENT ON COLUMN templates.langue IS 'Langue du template: fr (français) ou ar (arabe)';
