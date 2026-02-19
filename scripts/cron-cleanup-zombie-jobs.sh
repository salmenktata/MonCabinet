#!/bin/bash
set -euo pipefail

# Charger library cron-logger
source "$(dirname "$0")/lib/cron-logger.sh"

# Configuration
CRON_NAME="cleanup-zombie-jobs"
TIMEOUT_MINUTES=10
LOG_PREFIX="[Cleanup Zombies]"

# Démarrer l'exécution
EXEC_ID=$(cron_start "$CRON_NAME")

echo "$LOG_PREFIX Démarrage nettoyage jobs zombies..."
echo "$LOG_PREFIX Seuil timeout: $TIMEOUT_MINUTES minutes"

# Nettoyer jobs bloqués > TIMEOUT_MINUTES — récupérer le count directement
CLEANED_COUNT=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -A -c "
WITH cleaned AS (
  UPDATE cron_executions
  SET 
    status = 'failed',
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
    error_message = 'Job zombie auto-nettoyé (bloqué >${TIMEOUT_MINUTES}min)'
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '${TIMEOUT_MINUTES} minutes'
  RETURNING cron_name
)
SELECT COUNT(*) FROM cleaned;
" 2>&1)

# Nettoyer la valeur (enlever espaces/retours)
CLEANED_COUNT=$(echo "$CLEANED_COUNT" | tr -d '[:space:]')

if [ "$CLEANED_COUNT" -gt 0 ] 2>/dev/null; then
  echo "$LOG_PREFIX ✅ $CLEANED_COUNT job(s) zombie(s) nettoyé(s)"
  cron_complete "$CRON_NAME" "$EXEC_ID" 0
else
  echo "$LOG_PREFIX ✅ Aucun job zombie détecté"
  cron_complete "$CRON_NAME" "$EXEC_ID" 0
fi
