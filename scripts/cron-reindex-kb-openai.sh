#!/bin/bash
# =============================================================================
# Cron: Réindexation progressive OpenAI embeddings (quotidien)
# =============================================================================
#
# Réindexe 50 chunks/jour par ordre de priorité d'usage.
# Priorité basée sur: citations chat (40%), qualité (20%), catégorie (20%), recency (20%)
#
# Usage: bash scripts/cron-reindex-kb-openai.sh
# Cron:  0 5 * * * /opt/qadhya/scripts/cron-reindex-kb-openai.sh
#
# Coût estimé: ~$0.05/jour ($1.50/mois)
# Sprint 4 - Février 2026
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="qadhya-nextjs"
CRON_NAME="reindex-kb-openai"
LOG_PREFIX="[Cron:${CRON_NAME}]"

# Charger library cron-logger si disponible
if [ -f "${SCRIPT_DIR}/lib/cron-logger.sh" ]; then
  source "${SCRIPT_DIR}/lib/cron-logger.sh"
fi

# Configuration
DAILY_LIMIT="${DAILY_LIMIT:-50}"
MIN_PRIORITY="${MIN_PRIORITY:-0}"

echo "${LOG_PREFIX} Démarrage réindexation progressive OpenAI..."
echo "${LOG_PREFIX} Limite: ${DAILY_LIMIT} chunks, Priorité min: ${MIN_PRIORITY}"

# Enregistrer début d'exécution
CRON_SECRET="${CRON_SECRET:-}"
CRON_API_BASE="${CRON_API_BASE:-}"

if [ -z "$CRON_SECRET" ]; then
  CRON_SECRET=$(docker exec "$CONTAINER_NAME" printenv CRON_SECRET 2>/dev/null || echo "")
fi

if [ -n "$CRON_SECRET" ] && [ -n "$CRON_API_BASE" ]; then
  curl -sf -X POST "${CRON_API_BASE}/api/admin/crons/start" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -d "{\"cronName\": \"${CRON_NAME}\"}" > /dev/null 2>&1 || true
fi

START_TIME=$(date +%s%3N)

# Exécuter la réindexation dans le container
RESULT=$(docker exec "$CONTAINER_NAME" npx tsx scripts/reindex-kb-openai-progressive.ts \
  --daily-limit "$DAILY_LIMIT" \
  --min-priority "$MIN_PRIORITY" 2>&1) || {
  EXIT_CODE=$?
  echo "${LOG_PREFIX} ❌ Échec réindexation (exit code: ${EXIT_CODE})"
  echo "$RESULT"

  # Reporter l'échec
  END_TIME=$(date +%s%3N)
  DURATION=$((END_TIME - START_TIME))
  if [ -n "$CRON_SECRET" ] && [ -n "$CRON_API_BASE" ]; then
    curl -sf -X POST "${CRON_API_BASE}/api/admin/crons/complete" \
      -H "Content-Type: application/json" \
      -H "X-Cron-Secret: ${CRON_SECRET}" \
      -d "{\"cronName\": \"${CRON_NAME}\", \"status\": \"failed\", \"durationMs\": ${DURATION}, \"metadata\": {\"error\": \"exit code ${EXIT_CODE}\"}}" > /dev/null 2>&1 || true
  fi
  exit $EXIT_CODE
}

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "$RESULT"

# Extraire métriques du résultat
SUCCEEDED=$(echo "$RESULT" | grep -oP 'Succès\s*:\s*\K\d+' | tail -1 || echo "0")
FAILED=$(echo "$RESULT" | grep -oP 'Échecs\s*:\s*\K\d+' | tail -1 || echo "0")

echo "${LOG_PREFIX} ✅ Terminé en ${DURATION}ms (${SUCCEEDED} succès, ${FAILED} échecs)"

# Reporter le succès
if [ -n "$CRON_SECRET" ] && [ -n "$CRON_API_BASE" ]; then
  STATUS="completed"
  if [ "${FAILED}" -gt "0" ] && [ "${SUCCEEDED}" -eq "0" ]; then
    STATUS="failed"
  fi

  curl -sf -X POST "${CRON_API_BASE}/api/admin/crons/complete" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -d "{\"cronName\": \"${CRON_NAME}\", \"status\": \"${STATUS}\", \"durationMs\": ${DURATION}, \"metadata\": {\"succeeded\": ${SUCCEEDED}, \"failed\": ${FAILED}, \"dailyLimit\": ${DAILY_LIMIT}}}" > /dev/null 2>&1 || true
fi
