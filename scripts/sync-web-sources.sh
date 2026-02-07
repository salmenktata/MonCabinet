#!/bin/bash

# ============================================================================
# Script de synchronisation des Web Sources DEV → PROD
# Exporte web_sources, web_pages, web_files et knowledge_base
# Utilise UPSERT (ON CONFLICT DO NOTHING) pour ne pas écraser les données existantes
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXPORT_DIR="$PROJECT_ROOT/exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Sync Web Sources DEV → PROD${NC}"
echo -e "${BLUE}  (UPSERT - sans perte de données)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Créer le dossier d'export
mkdir -p "$EXPORT_DIR"

# Configuration base de données DEV
DEV_DB_CONTAINER=$(docker ps -qf "name=postgres" | head -1)

if [ -z "$DEV_DB_CONTAINER" ]; then
  echo -e "${RED}❌ Container PostgreSQL non trouvé${NC}"
  exit 1
fi

echo -e "${YELLOW}📦 Export des tables web...${NC}"
echo ""

# 1. Export web_sources
echo "  → web_sources (configuration des sources)..."
docker exec -i $DEV_DB_CONTAINER psql -U moncabinet -d moncabinet -c \
  "COPY (SELECT * FROM web_sources) TO STDOUT WITH CSV HEADER" \
  > "$EXPORT_DIR/web_sources_$TIMESTAMP.csv"
WEB_SOURCES_COUNT=$(wc -l < "$EXPORT_DIR/web_sources_$TIMESTAMP.csv" | tr -d ' ')
WEB_SOURCES_COUNT=$((WEB_SOURCES_COUNT - 1))  # Moins l'en-tête
echo -e "     ${GREEN}$WEB_SOURCES_COUNT sources exportées${NC}"

# 2. Export web_pages
echo "  → web_pages (pages crawlées)..."
docker exec -i $DEV_DB_CONTAINER psql -U moncabinet -d moncabinet -c \
  "COPY (SELECT * FROM web_pages) TO STDOUT WITH CSV HEADER" \
  > "$EXPORT_DIR/web_pages_$TIMESTAMP.csv"
WEB_PAGES_COUNT=$(wc -l < "$EXPORT_DIR/web_pages_$TIMESTAMP.csv" | tr -d ' ')
WEB_PAGES_COUNT=$((WEB_PAGES_COUNT - 1))
echo -e "     ${GREEN}$WEB_PAGES_COUNT pages exportées${NC}"

# 3. Export web_files
echo "  → web_files (fichiers téléchargés)..."
docker exec -i $DEV_DB_CONTAINER psql -U moncabinet -d moncabinet -c \
  "COPY (SELECT * FROM web_files) TO STDOUT WITH CSV HEADER" \
  > "$EXPORT_DIR/web_files_$TIMESTAMP.csv"
WEB_FILES_COUNT=$(wc -l < "$EXPORT_DIR/web_files_$TIMESTAMP.csv" | tr -d ' ')
WEB_FILES_COUNT=$((WEB_FILES_COUNT - 1))
echo -e "     ${GREEN}$WEB_FILES_COUNT fichiers exportés${NC}"

# 4. Export knowledge_base (sans chunks - ils seront générés en prod)
echo "  → knowledge_base (documents)..."
docker exec -i $DEV_DB_CONTAINER psql -U moncabinet -d moncabinet -c \
  "COPY (SELECT * FROM knowledge_base) TO STDOUT WITH CSV HEADER" \
  > "$EXPORT_DIR/knowledge_base_$TIMESTAMP.csv"
KB_COUNT=$(wc -l < "$EXPORT_DIR/knowledge_base_$TIMESTAMP.csv" | tr -d ' ')
KB_COUNT=$((KB_COUNT - 1))
echo -e "     ${GREEN}$KB_COUNT documents exportés${NC}"

echo ""
echo -e "${GREEN}✅ Export terminé!${NC}"
echo ""

# Afficher résumé des fichiers
echo "Fichiers créés:"
ls -lh "$EXPORT_DIR"/*_$TIMESTAMP.csv 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'

# Créer le script SQL d'import UPSERT
echo ""
echo -e "${YELLOW}📝 Génération du script SQL d'import UPSERT...${NC}"

cat > "$EXPORT_DIR/import_web_sources_$TIMESTAMP.sql" << 'EOSQL'
-- ============================================================================
-- Script d'import Web Sources DEV → PROD
-- UPSERT avec ON CONFLICT DO NOTHING (ne remplace pas les données existantes)
-- ============================================================================

\echo '=== Début import Web Sources (UPSERT) ==='

-- Désactiver les triggers temporairement
SET session_replication_role = replica;

-- 1. web_sources (ON CONFLICT DO NOTHING)
\echo '→ Import web_sources...'
CREATE TEMP TABLE tmp_web_sources (LIKE web_sources INCLUDING ALL);
\copy tmp_web_sources FROM 'web_sources.csv' WITH CSV HEADER;
INSERT INTO web_sources SELECT * FROM tmp_web_sources
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_sources;

-- 2. web_pages (ON CONFLICT DO NOTHING)
\echo '→ Import web_pages...'
CREATE TEMP TABLE tmp_web_pages (LIKE web_pages INCLUDING ALL);
\copy tmp_web_pages FROM 'web_pages.csv' WITH CSV HEADER;
INSERT INTO web_pages SELECT * FROM tmp_web_pages
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_pages;

-- 3. web_files (ON CONFLICT DO NOTHING)
\echo '→ Import web_files...'
CREATE TEMP TABLE tmp_web_files (LIKE web_files INCLUDING ALL);
\copy tmp_web_files FROM 'web_files.csv' WITH CSV HEADER;
INSERT INTO web_files SELECT * FROM tmp_web_files
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_files;

-- 4. knowledge_base (ON CONFLICT DO NOTHING)
\echo '→ Import knowledge_base...'
CREATE TEMP TABLE tmp_kb (LIKE knowledge_base INCLUDING ALL);
\copy tmp_kb FROM 'knowledge_base.csv' WITH CSV HEADER;
INSERT INTO knowledge_base SELECT * FROM tmp_kb
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_kb;

-- Réactiver les triggers
SET session_replication_role = DEFAULT;

-- Stats finales
\echo ''
\echo '=== Résumé des données en prod ==='
SELECT 'web_sources' as table_name, COUNT(*) as count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY table_name;

\echo ''
\echo '✅ Import UPSERT terminé!'
\echo 'Note: Lancez indexation pour générer les embeddings des nouveaux documents'

EOSQL

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Export Web Sources terminé!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Prochaines étapes:"
echo "  1. Copier exports/ vers le VPS"
echo "  2. Exécuter le script SQL d'import UPSERT"
echo "  3. Lancer l'indexation en prod"
echo ""
echo "Ou utiliser: /sync-prod --web-sources"
echo ""
