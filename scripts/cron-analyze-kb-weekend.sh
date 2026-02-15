#!/bin/bash
#
# Cron week-end : Analyse massive qualité KB avec Ollama (gratuit)
#
# Ce script s'exécute uniquement les week-ends (sam/dim) pour analyser
# en masse les documents KB restants sans coût OpenAI.
#
# Schedule recommandé : Sam & Dim toutes les 2h (8h-22h)
# Crontab : 0 8,10,12,14,16,18,20,22 * * 6,0 /opt/qadhya/scripts/cron-analyze-kb-weekend.sh
#
# Logs : /var/log/qadhya/analyze-kb-weekend.log
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Charger library cron logging
source "$SCRIPT_DIR/lib/cron-logger.sh"

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/analyze-kb-weekend.log"

# Utiliser CRON_API_BASE depuis env (injecté par trigger server) ou défaut
CRON_API_BASE="${CRON_API_BASE:-https://qadhya.tn}"
API_URL="${CRON_API_BASE}/api/admin/kb/analyze-quality"

# Configuration batch - plus agressif le week-end
BATCH_SIZE=20           # 20 docs par appel (Ollama local = pas de coût)
MAX_BATCHES=10          # 10 batches = 200 docs/exécution
PAUSE_BETWEEN_BATCHES=3 # 3s entre batches

# Créer répertoire logs si nécessaire
mkdir -p "$LOG_DIR"

# Fonction de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🔄 Analyse massive KB week-end (Ollama)"
log "=========================================="
log "Configuration:"
log "  - Batch size: $BATCH_SIZE docs"
log "  - Max batches: $MAX_BATCHES"
log "  - Pause: ${PAUSE_BETWEEN_BATCHES}s"
log "  - Max docs: $((BATCH_SIZE * MAX_BATCHES))"

# Détecter conteneur Next.js
NEXTJS_CONTAINER=$(docker ps --filter "name=nextjs" --format "{{.Names}}" | head -1)
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)

if [ -z "$NEXTJS_CONTAINER" ] || [ -z "$POSTGRES_CONTAINER" ]; then
  log "❌ ERREUR: Conteneurs Docker non trouvés"
  cron_fail "Conteneurs Docker non trouvés" 1
  exit 1
fi

# Récupérer CRON_SECRET (priorité: env var > docker exec)
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

# Démarrer tracking cron
cron_start "analyze-kb-weekend" "scheduled"

# Fonction trap pour cleanup
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "❌ Script terminé avec erreur (exit $exit_code)"
    cron_fail "Script terminated with error" $exit_code
  fi
}

trap cleanup EXIT

# Compter documents non analysés
log "📊 Comptage documents non analysés..."
TOTAL_UNANALYZED=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE quality_score IS NULL AND is_active = true;")
TOTAL_UNANALYZED=$(echo "$TOTAL_UNANALYZED" | tr -d ' ')

log "📊 Documents sans score qualité: $TOTAL_UNANALYZED"

if [ "$TOTAL_UNANALYZED" -eq 0 ]; then
  log "✅ Tous les documents ont déjà un score de qualité !"
  trap - EXIT
  cron_complete '{"totalUnanalyzed": 0, "batchesProcessed": 0, "analyzed": 0, "succeeded": 0, "failed": 0}'
  exit 0
fi

# Calculer batches nécessaires
NEEDED=$((TOTAL_UNANALYZED < BATCH_SIZE * MAX_BATCHES ? TOTAL_UNANALYZED : BATCH_SIZE * MAX_BATCHES))
log "🎯 Objectif cette exécution: ~$NEEDED documents"

# Traitement par batch
BATCH_COUNT=0
TOTAL_ANALYZED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  BATCH_START=$(date +%s)

  # Appel API analyse qualité
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"batchSize\":$BATCH_SIZE,\"skipAnalyzed\":true}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" != "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE)"
    log "   Body: $(echo "$BODY" | head -5)"
    # Ne pas exit, continuer avec le prochain batch
    sleep $PAUSE_BETWEEN_BATCHES
    continue
  fi

  # Parser résultat
  SUCCESS=$(echo "$BODY" | grep -o '"success":true' || echo "")
  if [ -z "$SUCCESS" ]; then
    ERROR=$(echo "$BODY" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    log "❌ API error: $ERROR"
    sleep $PAUSE_BETWEEN_BATCHES
    continue
  fi

  ANALYZED=$(echo "$BODY" | grep -o '"analyzed":[0-9]*' | cut -d: -f2 || echo "0")
  SUCCEEDED=$(echo "$BODY" | grep -o '"succeeded":[0-9]*' | cut -d: -f2 || echo "0")
  FAILED=$(echo "$BODY" | grep -o '"failed":[0-9]*' | cut -d: -f2 || echo "0")

  BATCH_END=$(date +%s)
  BATCH_DURATION=$((BATCH_END - BATCH_START))

  TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  log "📈 Résultat batch:"
  log "   - Analysés: $ANALYZED"
  log "   - Réussis: $SUCCEEDED"
  log "   - Échoués: $FAILED"
  log "   - Durée: ${BATCH_DURATION}s"

  # Arrêter si plus de docs à analyser
  if [ "$ANALYZED" -eq 0 ] || [ "$ANALYZED" -lt "$BATCH_SIZE" ]; then
    log "ℹ️  Plus de documents à analyser"
    break
  fi

  # Pause entre batches
  if [ $BATCH_COUNT -lt $MAX_BATCHES ]; then
    log "⏸️  Pause ${PAUSE_BETWEEN_BATCHES}s..."
    sleep $PAUSE_BETWEEN_BATCHES
  fi
done

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
TOTAL_MINUTES=$((TOTAL_DURATION / 60))
TOTAL_SECONDS=$((TOTAL_DURATION % 60))

# Compter restants
REMAINING=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE quality_score IS NULL AND is_active = true;")
REMAINING=$(echo "$REMAINING" | tr -d ' ')

# Calculer couverture
TOTAL_DOCS=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE is_active = true;")
TOTAL_DOCS=$(echo "$TOTAL_DOCS" | tr -d ' ')
WITH_SCORE=$((TOTAL_DOCS - REMAINING))
COVERAGE=$((WITH_SCORE * 100 / TOTAL_DOCS))

log "=========================================="
log "✅ Analyse week-end terminée"
log "=========================================="
log "📊 Résumé:"
log "   - Batches traités: $BATCH_COUNT"
log "   - Documents analysés: $TOTAL_ANALYZED"
log "   - Réussis: $TOTAL_SUCCEEDED"
log "   - Échoués: $TOTAL_FAILED"
log "   - Durée totale: ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"
log "   - Restants sans score: $REMAINING"
log "   - Couverture KB: ${COVERAGE}%"
log "=========================================="

# Désactiver trap avant succès
trap - EXIT

# Compléter avec succès
OUTPUT_JSON="{\"totalUnanalyzed\": $TOTAL_UNANALYZED, \"batchesProcessed\": $BATCH_COUNT, \"analyzed\": $TOTAL_ANALYZED, \"succeeded\": $TOTAL_SUCCEEDED, \"failed\": $TOTAL_FAILED, \"remaining\": $REMAINING, \"coverage\": $COVERAGE, \"durationSeconds\": $TOTAL_DURATION}"
cron_complete "$OUTPUT_JSON"

log "🎉 Script terminé avec succès"
exit 0
