#!/bin/bash
#
# Cron automatique : Re-consolidation des documents juridiques stale
#
# Trouve les legal_documents dont les pages ont été crawlées après la
# dernière consolidation et les re-consolide par batch.
#
# Schedule recommandé : Quotidien à 2h du matin (après le crawl nocturne)
# Crontab : 0 2 * * * /opt/qadhya/scripts/cron-reconsolidate-legal-docs.sh
#
# Logs : /var/log/qadhya/reconsolidate-legal-docs.log
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Charger library cron logging
source "$SCRIPT_DIR/lib/cron-logger.sh"

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/reconsolidate-legal-docs.log"

CRON_API_BASE="${CRON_API_BASE:-http://localhost:3000}"
API_URL="${CRON_API_BASE}/api/admin/legal-documents/reconsolidate"

BATCH_SIZE=20
MAX_BATCHES=3  # Maximum 3 batches = 60 docs/nuit

# Créer répertoire logs si nécessaire
mkdir -p "$LOG_DIR"

# Fonction de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Début re-consolidation documents juridiques"
log "=========================================="

# Détecter noms des conteneurs
NEXTJS_CONTAINER=$(docker ps --filter "name=nextjs" --format "{{.Names}}" | head -1)
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)

if [ -z "$NEXTJS_CONTAINER" ] || [ -z "$POSTGRES_CONTAINER" ]; then
  log "❌ ERREUR: Conteneurs Docker non trouvés"
  cron_fail "Conteneurs Docker non trouvés" 1
  exit 1
fi

log "🐳 Conteneurs détectés:"
log "   Next.js: $NEXTJS_CONTAINER"
log "   PostgreSQL: $POSTGRES_CONTAINER"

# Récupérer CRON_SECRET
if [ -z "${CRON_SECRET:-}" ]; then
  log "🔑 Récupération CRON_SECRET depuis container..."
  if ! CRON_SECRET=$(docker exec "$NEXTJS_CONTAINER" env | grep CRON_SECRET | cut -d= -f2); then
    log "❌ ERREUR: Impossible de récupérer CRON_SECRET"
    cron_fail "Impossible de récupérer CRON_SECRET" 1
    exit 1
  fi
  if [ -z "$CRON_SECRET" ]; then
    log "❌ ERREUR: CRON_SECRET vide"
    cron_fail "CRON_SECRET vide" 1
    exit 1
  fi
else
  log "✅ CRON_SECRET trouvé en environnement"
fi
export CRON_SECRET

# Compter documents stale avant traitement
TOTAL_STALE=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM legal_documents ld
   WHERE ld.consolidation_status != 'pending'
     AND EXISTS (
       SELECT 1 FROM web_pages_documents wpd
       JOIN web_pages wp ON wpd.web_page_id = wp.id
       WHERE wpd.legal_document_id = ld.id
         AND wp.last_crawled_at > ld.updated_at
     );" 2>/dev/null | tr -d ' \n')

log "📊 Documents stale à re-consolider: ${TOTAL_STALE:-0}"

if [ "${TOTAL_STALE:-0}" -eq 0 ]; then
  log "✅ Aucun document stale à re-consolider"
  OUTPUT_JSON="{\"totalStale\": 0, \"batchesProcessed\": 0, \"processed\": 0, \"succeeded\": 0, \"failed\": 0}"
  cron_start "reconsolidate-legal-docs" "scheduled"
  cron_complete "$OUTPUT_JSON"
  exit 0
fi

# Démarrer tracking cron
cron_start "reconsolidate-legal-docs" "scheduled"

# Fonction trap pour cleanup
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "❌ Script terminé avec erreur (exit $exit_code)"
    cron_fail "Script terminated with error" $exit_code
  fi
}
trap cleanup EXIT

# Traitement par batch
BATCH_COUNT=0
TOTAL_PROCESSED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"batchSize\": $BATCH_SIZE}" \
    -w "\n%{http_code}" \
    --max-time 280)

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" != "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE): $BODY"
    trap - EXIT
    cron_fail "API error HTTP $HTTP_CODE" 1
    exit 1
  fi

  BATCH_PROCESSED=$(echo "$BODY" | grep -o '"processed":[0-9]*' | head -1 | cut -d: -f2)
  BATCH_SUCCEEDED=$(echo "$BODY" | grep -o '"succeeded":[0-9]*' | head -1 | cut -d: -f2)
  BATCH_FAILED=$(echo "$BODY" | grep -o '"failed":[0-9]*' | head -1 | cut -d: -f2)
  REMAINING=$(echo "$BODY" | grep -o '"remaining":[0-9]*' | head -1 | cut -d: -f2)

  log "📈 Résultat batch:"
  log "   - Traités: ${BATCH_PROCESSED:-0}"
  log "   - Succès: ${BATCH_SUCCEEDED:-0}"
  log "   - Échecs: ${BATCH_FAILED:-0}"
  log "   - Restants: ${REMAINING:-0}"

  TOTAL_PROCESSED=$((TOTAL_PROCESSED + ${BATCH_PROCESSED:-0}))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + ${BATCH_SUCCEEDED:-0}))
  TOTAL_FAILED=$((TOTAL_FAILED + ${BATCH_FAILED:-0}))

  # Arrêter si aucun doc traité (queue vide)
  if [ "${BATCH_PROCESSED:-0}" -eq 0 ]; then
    log "ℹ️  Aucun document restant, arrêt"
    break
  fi

  # Pause entre batches
  if [ $BATCH_COUNT -lt $MAX_BATCHES ] && [ "${REMAINING:-0}" -gt 0 ]; then
    log "⏸️  Pause 3s avant prochain batch..."
    sleep 3
  else
    break
  fi
done

log "=========================================="
log "✅ Re-consolidation terminée"
log "=========================================="
log "📊 Résumé:"
log "   - Documents stale initiaux: ${TOTAL_STALE}"
log "   - Batches traités: $BATCH_COUNT"
log "   - Documents traités: $TOTAL_PROCESSED"
log "   - Succès: $TOTAL_SUCCEEDED"
log "   - Échecs: $TOTAL_FAILED"
log "=========================================="

trap - EXIT

OUTPUT_JSON="{\"totalStale\": ${TOTAL_STALE}, \"batchesProcessed\": $BATCH_COUNT, \"processed\": $TOTAL_PROCESSED, \"succeeded\": $TOTAL_SUCCEEDED, \"failed\": $TOTAL_FAILED}"
cron_complete "$OUTPUT_JSON"

log "🎉 Script terminé avec succès"
exit 0
