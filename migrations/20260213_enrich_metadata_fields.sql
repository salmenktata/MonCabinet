-- Migration : Enrichissement Métadonnées Structurées (Phase 1.2)
-- Date : 2026-02-13
-- Description : Ajouter de nouveaux champs pour améliorer la qualité des métadonnées juridiques

-- =============================================================================
-- ÉTAPE 1 : Nouveaux champs dans kb_structured_metadata
-- =============================================================================

-- Champ parties : Liste structurée des parties au procès (pour jurisprudence)
-- Format JSON: { "demandeur": "Nom", "défendeur": "Nom", "appellant": "Nom", "intimé": "Nom" }
ALTER TABLE kb_structured_metadata
ADD COLUMN IF NOT EXISTS parties_detailed JSONB DEFAULT NULL;

COMMENT ON COLUMN kb_structured_metadata.parties_detailed IS
'Parties au procès (jurisprudence) - Format JSON structuré avec rôles';

-- Champ summary_ai : Résumé généré par IA (max 500 mots)
ALTER TABLE kb_structured_metadata
ADD COLUMN IF NOT EXISTS summary_ai TEXT DEFAULT NULL;

COMMENT ON COLUMN kb_structured_metadata.summary_ai IS
'Résumé généré par IA (extraction LLM) - Max 500 mots';

-- Champ keywords_extracted : Mots-clés juridiques extraits automatiquement
ALTER TABLE kb_structured_metadata
ADD COLUMN IF NOT EXISTS keywords_extracted TEXT[] DEFAULT NULL;

COMMENT ON COLUMN kb_structured_metadata.keywords_extracted IS
'Mots-clés juridiques extraits automatiquement (IA + regex)';

-- Champ precedent_value : Score d'importance de la jurisprudence (0-1)
-- Calculé via PageRank sur le graphe de citations (Phase 4)
ALTER TABLE kb_structured_metadata
ADD COLUMN IF NOT EXISTS precedent_value FLOAT DEFAULT NULL;

COMMENT ON COLUMN kb_structured_metadata.precedent_value IS
'Score d''importance jurisprudentielle (0-1) - Calculé via PageRank sur graphe citations';

-- Contrainte : precedent_value doit être entre 0 et 1
ALTER TABLE kb_structured_metadata
ADD CONSTRAINT IF NOT EXISTS chk_precedent_value_range
CHECK (precedent_value IS NULL OR (precedent_value >= 0 AND precedent_value <= 1));

-- Champ domain_specific : Métadonnées spécifiques au domaine juridique
-- Format JSON libre pour stocker des infos contextuelles
ALTER TABLE kb_structured_metadata
ADD COLUMN IF NOT EXISTS domain_specific JSONB DEFAULT NULL;

COMMENT ON COLUMN kb_structured_metadata.domain_specific IS
'Métadonnées spécifiques au domaine juridique - Format JSON libre';

-- =============================================================================
-- ÉTAPE 2 : Index pour performance
-- =============================================================================

-- Index GIN pour recherche full-text dans summary_ai
CREATE INDEX IF NOT EXISTS idx_kb_metadata_summary_ai_gin
ON kb_structured_metadata USING GIN (to_tsvector('french', COALESCE(summary_ai, '')));

COMMENT ON INDEX idx_kb_metadata_summary_ai_gin IS
'Index GIN pour recherche full-text dans summary_ai (langue française)';

-- Index GIN pour recherche dans keywords_extracted
CREATE INDEX IF NOT EXISTS idx_kb_metadata_keywords_gin
ON kb_structured_metadata USING GIN (keywords_extracted);

COMMENT ON INDEX idx_kb_metadata_keywords_gin IS
'Index GIN pour recherche rapide dans keywords_extracted';

-- Index B-tree pour tri par precedent_value (ordre décroissant)
CREATE INDEX IF NOT EXISTS idx_kb_metadata_precedent_value
ON kb_structured_metadata (precedent_value DESC NULLS LAST);

COMMENT ON INDEX idx_kb_metadata_precedent_value IS
'Index B-tree pour tri par importance jurisprudentielle (DESC)';

-- Index GIN pour recherche dans domain_specific (JSONB)
CREATE INDEX IF NOT EXISTS idx_kb_metadata_domain_specific_gin
ON kb_structured_metadata USING GIN (domain_specific);

COMMENT ON INDEX idx_kb_metadata_domain_specific_gin IS
'Index GIN pour recherche dans métadonnées spécifiques domaine';

-- =============================================================================
-- ÉTAPE 3 : Vues matérialisées pour statistiques (optionnel)
-- =============================================================================

