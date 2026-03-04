#!/bin/bash
#
# Cron : Re-chunking des documents avec chunks > 5000 chars
#
# Identifie et re-chunke les documents dont certains chunks dépassent
# le seuil CHUNK_MAX_CHARS=5000 (audit-rag-data-quality).
# Régénère aussi les embeddings Ollama + OpenAI.
#
# Schedule recommandé : Hebdomadaire dimanche 4h
# Crontab : 0 4 * * 0 /opt/qadhya/scripts/cron-rechunk-large.sh
#
# Logs : /var/log/qadhya/rechunk-large.log
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/rechunk-large.log"

CRON_API_BASE="${CRON_API_BASE:-https://qadhya.tn}"
# Utiliser localhost pour éviter timeout Nginx sur rechunk (opération longue)
API_URL_LOCAL="http://localhost:3000/api/admin/kb/rechunk-large"
API_URL="${CRON_API_BASE}/api/admin/kb/rechunk-large"

BATCH_SIZE=5      # 5 docs/appel (rechunk + embeddings = lent)
MAX_BATCHES=10    # 50 docs max
MAX_CHUNK_CHARS=5000
PAUSE_BETWEEN=10  # 10s (laisse Ollama se reposer)

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🔧 Re-chunking documents surdimensionnés"
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

cron_start "rechunk-large" "scheduled"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    cron_fail "Script terminated with error" $exit_code
  fi
}
trap cleanup EXIT

# Compter docs avec chunks > 5000 chars
TOTAL_LARGE=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(DISTINCT kb.id) FROM knowledge_base kb JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id WHERE kb.is_active = true AND LENGTH(kbc.content) > $MAX_CHUNK_CHARS;")
TOTAL_LARGE=$(echo "$TOTAL_LARGE" | tr -d ' ')

log "📊 Documents avec chunks > ${MAX_CHUNK_CHARS} chars: $TOTAL_LARGE"

if [ "$TOTAL_LARGE" -eq 0 ]; then
  log "✅ Aucun document avec chunks trop grands"
  trap - EXIT
  cron_complete '{"totalLarge": 0, "processed": 0, "succeeded": 0}'
  exit 0
fi

BATCH_COUNT=0
TOTAL_PROCESSED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"

  # Appel via localhost (bypass Nginx timeout)
  RESPONSE=$(docker exec "$NEXTJS_CONTAINER" curl -s -w "\n%{http_code}" -X POST "$API_URL_LOCAL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"batchSize\":$BATCH_SIZE,\"maxChunkChars\":$MAX_CHUNK_CHARS}" \
    --max-time 280)

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" != "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE)"
    sleep $PAUSE_BETWEEN
    continue
  fi

  PROCESSED=$(echo "$BODY" | grep -o '"processed":[0-9]*' | cut -d: -f2 || echo "0")
  SUCCEEDED=$(echo "$BODY" | grep -o '"succeeded":[0-9]*' | cut -d: -f2 || echo "0")
  FAILED=$(echo "$BODY" | grep -o '"failed":[0-9]*' | cut -d: -f2 || echo "0")
  REMAINING=$(echo "$BODY" | grep -o '"remaining":[0-9]*' | cut -d: -f2 || echo "?")

  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  log "📈 Batch: $PROCESSED traités, $SUCCEEDED OK, $FAILED KO | Restants: $REMAINING"

  if [ "$PROCESSED" -eq 0 ]; then
    log "ℹ️  Plus de documents à rechunker"
    break
  fi

  if [ $BATCH_COUNT -lt $MAX_BATCHES ]; then
    sleep $PAUSE_BETWEEN
  fi
done

log "=========================================="
log "✅ Re-chunking terminé"
log "   Batches: $BATCH_COUNT | Traités: $TOTAL_PROCESSED | OK: $TOTAL_SUCCEEDED | KO: $TOTAL_FAILED"
log "=========================================="

trap - EXIT
OUTPUT_JSON="{\"totalLarge\": $TOTAL_LARGE, \"batchesProcessed\": $BATCH_COUNT, \"processed\": $TOTAL_PROCESSED, \"succeeded\": $TOTAL_SUCCEEDED, \"failed\": $TOTAL_FAILED}"
cron_complete "$OUTPUT_JSON"
exit 0
