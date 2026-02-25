-- Migration: Switch Ollama embedding qwen3-embedding:0.6b (1024-dim) → nomic-embed-text (768-dim)
--
-- Contexte (Feb 25, 2026) :
--   - qwen3-embedding:0.6b : fenêtre 2000 chars, 1024-dim → chunks arabes longs tronqués
--   - nomic-embed-text : fenêtre 8192 tokens, 768-dim, meilleur coverage multilingue AR+FR
--
-- Impact :
--   - knowledge_base_chunks.embedding : NULL après migration → re-indexation Ollama progressive requise
--   - knowledge_base.embedding        : idem → NULL après migration
--   - embedding_openai (1536-dim) et embedding_gemini (768-dim) : NON TOUCHÉS → retrieval prod intact
--   - Index IVFFlat Ollama recréés (listes = 100, compatible 768-dim)
--
-- Prérequis VPS : ollama pull nomic-embed-text
-- Re-indexation : cron kb-quality-maintenance ou POST /api/admin/index-kb (CRON_SECRET)
-- =============================================================================

-- =============================================================================
-- 1. knowledge_base_chunks : DROP embedding (1024) → ADD embedding (768)
-- =============================================================================

-- Supprimer l'index IVFFlat existant (1024-dim, incompatible 768)
DROP INDEX IF EXISTS idx_kb_chunks_embedding;

-- DROP + ADD obligatoire : pgvector ne supporte pas ALTER TYPE vector(N) avec données existantes
ALTER TABLE knowledge_base_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_base_chunks ADD COLUMN embedding vector(768);

-- Recréer l'index IVFFlat 768-dim
-- lists=100 : optimal pour ~34K chunks (règle empirique sqrt(n))
CREATE INDEX idx_kb_chunks_embedding
  ON knowledge_base_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMENT ON COLUMN knowledge_base_chunks.embedding IS 'Vecteur Ollama nomic-embed-text 768-dim (migré Feb 25, 2026 depuis qwen3-embedding:0.6b 1024-dim)';

-- =============================================================================
-- 2. knowledge_base : DROP embedding (1024) → ADD embedding (768)
-- =============================================================================

-- Supprimer l'index éventuel sur knowledge_base.embedding
DROP INDEX IF EXISTS idx_kb_embedding;

ALTER TABLE knowledge_base DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_base ADD COLUMN embedding vector(768);

-- Pas d'index IVFFlat sur knowledge_base.embedding (table non utilisée pour la recherche vectorielle directe)

COMMENT ON COLUMN knowledge_base.embedding IS 'Vecteur Ollama nomic-embed-text 768-dim (migré Feb 25, 2026 depuis qwen3-embedding:0.6b 1024-dim)';

-- =============================================================================
-- 3. Vérification post-migration (à exécuter manuellement pour validation)
-- =============================================================================

-- SELECT
--   'knowledge_base_chunks' AS table_name,
--   attname AS column_name,
--   atttypmod AS dimension
-- FROM pg_attribute
-- JOIN pg_class ON pg_class.oid = attrelid
-- WHERE relname = 'knowledge_base_chunks'
--   AND attname = 'embedding';
-- → doit retourner dimension = 768 (atttypmod = 772 = 768 + 4 overhead pgvector)

-- SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding IS NOT NULL;
-- → doit retourner 0 (re-indexation Ollama requise)

-- SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding_openai IS NOT NULL;
-- → inchangé (~33K chunks) — retrieval prod OpenAI non impacté