-- Vue matérialisée : Top 100 arrêts les plus importants (par precedent_value)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_precedents AS
SELECT
  kb.id,
  kb.title,
  m.tribunal_code,
  m.chambre_code,
  m.decision_date,
  m.precedent_value,
  m.keywords_extracted,
  m.summary_ai
FROM kb_structured_metadata m
INNER JOIN knowledge_base kb ON m.knowledge_base_id = kb.id
WHERE m.precedent_value IS NOT NULL
  AND kb.category = 'jurisprudence'
ORDER BY m.precedent_value DESC
LIMIT 100;

COMMENT ON MATERIALIZED VIEW mv_top_precedents IS
'Top 100 arrêts les plus importants (par precedent_value) - Refresh manuel';

-- Index sur la vue matérialisée
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_precedents_id
ON mv_top_precedents (id);

-- =============================================================================
-- ÉTAPE 4 : Fonction utilitaire - Refresh vue matérialisée
-- =============================================================================

-- Fonction pour rafraîchir la vue matérialisée (à appeler après calcul PageRank)
CREATE OR REPLACE FUNCTION refresh_top_precedents()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_precedents;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_top_precedents() IS
'Rafraîchit la vue matérialisée mv_top_precedents (appelée après calcul PageRank)';

-- =============================================================================
-- ÉTAPE 5 : Trigger pour validation automatique (optionnel)
-- =============================================================================

-- Fonction trigger : Valider les keywords_extracted (max 20 mots-clés)
CREATE OR REPLACE FUNCTION validate_keywords_extracted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.keywords_extracted IS NOT NULL THEN
    -- Limiter à 20 mots-clés maximum
    IF array_length(NEW.keywords_extracted, 1) > 20 THEN
      NEW.keywords_extracted := NEW.keywords_extracted[1:20];
    END IF;

    -- Supprimer les doublons
    NEW.keywords_extracted := ARRAY(
      SELECT DISTINCT unnest(NEW.keywords_extracted)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_validate_keywords ON kb_structured_metadata;
CREATE TRIGGER trg_validate_keywords
BEFORE INSERT OR UPDATE ON kb_structured_metadata
FOR EACH ROW
EXECUTE FUNCTION validate_keywords_extracted();

COMMENT ON TRIGGER trg_validate_keywords ON kb_structured_metadata IS
'Valide et normalise keywords_extracted (max 20, dédupliqués)';

-- =============================================================================
-- ÉTAPE 6 : Statistiques (pour suivi migration)
-- =============================================================================

-- Statistiques avant migration (à exécuter en production)
DO $$
DECLARE
  total_docs INTEGER;
  docs_with_metadata INTEGER;
  avg_confidence NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_docs FROM knowledge_base;
  SELECT COUNT(*) INTO docs_with_metadata FROM kb_structured_metadata;
  SELECT ROUND(AVG(extraction_confidence), 2) INTO avg_confidence FROM kb_structured_metadata;

  RAISE NOTICE '=== STATISTIQUES MIGRATION ===';
  RAISE NOTICE 'Total documents KB      : %', total_docs;
  RAISE NOTICE 'Docs avec métadonnées   : %', docs_with_metadata;
  RAISE NOTICE 'Confiance moyenne       : %', avg_confidence;
  RAISE NOTICE 'Nouveaux champs ajoutés : 5 (parties_detailed, summary_ai, keywords_extracted, precedent_value, domain_specific)';
  RAISE NOTICE 'Index créés             : 4 (GIN summary_ai, GIN keywords, B-tree precedent_value, GIN domain_specific)';
END $$;

-- =============================================================================
-- ROLLBACK (si nécessaire)
-- =============================================================================

-- Pour annuler cette migration, exécuter :
/*
DROP MATERIALIZED VIEW IF EXISTS mv_top_precedents CASCADE;
DROP FUNCTION IF EXISTS refresh_top_precedents() CASCADE;
DROP FUNCTION IF EXISTS validate_keywords_extracted() CASCADE;
DROP INDEX IF EXISTS idx_kb_metadata_summary_ai_gin;
DROP INDEX IF EXISTS idx_kb_metadata_keywords_gin;
DROP INDEX IF EXISTS idx_kb_metadata_precedent_value;
DROP INDEX IF EXISTS idx_kb_metadata_domain_specific_gin;
ALTER TABLE kb_structured_metadata DROP COLUMN IF EXISTS parties_detailed;
ALTER TABLE kb_structured_metadata DROP COLUMN IF EXISTS summary_ai;
ALTER TABLE kb_structured_metadata DROP COLUMN IF EXISTS keywords_extracted;
ALTER TABLE kb_structured_metadata DROP COLUMN IF EXISTS precedent_value;
ALTER TABLE kb_structured_metadata DROP COLUMN IF EXISTS domain_specific;
*/
