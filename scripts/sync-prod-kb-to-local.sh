#!/bin/bash
#
# Sync KB et Web Sources de production vers base locale
# Usage: ./scripts/sync-prod-kb-to-local.sh [--full] [--no-embeddings]
#
# Sans argument    : sync KB + web_sources uniquement (~50 MB)
# --full           : sync KB + web_sources + web_pages (~100 MB)
# --no-embeddings  : exclure les colonnes embedding (dump beaucoup plus léger)
#
# Pré-requis :
#   - Docker local avec qadhya-postgres running (port 5433)
#   - Accès SSH à root@84.247.165.187 (VPS prod)
#
# ⚠️  ATTENTION : Ce script ÉCRASE les données KB/web_sources locales !
#     Les autres tables (users, sessions, dossiers...) ne sont PAS touchées.
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

REMOTE_HOST="root@84.247.165.187"
REMOTE_CONTAINER="qadhya-postgres"
REMOTE_DB="qadhya"
REMOTE_USER="moncabinet"

LOCAL_CONTAINER="qadhya-postgres"
LOCAL_DB="qadhya"
LOCAL_USER="moncabinet"

DUMP_DIR="/tmp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${DUMP_DIR}/qadhya-kb-prod-${TIMESTAMP}.sql"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
FULL_SYNC=false
NO_EMBEDDINGS=false
for arg in "$@"; do
  case $arg in
    --full) FULL_SYNC=true ;;
    --no-embeddings) NO_EMBEDDINGS=true ;;
    --help|-h)
      echo "Usage: $0 [--full] [--no-embeddings]"
      echo ""
      echo "  --full           Inclure web_pages (~+50 MB)"
      echo "  --no-embeddings  Exclure embeddings (dump beaucoup plus léger)"
      echo ""
      echo "Tables synchronisées :"
      echo "  - knowledge_base (~9 000 docs)"
      echo "  - knowledge_base_chunks (~14 300 chunks + embeddings)"
      echo "  - web_sources (~20 sources)"
      echo "  --full: + web_pages (~10 000 pages)"
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue : $arg${NC}"
      echo "Usage: $0 [--full] [--no-embeddings]"
      exit 1
      ;;
  esac
done

# ============================================================================
# Étape 0 : Vérifications pré-requis
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Sync KB Production → Local${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${CYAN}[0/5] Vérification pré-requis...${NC}"

# Vérifier Docker local
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${LOCAL_CONTAINER}$"; then
  echo -e "${RED}Docker container '${LOCAL_CONTAINER}' non trouvé ou arrêté.${NC}"
  echo "Lancez Docker d'abord : docker compose up -d"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker local (${LOCAL_CONTAINER}) running"

# Vérifier accès SSH
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$REMOTE_HOST" "echo ok" &>/dev/null; then
  echo -e "${RED}Accès SSH à ${REMOTE_HOST} impossible.${NC}"
  echo "Vérifiez votre connexion SSH."
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Accès SSH ($REMOTE_HOST) OK"

# Vérifier container prod
if ! ssh "$REMOTE_HOST" "docker ps --format '{{.Names}}' | grep -q '^${REMOTE_CONTAINER}$'" 2>/dev/null; then
  echo -e "${RED}Container '${REMOTE_CONTAINER}' non trouvé sur la prod.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Container prod (${REMOTE_CONTAINER}) running"

# Stats prod
echo ""
echo -e "${CYAN}[1/5] Récupération stats production...${NC}"

PROD_STATS=$(ssh "$REMOTE_HOST" "docker exec ${REMOTE_CONTAINER} psql -U ${REMOTE_USER} -d ${REMOTE_DB} -t -A -c \"
  SELECT json_build_object(
    'kb_docs', (SELECT COUNT(*) FROM knowledge_base),
    'kb_active', (SELECT COUNT(*) FROM knowledge_base WHERE is_active = true),
    'kb_chunks', (SELECT COUNT(*) FROM knowledge_base_chunks),
    'kb_chunks_embed', (SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding IS NOT NULL),
    'kb_chunks_openai', (SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding_openai IS NOT NULL),
    'web_sources', (SELECT COUNT(*) FROM web_sources),
    'web_pages', (SELECT COUNT(*) FROM web_pages)
  );
\"" 2>/dev/null)

# Extraire les valeurs
KB_DOCS=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['kb_docs'])")
KB_ACTIVE=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['kb_active'])")
KB_CHUNKS=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['kb_chunks'])")
KB_EMBED=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['kb_chunks_embed'])")
KB_OPENAI=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['kb_chunks_openai'])")
WEB_SOURCES=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['web_sources'])")
WEB_PAGES=$(echo "$PROD_STATS" | python3 -c "import sys,json; print(json.load(sys.stdin)['web_pages'])")

