#!/bin/bash
# Script d'indexation progressive via API endpoints
# Indexe knowledge_base ET web_pages (2 docs par batch chacun)

set -e

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Détection auto nom container (robuste)
NEXTJS_CONTAINER=$(docker ps --filter "name=nextjs" --format "{{.Names}}" | head -1)

if [ -z "$NEXTJS_CONTAINER" ]; then
  echo "❌ ERREUR: Conteneur Next.js non trouvé"
  exit 1
fi

CRON_SECRET=$(docker exec "$NEXTJS_CONTAINER" env | grep CRON_SECRET | cut -d= -f2)
LOG_FILE="/var/log/qadhya/kb-indexing.log"

# Configurer cron-logger
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking
cron_start "index-kb" "scheduled"
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

echo "$(date '+%Y-%m-%d %H:%M:%S') - === Début cycle indexation ===" >> $LOG_FILE

# =============================================================================
# 1. Indexer knowledge_base (documents uploadés)
# =============================================================================
echo "$(date '+%Y-%m-%d %H:%M:%S') - [KB] Indexation knowledge_base..." >> $LOG_FILE

KB_RESPONSE=$(timeout 240 curl -s -X GET "http://127.0.0.1:3000/api/admin/index-kb" \
  -H "Authorization: Bearer $CRON_SECRET" 2>&1)

KB_EXIT=$?
KB_INDEXED=0

if [ $KB_EXIT -eq 124 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [KB] ⚠️ Timeout après 4 minutes" >> $LOG_FILE
elif [ $KB_EXIT -eq 0 ]; then
  KB_INDEXED=$(echo "$KB_RESPONSE" | jq -r '.indexed // 0' 2>/dev/null || echo "0")
  KB_SUMMARY=$(echo "$KB_RESPONSE" | grep -o '"indexed":[0-9]*' | head -1)
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [KB] ✓ $KB_SUMMARY" >> $LOG_FILE
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [KB] ✗ Erreur (code: $KB_EXIT)" >> $LOG_FILE
fi

# =============================================================================
# 2. Indexer web_pages (pages crawlées)
# =============================================================================
echo "$(date '+%Y-%m-%d %H:%M:%S') - [WEB] Indexation web_pages..." >> $LOG_FILE

WEB_RESPONSE=$(timeout 290 curl -s -X GET "http://127.0.0.1:3000/api/admin/index-web-pages" \
  -H "Authorization: Bearer $CRON_SECRET" 2>&1)

WEB_EXIT=$?
WEB_INDEXED=0

if [ $WEB_EXIT -eq 124 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [WEB] ⚠️ Timeout après 4 minutes" >> $LOG_FILE
elif [ $WEB_EXIT -eq 0 ]; then
  WEB_INDEXED=$(echo "$WEB_RESPONSE" | jq -r '.indexed // 0' 2>/dev/null || echo "0")
  WEB_SUMMARY=$(echo "$WEB_RESPONSE" | grep -o '"indexed":[0-9]*' | head -1)
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [WEB] ✓ $WEB_SUMMARY" >> $LOG_FILE
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') - [WEB] ✗ Erreur (code: $WEB_EXIT)" >> $LOG_FILE
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - === Fin cycle indexation ===" >> $LOG_FILE

# Cleanup trap
trap - EXIT

# Enregistrer succès avec métriques
TOTAL_INDEXED=$((KB_INDEXED + WEB_INDEXED))

OUTPUT_JSON=$(cat <<EOF
{
  "kbIndexed": $KB_INDEXED,
  "kbExitCode": $KB_EXIT,
  "webIndexed": $WEB_INDEXED,
  "webExitCode": $WEB_EXIT,
  "totalIndexed": $TOTAL_INDEXED
}
EOF
)

cron_complete "$OUTPUT_JSON"

exit 0
