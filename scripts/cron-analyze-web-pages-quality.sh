#!/bin/bash
#
# Cron : Analyse qualité des web_pages sans quality_score
#
# Traite par batches les pages indexées sans score qualité.
# Utilise DeepSeek comme provider principal (0.78$/mois).
#
# Schedule recommandé : Quotidien 2h du matin
# Crontab : 0 2 * * * /opt/qadhya/scripts/cron-analyze-web-pages-quality.sh
#
# Logs : /var/log/qadhya/analyze-web-pages-quality.log
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/analyze-web-pages-quality.log"

CRON_API_BASE="${CRON_API_BASE:-https://qadhya.tn}"
API_URL="${CRON_API_BASE}/api/admin/web-pages/analyze-quality-batch"

BATCH_SIZE=20
MAX_BATCHES=10   # 200 pages/exécution
PAUSE_BETWEEN=5  # 5s entre batches (éviter surcharge LLM)

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🔄 Analyse qualité web_pages"
log "=========================================="

NEXTJS_CONTAINER=$(docker ps --filter "name=nextjs" --format "{{.Names}}" | head -1)
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)

if [ -z "$NEXTJS_CONTAINER" ] || [ -z "$POSTGRES_CONTAINER" ]; then
  log "❌ ERREUR: Conteneurs Docker non trouvés"
  cron_fail "Conteneurs Docker non trouvés" 1
  exit 1
fi

if [ -z "${CRON_SECRET:-}" ]; then
  CRON_SECRET=$(docker exec "$NEXTJS_CONTAINER" env | grep CRON_SECRET | cut -d= -f2)
  if [ -z "$CRON_SECRET" ]; then
    log "❌ ERREUR: CRON_SECRET vide"
    cron_fail "CRON_SECRET vide" 1
    exit 1
  fi
fi

export CRON_SECRET

cron_start "analyze-web-pages-quality" "scheduled"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "❌ Script terminé avec erreur (exit $exit_code)"
    cron_fail "Script terminated with error" $exit_code
  fi
}
trap cleanup EXIT

# Compter pages sans score
TOTAL_UNSCORED=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM web_pages wp JOIN web_sources ws ON ws.id = wp.web_source_id WHERE wp.is_indexed = true AND ws.rag_enabled = true AND wp.quality_score IS NULL;")
TOTAL_UNSCORED=$(echo "$TOTAL_UNSCORED" | tr -d ' ')

log "📊 Pages sans score qualité (RAG actif): $TOTAL_UNSCORED"

if [ "$TOTAL_UNSCORED" -eq 0 ]; then
  log "✅ Toutes les pages ont déjà un score de qualité"
  trap - EXIT
  cron_complete '{"totalUnscored": 0, "batchesProcessed": 0, "analyzed": 0}'
  exit 0
fi

BATCH_COUNT=0
TOTAL_ANALYZED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"batchSize\":$BATCH_SIZE,\"skipAnalyzed\":true}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" != "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE)"
    sleep $PAUSE_BETWEEN
    continue
  fi

  ANALYZED=$(echo "$BODY" | grep -o '"analyzed":[0-9]*' | cut -d: -f2 || echo "0")
  SUCCEEDED=$(echo "$BODY" | grep -o '"succeeded":[0-9]*' | cut -d: -f2 || echo "0")
  FAILED=$(echo "$BODY" | grep -o '"failed":[0-9]*' | cut -d: -f2 || echo "0")

  TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  log "📈 Batch: $ANALYZED analysées, $SUCCEEDED OK, $FAILED KO"

  if [ "$ANALYZED" -eq 0 ]; then
    log "ℹ️  Plus de pages à analyser"
    break
  fi

  if [ $BATCH_COUNT -lt $MAX_BATCHES ]; then
    sleep $PAUSE_BETWEEN
  fi
done

# Compter restants
REMAINING=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM web_pages wp JOIN web_sources ws ON ws.id = wp.web_source_id WHERE wp.is_indexed = true AND ws.rag_enabled = true AND wp.quality_score IS NULL;")
REMAINING=$(echo "$REMAINING" | tr -d ' ')

log "=========================================="
log "✅ Analyse terminée"
log "   Batches: $BATCH_COUNT | Analysées: $TOTAL_ANALYZED | OK: $TOTAL_SUCCEEDED | KO: $TOTAL_FAILED"
log "   Pages restantes sans score: $REMAINING"
log "=========================================="

trap - EXIT
OUTPUT_JSON="{\"totalUnscored\": $TOTAL_UNSCORED, \"batchesProcessed\": $BATCH_COUNT, \"analyzed\": $TOTAL_ANALYZED, \"succeeded\": $TOTAL_SUCCEEDED, \"failed\": $TOTAL_FAILED, \"remaining\": $REMAINING}"
cron_complete "$OUTPUT_JSON"
exit 0