echo -e "  ${GREEN}KB docs      :${NC} ${KB_DOCS} (${KB_ACTIVE} actifs)"
echo -e "  ${GREEN}KB chunks    :${NC} ${KB_CHUNKS} (${KB_EMBED} Ollama, ${KB_OPENAI} OpenAI)"
echo -e "  ${GREEN}Web sources  :${NC} ${WEB_SOURCES}"
echo -e "  ${GREEN}Web pages    :${NC} ${WEB_PAGES}"

# Confirmation
echo ""
TABLES_LIST="knowledge_base, knowledge_base_chunks, web_sources"
if [ "$FULL_SYNC" = true ]; then
  TABLES_LIST="${TABLES_LIST}, web_pages"
fi

echo -e "${YELLOW}Tables à synchroniser : ${TABLES_LIST}${NC}"
if [ "$NO_EMBEDDINGS" = true ]; then
  echo -e "${YELLOW}Mode : SANS embeddings (dump léger)${NC}"
fi
echo -e "${YELLOW}Les données locales de ces tables seront ÉCRASÉES.${NC}"
echo ""
read -p "Continuer ? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Annulé."
  exit 0
fi

# ============================================================================
# Étape 2 : Préparer le schéma local (colonnes/fonctions manquantes)
# ============================================================================

echo ""
echo -e "${CYAN}[2/5] Préparation schéma local...${NC}"

docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q <<'SCHEMA_SQL'
-- Colonnes potentiellement manquantes sur knowledge_base_chunks
ALTER TABLE knowledge_base_chunks
  ADD COLUMN IF NOT EXISTS embedding_openai vector(1536);
ALTER TABLE knowledge_base_chunks
  ADD COLUMN IF NOT EXISTS content_tsvector tsvector;

-- Colonnes potentiellement manquantes sur knowledge_base
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS subcategory text;

-- Index GIN pour BM25
CREATE INDEX IF NOT EXISTS idx_kb_chunks_tsvector_gin
  ON knowledge_base_chunks USING gin(content_tsvector);

-- Index IVFFlat pour OpenAI embeddings
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_openai_ivfflat
  ON knowledge_base_chunks USING ivfflat (embedding_openai vector_cosine_ops) WITH (lists = 100);

-- Trigger tsvector auto-update
CREATE OR REPLACE FUNCTION kb_chunks_tsvector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('simple', NEW.content);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsvectorupdate ON knowledge_base_chunks;
CREATE TRIGGER tsvectorupdate
  BEFORE INSERT OR UPDATE ON knowledge_base_chunks
  FOR EACH ROW EXECUTE FUNCTION kb_chunks_tsvector_trigger();

