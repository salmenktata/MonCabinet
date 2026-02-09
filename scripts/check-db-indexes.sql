-- Script de vérification et création d'index DB manquants
-- Améliore les performances des requêtes fréquentes (2x à 10x plus rapide)

\echo '🔍 Vérification des index critiques...'

-- ============================================================================
-- 1. INDEX TABLES PRINCIPALES
-- ============================================================================

\echo '\n📊 Index tables principales (clients, dossiers, documents)...'

-- Clients: recherche par user_id (très fréquent)
CREATE INDEX IF NOT EXISTS idx_clients_user_id
ON clients(user_id);

-- Dossiers: recherche par user_id et client_id
CREATE INDEX IF NOT EXISTS idx_dossiers_user_id
ON dossiers(user_id);

CREATE INDEX IF NOT EXISTS idx_dossiers_client_id
ON dossiers(client_id);

-- Dossiers: recherche par statut (filters)
CREATE INDEX IF NOT EXISTS idx_dossiers_statut
ON dossiers(statut);

-- Documents: recherche par dossier_id
CREATE INDEX IF NOT EXISTS idx_documents_dossier_id
ON documents(dossier_id);

-- ============================================================================
-- 2. INDEX WEB SCRAPING & KNOWLEDGE BASE
-- ============================================================================

\echo '\n🕸️  Index web scraping & knowledge base...'

-- Web pages: recherche par source (très fréquent dans crawler)
CREATE INDEX IF NOT EXISTS idx_web_pages_source_id
ON web_pages(source_id);

-- Web pages: filtre par status (crawled, unchanged, error)
CREATE INDEX IF NOT EXISTS idx_web_pages_status
ON web_pages(status);

-- Web pages: recherche pages non indexées
CREATE INDEX IF NOT EXISTS idx_web_pages_is_indexed
ON web_pages(is_indexed)
WHERE is_indexed = false;

-- Knowledge base: recherche par catégorie
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category
ON knowledge_base(category);

-- Knowledge base: recherche pages non indexées
CREATE INDEX IF NOT EXISTS idx_knowledge_base_is_indexed
ON knowledge_base(is_indexed)
WHERE is_indexed = false;

-- Knowledge base: recherche par source_type et source_id (jointures)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_source
ON knowledge_base(source_type, source_id);

-- ============================================================================
-- 3. INDEX EMBEDDINGS & VECTOR SEARCH
-- ============================================================================

\echo '\n🧠 Index embeddings & vector search...'

-- Embeddings knowledge base: recherche par kb_id (jointures RAG)
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_kb_id
ON knowledge_base_embeddings(knowledge_base_id);

-- Embeddings web pages: recherche par page_id (jointures RAG)
CREATE INDEX IF NOT EXISTS idx_web_page_embeddings_page_id
ON web_page_embeddings(web_page_id);

-- Index HNSW pour recherche vectorielle rapide (pgvector)
-- Note: HNSW est plus rapide que IVFFlat pour < 1M vecteurs
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_vector_hnsw
ON knowledge_base_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_web_page_embeddings_vector_hnsw
ON web_page_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 4. INDEX AUDIT & ACTIVITY
-- ============================================================================

\echo '\n📝 Index audit & activity logs...'

-- Activity logs: recherche par user et timestamp
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
ON activity_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp
ON activity_logs(created_at DESC);

-- Activity logs: filtre par action
CREATE INDEX IF NOT EXISTS idx_activity_logs_action
ON activity_logs(action);

-- ============================================================================
-- 5. INDEX CRAWL JOBS & INDEXING JOBS
-- ============================================================================

\echo '\n⚙️  Index jobs & scheduler...'

-- Crawl jobs: recherche jobs pending/running
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status
ON crawl_jobs(status, next_run_at)
WHERE status IN ('pending', 'running');

-- Crawl jobs: recherche par source_id
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_source_id
ON crawl_jobs(web_source_id);

-- Indexing jobs: recherche jobs pending/running
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status
ON indexing_jobs(status, created_at)
WHERE status IN ('pending', 'in_progress');

-- Indexing jobs: recherche par type
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_type
ON indexing_jobs(job_type);

-- ============================================================================
-- 6. INDEX FEEDBACK & RAG METRICS
-- ============================================================================

\echo '\n💬 Index feedback & RAG metrics...'

-- Chat feedback: recherche par conversation
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conversation_id
ON chat_feedback(conversation_id);

-- RAG metrics: recherche récents pour dashboard
CREATE INDEX IF NOT EXISTS idx_rag_search_metrics_timestamp
ON rag_search_metrics(searched_at DESC);

-- RAG metrics: filtre par user
CREATE INDEX IF NOT EXISTS idx_rag_search_metrics_user_id
ON rag_search_metrics(user_id);

-- ============================================================================
-- RAPPORT DES INDEX CRÉÉS
-- ============================================================================

\echo '\n✅ Index créés ou vérifiés !'
\echo '\n📊 Rapport des index sur les tables principales:\n'

-- Lister tous les index créés par ce script
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_indexes
LEFT JOIN pg_class ON pg_class.relname = indexname
WHERE
  schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY
  tablename,
  indexname;

\echo '\n💡 Conseil: Exécutez ANALYZE après création d\'index pour mettre à jour les statistiques.'
\echo '\n   psql -d qadhya -c "ANALYZE;"'
