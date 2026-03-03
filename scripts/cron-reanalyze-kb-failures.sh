#\!/bin/bash
#
# Cron automatique : Réanalyse des documents KB échoués
#
# Schedule recommandé : Quotidien 4h du matin (après indexation overnight)
# Crontab : 0 4 * * * /opt/qadhya/scripts/cron-reanalyze-kb-failures.sh
#
# Logs : /var/log/qadhya/reanalyze-kb.log
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Charger library cron logging
source "$SCRIPT_DIR/lib/cron-logger.sh"
source "$SCRIPT_DIR/lib/cron-lock.sh"

# Priorité basse + anti-double-run + attente charge
renice -n 15 $$ 2>/dev/null || true
wait_for_low_load 180 5
acquire_lock "$(basename "${BASH_SOURCE[0]}" .sh)" 3600 || exit 0
trap 'release_lock' EXIT INT TERM

LOG_DIR="/var/log/qadhya"
LOG_FILE="${LOG_DIR}/reanalyze-kb.log"

# Utiliser CRON_API_BASE depuis env (injecté par trigger server) ou défaut
CRON_API_BASE="${CRON_API_BASE:-https://qadhya.tn}"
API_URL="${CRON_API_BASE}/api/admin/kb/reanalyze-failed"

BATCH_SIZE=50
MAX_BATCHES=5  # Maximum 5 batches = 250 docs/jour

# Créer répertoire logs si nécessaire
mkdir -p "$LOG_DIR"

# Fonction de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Début réanalyse automatique KB échecs"
log "=========================================="

# Détecter noms des conteneurs (robuste contre redémarrages)
NEXTJS_CONTAINER=$(docker ps --filter "name=nextjs" --format "{{.Names}}" | head -1)
POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)

if [ -z "$NEXTJS_CONTAINER" ] || [ -z "$POSTGRES_CONTAINER" ]; then
  log "❌ ERREUR: Conteneurs Docker non trouvés"
  log "   Next.js: $NEXTJS_CONTAINER"
  log "   PostgreSQL: $POSTGRES_CONTAINER"

  cron_fail "Conteneurs Docker non trouvés" 1
  exit 1
fi

log "🐳 Conteneurs détectés:"
log "   Next.js: $NEXTJS_CONTAINER"
log "   PostgreSQL: $POSTGRES_CONTAINER"

# Récupérer CRON_SECRET (priorité: env var > docker exec)
if [ -z "$CRON_SECRET" ]; then
  log "🔑 Récupération CRON_SECRET depuis container..."
  if \! CRON_SECRET=$(docker exec "$NEXTJS_CONTAINER" env | grep CRON_SECRET | cut -d= -f2); then
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
cron_start "reanalyze-kb-failures" "scheduled"

# Fonction trap pour cleanup
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "❌ Script terminé avec erreur (exit $exit_code)"
    cron_fail "Script terminated with error" $exit_code
  fi
}

trap cleanup EXIT

# Compter échecs initiaux
log "📊 Comptage documents échoués..."
TOTAL_FAILURES=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE quality_score = 50 AND is_active = true;")
TOTAL_FAILURES=$(echo "$TOTAL_FAILURES" | tr -d ' ')

log "🔴 Total documents échoués: $TOTAL_FAILURES"

if [ "$TOTAL_FAILURES" -eq 0 ]; then
  log "✅ Aucun document échoué à réanalyser"
  trap - EXIT
  OUTPUT_JSON="{\"totalFailures\": 0, \"batchesProcessed\": 0, \"reanalyzed\": 0, \"fixed\": 0}"
  cron_complete "$OUTPUT_JSON"
  exit 0
fi

# Traitement par batch
BATCH_COUNT=0
TOTAL_REANALYZED=0
TOTAL_FIXED=0

while [ $BATCH_COUNT -lt $MAX_BATCHES ]; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "📦 Batch $BATCH_COUNT / $MAX_BATCHES"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Appel API réanalyse
  log "🚀 Appel API réanalyse (batch_size=$BATCH_SIZE)..."
  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"batchSize\": $BATCH_SIZE}" \
    -w "\n%{http_code}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" \!= "200" ]; then
    log "❌ ERREUR API (HTTP $HTTP_CODE): $BODY"
    trap - EXIT
    cron_fail "API error HTTP $HTTP_CODE" 1
    exit 1
  fi

  # Parser résultat
  BATCH_REANALYZED=$(echo "$BODY" | grep -o '"reanalyzed":[0-9]*' | cut -d: -f2)
  BATCH_FIXED=$(echo "$BODY" | grep -o '"fixed":[0-9]*' | cut -d: -f2)

  log "📈 Résultat batch:"
  log "   - Réanalysés: $BATCH_REANALYZED"
  log "   - Fixés: $BATCH_FIXED"

  TOTAL_REANALYZED=$((TOTAL_REANALYZED + BATCH_REANALYZED))
  TOTAL_FIXED=$((TOTAL_FIXED + BATCH_FIXED))

  # Arrêter si aucun doc réanalysé
  if [ "$BATCH_REANALYZED" -eq 0 ]; then
    log "ℹ️  Aucun document restant, arrêt"
    break
  fi

  # Pause entre batches (éviter surcharge OpenAI)
  if [ $BATCH_COUNT -lt $MAX_BATCHES ]; then
    log "⏸️  Pause 5s avant prochain batch..."
    sleep 5
  fi
done

# Compter échecs restants
REMAINING_FAILURES=$(docker exec "$POSTGRES_CONTAINER" psql -U moncabinet -d qadhya -t -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE quality_score = 50 AND is_active = true;")
REMAINING_FAILURES=$(echo "$REMAINING_FAILURES" | tr -d ' ')

log "=========================================="
log "✅ Réanalyse terminée"
log "=========================================="
log "📊 Résumé:"
log "   - Échecs initiaux: $TOTAL_FAILURES"
log "   - Batches traités: $BATCH_COUNT"
log "   - Documents réanalysés: $TOTAL_REANALYZED"
log "   - Documents fixés: $TOTAL_FIXED"
log "   - Échecs restants: $REMAINING_FAILURES"
log "=========================================="

# Désactiver trap avant succès
trap - EXIT

# Compléter avec succès
OUTPUT_JSON="{\"totalFailures\": $TOTAL_FAILURES, \"batchesProcessed\": $BATCH_COUNT, \"reanalyzed\": $TOTAL_REANALYZED, \"fixed\": $TOTAL_FIXED, \"remaining\": $REMAINING_FAILURES}"
cron_complete "$OUTPUT_JSON"

log "🎉 Script terminé avec succès"
exit 0
