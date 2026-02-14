#!/bin/bash
###############################################################################
# Cron Scheduler Worker
# Phase 6.1: Vérifie les crons planifiés et les déclenche
# Cron: * * * * * (toutes les minutes)
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Config
API_URL="${API_URL:-http://host.docker.internal:7002}"
CRON_SECRET="${CRON_SECRET}"
LOG_FILE="/var/log/qadhya/scheduler-worker.log"

# Fonction de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cron_start "scheduler-worker"
trap 'cron_fail "Worker terminated" $?' EXIT

log "🔍 Checking for scheduled crons ready to execute..."

# Récupérer les crons prêts via API PostgreSQL
QUERY_RESPONSE=$(curl -s "$API_URL/api/admin/cron-executions/schedule?status=pending" \
  -H "X-Cron-Secret: $CRON_SECRET" 2>/dev/null || echo '{"success": false}')

SUCCESS=$(echo "$QUERY_RESPONSE" | jq -r '.success // false')

if [[ "$SUCCESS" != "true" ]]; then
  log "⚠️ API error: $(echo "$QUERY_RESPONSE" | jq -r '.error // "Unknown error"')"
  trap - EXIT
  cron_complete '{"checked": 0, "triggered": 0, "errors": 1}'
  exit 0
fi

# Parser la liste des crons planifiés
SCHEDULED_COUNT=$(echo "$QUERY_RESPONSE" | jq -r '.count // 0')

if [[ "$SCHEDULED_COUNT" -eq 0 ]]; then
  log "✅ No crons ready to execute"
  trap - EXIT
  cron_complete '{"checked": 0, "triggered": 0, "errors": 0}'
  exit 0
fi

log "📋 Found $SCHEDULED_COUNT scheduled cron(s)"

TRIGGERED_COUNT=0
ERROR_COUNT=0

# Itérer sur chaque cron prêt
for i in $(seq 0 $((SCHEDULED_COUNT - 1))); do
  CRON_ID=$(echo "$QUERY_RESPONSE" | jq -r ".scheduled[$i].id")
  CRON_NAME=$(echo "$QUERY_RESPONSE" | jq -r ".scheduled[$i].cron_name")
  SCHEDULED_AT=$(echo "$QUERY_RESPONSE" | jq -r ".scheduled[$i].scheduled_at")
  PARAMETERS=$(echo "$QUERY_RESPONSE" | jq -r ".scheduled[$i].parameters // {}")
  CREATED_BY=$(echo "$QUERY_RESPONSE" | jq -r ".scheduled[$i].created_by // \"system\"")

  log "   ⏰ Triggering: $CRON_NAME (ID: $CRON_ID)"
  log "      Scheduled at: $SCHEDULED_AT"
  log "      Created by: $CREATED_BY"

  # Vérifier que scheduled_at est vraiment passé (double-check)
  SCHEDULED_TIMESTAMP=$(date -d "$SCHEDULED_AT" +%s 2>/dev/null || echo 0)
  NOW_TIMESTAMP=$(date +%s)

  if [[ $SCHEDULED_TIMESTAMP -gt $NOW_TIMESTAMP ]]; then
    log "      ⚠️ Still in future, skipping (clock drift?)"
    continue
  fi

  # Déclencher le cron via API trigger
  TRIGGER_PAYLOAD=$(jq -n \
    --arg cronName "$CRON_NAME" \
    --argjson parameters "$PARAMETERS" \
    '{cronName: $cronName, parameters: $parameters}')

  TRIGGER_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/cron-executions/trigger" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "$TRIGGER_PAYLOAD" 2>/dev/null || echo '{"success": false}')

  TRIGGER_SUCCESS=$(echo "$TRIGGER_RESPONSE" | jq -r '.success // false')

  if [[ "$TRIGGER_SUCCESS" == "true" ]]; then
    log "      ✅ Triggered successfully"

    # Récupérer l'execution_id si disponible (sera créé par cron-logger.sh)
    # Pour l'instant on marque juste comme triggered

    # Marquer comme triggered dans scheduled_cron_executions
    UPDATE_RESPONSE=$(curl -s -X PATCH "$API_URL/api/admin/cron-executions/schedule/$CRON_ID/triggered" \
      -H "X-Cron-Secret: $CRON_SECRET" 2>/dev/null || echo '{"success": false}')

    TRIGGERED_COUNT=$((TRIGGERED_COUNT + 1))
  else
    ERROR_MSG=$(echo "$TRIGGER_RESPONSE" | jq -r '.error // "Unknown error"')
    log "      ❌ Failed to trigger: $ERROR_MSG"

    # Marquer comme failed
    FAIL_RESPONSE=$(curl -s -X PATCH "$API_URL/api/admin/cron-executions/schedule/$CRON_ID/failed" \
      -H "Content-Type: application/json" \
      -H "X-Cron-Secret: $CRON_SECRET" \
      -d "{\"error\": \"$ERROR_MSG\"}" 2>/dev/null || true)

    ERROR_COUNT=$((ERROR_COUNT + 1))
  fi
done

log "📊 Summary: $TRIGGERED_COUNT triggered, $ERROR_COUNT errors"

OUTPUT=$(jq -n \
  --argjson checked "$SCHEDULED_COUNT" \
  --argjson triggered "$TRIGGERED_COUNT" \
  --argjson errors "$ERROR_COUNT" \
  '{checked: $checked, triggered: $triggered, errors: $errors}')

trap - EXIT
cron_complete "$OUTPUT"
exit 0
