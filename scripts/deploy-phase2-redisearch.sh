#!/bin/bash
# Script de déploiement Phase 2 RediSearch
# Nettoie, indexe et active RediSearch en production

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Phase 2 RediSearch - Déploiement${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Variables
POSTGRES_CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | head -1)
REDIS_CONTAINER="qadhya-redis"

if [ -z "$POSTGRES_CONTAINER" ]; then
  echo -e "${RED}❌ Container PostgreSQL non trouvé${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Containers trouvés :${NC}"
echo "   PostgreSQL: $POSTGRES_CONTAINER"
echo "   Redis: $REDIS_CONTAINER"
echo ""

# ============================================================================
# Étape 1 : Nettoyer la table sync (reset incohérence)
# ============================================================================
echo -e "${YELLOW}[1/4] Nettoyage table redisearch_sync_status...${NC}"

docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya <<EOF
-- Reset tous les chunks à pending
UPDATE redisearch_sync_status SET sync_status = 'pending', synced_at = NULL;

-- Statistiques après reset
SELECT
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE sync_status='pending') as pending,
  COUNT(*) FILTER (WHERE sync_status='synced') as synced
FROM redisearch_sync_status;
EOF

echo -e "${GREEN}✅ Table nettoyée${NC}"
echo ""

# ============================================================================
# Étape 2 : Créer l'index RediSearch
# ============================================================================
echo -e "${YELLOW}[2/4] Création index RediSearch...${NC}"

# Vérifier si l'index existe déjà
INDEX_EXISTS=$(docker exec "$REDIS_CONTAINER" redis-cli FT._LIST 2>&1 | grep -c "idx:kb_chunks" || true)

if [ "$INDEX_EXISTS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Index existe déjà, suppression...${NC}"
  docker exec "$REDIS_CONTAINER" redis-cli FT.DROPINDEX idx:kb_chunks DD
fi

# Créer l'index RediSearch
# Schema : kb_id (TAG), title (TEXT), content (TEXT), category (TAG),
#          language (TAG), embedding (VECTOR HNSW 1024-dim)
docker exec "$REDIS_CONTAINER" redis-cli FT.CREATE idx:kb_chunks \
  ON HASH PREFIX 1 kb:chunk: \
  SCHEMA \
    kb_id TAG SORTABLE \
    title TEXT WEIGHT 2.0 PHONETIC dm:ar \
    content TEXT WEIGHT 1.0 PHONETIC dm:ar \
    category TAG \
    language TAG \
    embedding VECTOR HNSW 6 TYPE FLOAT32 DIM 1024 DISTANCE_METRIC COSINE

echo -e "${GREEN}✅ Index créé${NC}"
echo ""

# ============================================================================
# Étape 3 : Vérifier l'index
# ============================================================================
echo -e "${YELLOW}[3/4] Vérification index...${NC}"

docker exec "$REDIS_CONTAINER" redis-cli FT.INFO idx:kb_chunks | head -20

echo -e "${GREEN}✅ Index vérifié${NC}"
echo ""

# ============================================================================
# Étape 4 : Lancer l'indexation (via script TypeScript)
# ============================================================================
echo -e "${YELLOW}[4/4] Indexation des chunks (12,838 docs)...${NC}"
echo -e "${BLUE}⏳ Cela va prendre 15-30 minutes...${NC}"
echo ""
echo -e "${YELLOW}Exécutez manuellement :${NC}"
echo -e "  ${GREEN}npx tsx scripts/migrate-to-redisearch.ts${NC}"
echo ""
echo -e "${BLUE}Ou via SSH sur le VPS :${NC}"
echo -e "  ${GREEN}ssh root@84.247.165.187 'cd /opt/moncabinet && docker exec qadhya-nextjs npx tsx scripts/migrate-to-redisearch.ts'${NC}"
echo ""

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Phase 2 - Infrastructure prête !${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${YELLOW}Prochaines étapes :${NC}"
echo "1. Indexer les chunks (commande ci-dessus)"
echo "2. Activer USE_REDISEARCH=true dans .env"
echo "3. Redémarrer container Next.js"
echo "4. Tester la recherche"
