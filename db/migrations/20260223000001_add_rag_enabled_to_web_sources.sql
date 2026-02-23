-- Migration: Ajouter rag_enabled sur web_sources
-- Permet de contrôler l'inclusion des docs de cette source dans le RAG,
-- indépendamment de is_active (qui contrôle uniquement le crawl planifié).

ALTER TABLE web_sources ADD COLUMN IF NOT EXISTS rag_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN web_sources.rag_enabled IS 'Si false, les documents de cette source sont exclus du RAG (knowledge_base.is_active = false cascadé)';
