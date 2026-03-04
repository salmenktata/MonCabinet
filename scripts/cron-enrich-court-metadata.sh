#!/bin/bash
#
# Cron : Enrichissement métadonnées jurisprudence (Cassation + Cour d'Appel)
#
# Extrait numéro de décision, date, chambre via regex pour les pages
# de jurisprudence sans métadonnées structurées.
#
# Schedule recommandé : Hebdomadaire lundi 5h
# Crontab : 0 5 * * 1 /opt/qadhya/scripts/cron-enrich-court-metadata.sh
#
# Logs : /var/log/qadhya/enrich-court-metadata.log
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/enrich-court-metadata.log"

CRON_API_BASE="${CRON_API_BASE:-https://qadhya.tn}"
API_URL="${CRON_API_BASE}/api/admin/kb/enrich-court-metadata"

BATCH_SIZE=50
MAX_BATCHES=10   # 500 pages max/exécution

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🔄 Enrichissement métadonnées jurisprudence"
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

cron_start "enrich-court-metadata" "scheduled"

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    cron_fail "Script terminated with error" $exit_code
  fi
}
trap cleanup EXIT

# Compter pages sans métadonnées
TOTAL_MISSING=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM web_pages wp JOIN web_sources ws ON ws.id = wp.web_source_id LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id WHERE ws.category = 'jurisprudence' AND wp.is_indexed = true AND wpm.id IS NULL;")
TOTAL_MISSING=$(echo "$TOTAL_MISSING" | tr -d ' ')

log "📊 Pages jurisprudence sans métadonnées: $TOTAL_MISSING"

if [ "$TOTAL_MISSING" -eq 0 ]; then
  log "✅ Toutes les pages jurisprudence ont des métadonnées"
  trap - EXIT
  cron_complete '{"totalMissing": 0, "processed": 0, "enriched": 0}'
  exit 0
fi

BATCH_COUNT=0
TOTAL_PROCESSED=0
TOTAL_ENRICHED=0
TOTAL_SKIPPED=0

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"batchSize\":$BATCH_SIZE}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" != "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE)"
    sleep 5
    continue
  fi

  PROCESSED=$(echo "$BODY" | grep -o '"processed":[0-9]*' | cut -d: -f2 || echo "0")
  ENRICHED=$(echo "$BODY" | grep -o '"enriched":[0-9]*' | cut -d: -f2 || echo "0")
  SKIPPED=$(echo "$BODY" | grep -o '"skipped":[0-9]*' | cut -d: -f2 || echo "0")

  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
  TOTAL_ENRICHED=$((TOTAL_ENRICHED + ENRICHED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))

  log "📈 Batch: $PROCESSED traités, $ENRICHED enrichis, $SKIPPED ignorés"

  if [ "$PROCESSED" -eq 0 ]; then
    log "ℹ️  Plus de pages à enrichir"
    break
  fi

  sleep 3
done

# Compter restants
REMAINING=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM web_pages wp JOIN web_sources ws ON ws.id = wp.web_source_id LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id WHERE ws.category = 'jurisprudence' AND wp.is_indexed = true AND wpm.id IS NULL;")
REMAINING=$(echo "$REMAINING" | tr -d ' ')

log "=========================================="
log "✅ Enrichissement terminé"
log "   Batches: $BATCH_COUNT | Traités: $TOTAL_PROCESSED | Enrichis: $TOTAL_ENRICHED"
log "   Pages restantes sans métadonnées: $REMAINING"
log "=========================================="

trap - EXIT
OUTPUT_JSON="{\"totalMissing\": $TOTAL_MISSING, \"processed\": $TOTAL_PROCESSED, \"enriched\": $TOTAL_ENRICHED, \"skipped\": $TOTAL_SKIPPED, \"remaining\": $REMAINING}"
cron_complete "$OUTPUT_JSON"
exit 0
