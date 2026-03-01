-- Migration : Ajout colonne source_reliability sur web_sources
-- Objectif : Stratifier les sources par fiabilité pour le boost RAG
-- Date : 2026-03-01

-- Ajout colonne source_reliability avec contrainte
ALTER TABLE web_sources
  ADD COLUMN IF NOT EXISTS source_reliability TEXT DEFAULT 'verifie'
  CHECK (source_reliability IN ('officiel', 'verifie', 'commentaire', 'non_verifie'));

-- Classification initiale des sources connues
UPDATE web_sources
  SET source_reliability = 'officiel'
  WHERE base_url LIKE '%iort.gov.tn%';

UPDATE web_sources
  SET source_reliability = 'officiel'
  WHERE base_url LIKE '%cassation.tn%';

UPDATE web_sources
  SET source_reliability = 'verifie'
  WHERE base_url LIKE '%9anoun.tn%';

-- Commentaire
COMMENT ON COLUMN web_sources.source_reliability IS
  'Niveau de fiabilité de la source : officiel (IORT, Cassation) | verifie (9anoun.tn) | commentaire | non_verifie';
