-- Migration: Nettoyage chunks orphelins + Rétention logs crons 30j
-- Date: 2026-03-01
-- Contexte: (P3.3) Les chunks KB dont la web_page source a été supprimée restent en DB
--           sans parent valide → faussent les statistiques et consomment de la place.
--           (P4.3) La rétention des logs crons passe de 7j à 30j pour une meilleure
--           visibilité des patterns hebdomadaires.

-- =============================================================================
-- P3.3 : Nettoyage des chunks KB orphelins
-- =============================================================================
-- COLONNE CORRECTE : source_file (pas source_url — vérif Mar 2026)
-- Un chunk KB est "orphelin" au sens strict si :
--   1. son document KB parent a un source_file qui est une URL (source web)
--   2. cette URL n'existe plus dans web_pages
--   3. ET la web_source parente n'existe plus non plus (source supprimée)
--
-- ⚠️ ATTENTION : Ne PAS supprimer les docs dont la source est encore active
-- (web_source existe) — leurs web_pages ont pu être purgées volontairement
-- pour garder seulement le contenu KB. Ex: JIBAYA, WRCATI, Cassation.

-- Requête diagnostic (pas de suppression) :
-- SELECT COUNT(*) FROM knowledge_base kb
-- WHERE kb.source_file LIKE 'http%'
--   AND NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.url = kb.source_file)
--   AND NOT EXISTS (
--     SELECT 1 FROM web_sources ws
--     WHERE kb.source_file LIKE '%' || REPLACE(REPLACE(ws.base_url,'https://',''),'http://','') || '%'
--   );

-- Créer une fonction de nettoyage conservatrice (ne supprime que si source+page absentes)
CREATE OR REPLACE FUNCTION cleanup_orphaned_kb_chunks()
RETURNS TABLE(
  orphaned_docs_deleted INTEGER,
  orphaned_chunks_deleted INTEGER
) AS $$
DECLARE
  chunks_deleted INTEGER;
  docs_deleted INTEGER;
BEGIN
  -- Chunks dont le document KB parent vient d'une source WEB SUPPRIMÉE
  -- (source_file=URL, web_page absente ET web_source absente)
  DELETE FROM knowledge_base_chunks kbc
  WHERE kbc.kb_id IN (
    SELECT kb.id
    FROM knowledge_base kb
    WHERE kb.source_file LIKE 'http%'
      AND NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.url = kb.source_file)
      AND NOT EXISTS (
        SELECT 1 FROM web_sources ws
        WHERE kb.source_file LIKE '%' || REPLACE(REPLACE(ws.base_url,'https://',''),'http://','') || '%'
      )
  );
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;

  -- Documents KB orphelins stricts (source web supprimée + aucun chunk restant)
  DELETE FROM knowledge_base kb
  WHERE kb.source_file LIKE 'http%'
    AND NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.url = kb.source_file)
    AND NOT EXISTS (
      SELECT 1 FROM web_sources ws
      WHERE kb.source_file LIKE '%' || REPLACE(REPLACE(ws.base_url,'https://',''),'http://','') || '%'
    )
    AND NOT EXISTS (SELECT 1 FROM knowledge_base_chunks kbc WHERE kbc.kb_id = kb.id);
  GET DIAGNOSTICS docs_deleted = ROW_COUNT;

  RETURN QUERY SELECT docs_deleted, chunks_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- P4.3 : Rétention logs crons 7j → 30j
-- =============================================================================
-- Modifier la fonction cleanup_old_cron_executions pour utiliser 30 jours
-- (au lieu de 7j) afin de permettre l'analyse des patterns hebdomadaires.

CREATE OR REPLACE FUNCTION cleanup_old_cron_executions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cron_executions
  WHERE started_at < NOW() - INTERVAL '30 days'
    AND status IN ('completed', 'failed', 'cancelled');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_cron_executions() IS
  'Supprime les exécutions cron terminées (completed/failed/cancelled) de plus de 30 jours. '
  'Augmenté de 7j→30j (Mar 2026) pour permettre l''analyse des patterns hebdomadaires.';