-- Fonction search_knowledge_base_flexible
CREATE OR REPLACE FUNCTION search_knowledge_base_flexible(
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count int DEFAULT 5,
  threshold float DEFAULT 0.5,
  use_openai boolean DEFAULT false
)
RETURNS TABLE (
  knowledge_base_id uuid, chunk_id uuid, title text,
  chunk_content text, chunk_index int, similarity float,
  category text, subcategory text, metadata jsonb
) AS $$
BEGIN
  IF use_openai THEN
    RETURN QUERY
    SELECT kbc.knowledge_base_id, kbc.id, kb.title,
      kbc.content, kbc.chunk_index,
      (1 - (kbc.embedding_openai <=> query_embedding))::float,
      kb.category::text, kb.subcategory, kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding_openai IS NOT NULL AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding_openai <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding_openai <=> query_embedding
    LIMIT limit_count;
  ELSE
    RETURN QUERY
    SELECT kbc.knowledge_base_id, kbc.id, kb.title,
      kbc.content, kbc.chunk_index,
      (1 - (kbc.embedding <=> query_embedding))::float,
      kb.category::text, kb.subcategory, kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding IS NOT NULL AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding <=> query_embedding
    LIMIT limit_count;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Wrapper backward-compatible
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count int DEFAULT 5,
  threshold float DEFAULT 0.5
)
RETURNS TABLE (
  knowledge_base_id uuid, chunk_id uuid, title text,
  chunk_content text, chunk_index int, similarity float,
  category text, subcategory text, metadata jsonb
) AS $$
BEGIN
  RETURN QUERY SELECT * FROM search_knowledge_base_flexible(
    query_embedding, category_filter, subcategory_filter,
    limit_count, threshold, false
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction hybrid search (7 params)
CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  query_text text, query_embedding vector,
  category_filter text DEFAULT NULL,
  limit_count integer DEFAULT 15,
  vector_threshold double precision DEFAULT 0.5,
  use_openai boolean DEFAULT false,
  rrf_k integer DEFAULT 60
)
RETURNS TABLE(
  knowledge_base_id uuid, chunk_id uuid, title text,
  chunk_content text, chunk_index integer,
  similarity double precision, bm25_rank double precision,
  hybrid_score double precision, category text,
  subcategory text, metadata jsonb
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH
  vector_results AS (
    SELECT kbc.knowledge_base_id, kbc.id AS chunk_id, kb.title,
      kbc.content AS chunk_content, kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_sim,
      kb.category::text, kb.subcategory, kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2
  ),
  bm25_results AS (
    SELECT kbc.id AS chunk_id,
      ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2
  ),
  fused_results AS (
    SELECT vr.knowledge_base_id, vr.chunk_id, vr.title, vr.chunk_content, vr.chunk_index,
      vr.vec_sim, COALESCE(br.rank, 0) AS bm25_rank,
      vr.category, vr.subcategory, vr.metadata,
      ((0.7 / (rrf_k + vr.vec_rank)) + (0.3 / (rrf_k + COALESCE(br.bm25_rank, limit_count * 2)))) AS hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.chunk_id = br.chunk_id
    UNION
    SELECT kbc.knowledge_base_id, br.chunk_id, kb.title,
      kbc.content AS chunk_content, kbc.chunk_index,
      0.0 AS vec_sim, br.rank AS bm25_rank,
      kb.category::text, kb.subcategory, kb.metadata,
      (0.3 / (rrf_k + br.bm25_rank)) AS hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.chunk_id NOT IN (SELECT chunk_id FROM vector_results)
  )
  SELECT fr.knowledge_base_id, fr.chunk_id, fr.title, fr.chunk_content, fr.chunk_index,
    fr.vec_sim AS similarity, fr.bm25_rank, fr.hybrid_score,
    fr.category, fr.subcategory, fr.metadata
  FROM fused_results fr
  ORDER BY fr.hybrid_score DESC
  LIMIT limit_count;
END
$$;

-- Vues statistiques
CREATE OR REPLACE VIEW vw_kb_search_coverage AS
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS chunks_with_embedding,
  COUNT(*) FILTER (WHERE content_tsvector IS NOT NULL) AS chunks_with_tsvector,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND content_tsvector IS NOT NULL) AS chunks_with_both,
  ROUND(100.0 * COUNT(*) FILTER (WHERE content_tsvector IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_bm25_coverage
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true;

CREATE OR REPLACE VIEW vw_kb_embedding_migration_stats AS
SELECT
  COUNT(*) AS total_chunks,
  COUNT(kbc.embedding) AS chunks_ollama,
  COUNT(kbc.embedding_openai) AS chunks_openai,
  COUNT(CASE WHEN kbc.embedding IS NOT NULL AND kbc.embedding_openai IS NOT NULL THEN 1 END) AS chunks_both,
  COUNT(CASE WHEN kbc.embedding IS NULL AND kbc.embedding_openai IS NULL THEN 1 END) AS chunks_none,
  ROUND(100.0 * COUNT(kbc.embedding_openai) / NULLIF(COUNT(*), 0), 1) AS pct_openai_complete
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true;
SCHEMA_SQL

echo -e "  ${GREEN}✓${NC} Schéma local préparé (colonnes, indexes, fonctions, triggers)"

# ============================================================================
# Étape 3 : Dump sélectif depuis la production
# ============================================================================

echo ""
echo -e "${CYAN}[3/5] Dump sélectif depuis la production...${NC}"

# Construire la liste des tables
TABLES="-t knowledge_base -t knowledge_base_chunks -t web_sources"
if [ "$FULL_SYNC" = true ]; then
  TABLES="${TABLES} -t web_pages"
  echo -e "  Mode complet : KB + web_sources + web_pages"
else
  echo -e "  Mode standard : KB + web_sources"
fi

# Construire les exclude-columns si --no-embeddings
EXCLUDE_COLS=""
if [ "$NO_EMBEDDINGS" = true ]; then
  EXCLUDE_COLS="--exclude-table-data-and-children=knowledge_base_chunks"
  echo -e "  ${YELLOW}Sans embeddings : dump léger (~10 MB)${NC}"
  echo -e "  ${YELLOW}Les embeddings devront être régénérés localement${NC}"
fi

# Exécuter le dump via SSH
echo -e "  Dump en cours (peut prendre 1-5 min selon les embeddings)..."
START_TIME=$(date +%s)

if [ "$NO_EMBEDDINGS" = true ]; then
  # Dump sans embeddings : dump KB sans data, puis insert séparément sans colonnes embedding
  ssh "$REMOTE_HOST" "docker exec ${REMOTE_CONTAINER} pg_dump -U ${REMOTE_USER} -d ${REMOTE_DB} \
    --data-only --no-owner --no-privileges --disable-triggers \
    -t knowledge_base -t web_sources $([ "$FULL_SYNC" = true ] && echo '-t web_pages')" > "$DUMP_FILE"

  # Pour les chunks, on doit exclure les colonnes embedding via COPY avec colonnes explicites
  ssh "$REMOTE_HOST" "docker exec ${REMOTE_CONTAINER} psql -U ${REMOTE_USER} -d ${REMOTE_DB} -c \"
    COPY (SELECT id, knowledge_base_id, chunk_index, content, metadata, created_at
          FROM knowledge_base_chunks) TO STDOUT WITH CSV HEADER\"" > "${DUMP_FILE}.chunks.csv"

  # Ajouter l'import CSV au dump
  cat >> "$DUMP_FILE" <<'CHUNKS_IMPORT'

-- Import chunks sans embeddings (CSV)
\copy knowledge_base_chunks(id, knowledge_base_id, chunk_index, content, metadata, created_at) FROM PROGRAM 'cat /dev/stdin' WITH CSV HEADER
CHUNKS_IMPORT
else
  # Dump complet avec embeddings
  ssh "$REMOTE_HOST" "docker exec ${REMOTE_CONTAINER} pg_dump -U ${REMOTE_USER} -d ${REMOTE_DB} \
    --data-only --no-owner --no-privileges --disable-triggers \
    ${TABLES}" > "$DUMP_FILE"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)

echo -e "  ${GREEN}✓${NC} Dump créé : ${DUMP_FILE} (${DUMP_SIZE}) en ${DURATION}s"

# ============================================================================
# Étape 4 : Nettoyage local + Import
# ============================================================================

echo ""
echo -e "${CYAN}[4/5] Import dans la base locale...${NC}"

# Désactiver triggers FK et truncate les tables
echo -e "  Nettoyage des tables locales..."

TRUNCATE_TABLES="TRUNCATE knowledge_base_chunks CASCADE; TRUNCATE knowledge_base CASCADE; TRUNCATE web_sources CASCADE;"
if [ "$FULL_SYNC" = true ]; then
  TRUNCATE_TABLES="${TRUNCATE_TABLES} TRUNCATE web_pages CASCADE;"
fi

docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q -c "
  SET session_replication_role = 'replica';
  ${TRUNCATE_TABLES}
"
echo -e "  ${GREEN}✓${NC} Tables nettoyées"

# Importer le dump
echo -e "  Import en cours..."
START_TIME=$(date +%s)

if [ "$NO_EMBEDDINGS" = true ]; then
  # Import dump SQL (KB + web_sources)
  docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q \
    -c "SET session_replication_role = 'replica';" < "$DUMP_FILE" 2>&1 | tail -5

  # Import chunks CSV
  docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q \
    -c "SET session_replication_role = 'replica';" \
    -c "\copy knowledge_base_chunks(id, knowledge_base_id, chunk_index, content, metadata, created_at) FROM STDIN WITH CSV HEADER" < "${DUMP_FILE}.chunks.csv" 2>&1 | tail -5
else
  # Import standard
  docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q \
    -c "SET session_replication_role = 'replica';" 2>&1 | tail -1

  docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q < "$DUMP_FILE" 2>&1 | tail -5
fi

# Réactiver les triggers
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q -c "
  SET session_replication_role = 'origin';
"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "  ${GREEN}✓${NC} Import terminé en ${DURATION}s"

# ============================================================================
# Étape 5 : Post-sync (tsvector, stats, vérification)
# ============================================================================

echo ""
echo -e "${CYAN}[5/5] Post-sync : vérifications et indexation...${NC}"

# Régénérer tsvector pour les chunks qui n'en ont pas
echo -e "  Régénération content_tsvector..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -t -A -c "
  UPDATE knowledge_base_chunks
  SET content_tsvector = to_tsvector('simple', content)
  WHERE content_tsvector IS NULL;
" > /dev/null 2>&1
TSVECTOR_COUNT=$(docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -t -A -c "
  SELECT COUNT(*) FROM knowledge_base_chunks WHERE content_tsvector IS NOT NULL;
")
echo -e "  ${GREEN}✓${NC} tsvector : ${TSVECTOR_COUNT} chunks indexés"

# Statistiques finales
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Synchronisation terminée !${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c "
  SELECT
    'knowledge_base' AS table_name,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE is_active = true) AS actifs
  FROM knowledge_base
  UNION ALL
  SELECT
    'knowledge_base_chunks',
    COUNT(*),
    COUNT(*) FILTER (WHERE embedding IS NOT NULL)
  FROM knowledge_base_chunks
  UNION ALL
  SELECT
    'web_sources',
    COUNT(*),
    COUNT(*)
  FROM web_sources
  UNION ALL
  SELECT
    'web_pages',
    COUNT(*),
    COUNT(*)
  FROM web_pages
  ORDER BY table_name;
"

# Stats embeddings
echo ""
echo -e "${CYAN}Embeddings :${NC}"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c "
  SELECT
    COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL) AS ollama_1024,
    COUNT(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) AS openai_1536,
    COUNT(*) FILTER (WHERE kbc.content_tsvector IS NOT NULL) AS bm25_tsvector,
    COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL AND kbc.content_tsvector IS NOT NULL) AS search_ready
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true;
"

# Nettoyage dump
echo ""
echo -e "${CYAN}Nettoyage...${NC}"
rm -f "$DUMP_FILE" "${DUMP_FILE}.chunks.csv" 2>/dev/null
echo -e "  ${GREEN}✓${NC} Fichiers temporaires supprimés"

echo ""
echo -e "${GREEN}Prêt ! Lancez le serveur : npm run dev${NC}"
echo -e "${GREEN}Testez une recherche KB sur http://localhost:7002${NC}"
