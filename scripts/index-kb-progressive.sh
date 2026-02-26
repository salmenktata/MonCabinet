#!/bin/bash
# Script d'indexation progressive via API endpoints
# Indexe knowledge_base ET web_pages par appels successifs
# Chaque appel API traite déjà ~50 batches (KB) ou ~12 batches (WEB) en interne
# On fait jusqu'à 3 appels successifs si l'API indexe encore des docs

# PAS de set -e : on veut continuer même si un appel échoue

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Détection auto nom container
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
cron_start "index-kb" "scheduled" || true
trap 'cron_fail "Script terminé avec erreur" $? || true' EXIT

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# Vérifie que la réponse est du JSON valide (pas du HTML de deploy)
is_json() {
  echo "$1" | jq empty 2>/dev/null
}

log "=== Début cycle indexation ==="

# Deadline globale : 50 min (le cron tourne toutes les heures)
DEADLINE=$(( $(date +%s) + 3000 ))

# =============================================================================
# 1. Indexer knowledge_base
# =============================================================================
log "[KB] Indexation knowledge_base..."
KB_TOTAL=0
KB_CALLS=0

for i in $(seq 1 3); do
  if [ $(date +%s) -ge $DEADLINE ]; then
    log "[KB] ⏰ Deadline atteinte après $KB_CALLS appels ($KB_TOTAL docs)"
    break
  fi

  RESPONSE=$(curl -s -m 600 -X GET "http://127.0.0.1:3000/api/admin/index-kb"     -H "Authorization: Bearer $CRON_SECRET" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    log "[KB] ✗ Erreur curl (code: $EXIT_CODE) à l'appel $i — retry dans 60s..."
    sleep 60
    continue
  fi

  # Vérifier que la réponse est du JSON (pas du HTML pendant un deploy)
  if ! is_json "$RESPONSE"; then
    log "[KB] ✗ Réponse non-JSON à l'appel $i (deploy en cours ?), retry dans 30s..."
    sleep 30
    continue
  fi

  INDEXED=$(echo "$RESPONSE" | jq -r '.indexed // 0' 2>/dev/null || echo "0")
  FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0' 2>/dev/null || echo "0")
  DURATION=$(echo "$RESPONSE" | jq -r '.duration // 0' 2>/dev/null || echo "0")
  KB_TOTAL=$((KB_TOTAL + INDEXED))
  KB_CALLS=$((KB_CALLS + 1))

  log "[KB] Appel $i: $INDEXED indexés, $FAILED échoués (${DURATION}ms)"

  if [ "$INDEXED" = "0" ]; then
    log "[KB] ✓ Plus rien à indexer ($KB_TOTAL docs total en $KB_CALLS appels)"
    break
  fi

  sleep 10
done

# =============================================================================
# 2. Indexer web_pages
# =============================================================================
log "[WEB] Indexation web_pages..."
WEB_TOTAL=0
WEB_CALLS=0

for i in $(seq 1 8); do
  if [ $(date +%s) -ge $DEADLINE ]; then
    log "[WEB] ⏰ Deadline atteinte après $WEB_CALLS appels ($WEB_TOTAL docs)"
    break
  fi

  RESPONSE=$(curl -s -m 600 -X GET "http://127.0.0.1:3000/api/admin/index-web-pages"     -H "Authorization: Bearer $CRON_SECRET" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    log "[WEB] ✗ Erreur curl (code: $EXIT_CODE) à l'appel $i — retry dans 60s..."
    sleep 60
    continue
  fi

  if ! is_json "$RESPONSE"; then
    log "[WEB] ✗ Réponse non-JSON à l'appel $i (deploy en cours ?), retry dans 30s..."
    sleep 30
    continue
  fi

  INDEXED=$(echo "$RESPONSE" | jq -r '.indexed // 0' 2>/dev/null || echo "0")
  FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0' 2>/dev/null || echo "0")
  DURATION=$(echo "$RESPONSE" | jq -r '.duration // 0' 2>/dev/null || echo "0")
  WEB_TOTAL=$((WEB_TOTAL + INDEXED))
  WEB_CALLS=$((WEB_CALLS + 1))

  log "[WEB] Appel $i: $INDEXED indexés, $FAILED échoués (${DURATION}ms)"

  if [ "$INDEXED" = "0" ]; then
    log "[WEB] ✓ Plus rien à indexer ($WEB_TOTAL docs total en $WEB_CALLS appels)"
    break
  fi

  sleep 10
done

TOTAL=$((KB_TOTAL + WEB_TOTAL))
log "=== Fin cycle: KB=$KB_TOTAL, WEB=$WEB_TOTAL, TOTAL=$TOTAL ==="

# Cleanup trap
trap - EXIT

# Enregistrer succès
OUTPUT_JSON=$(cat <<EOF
{
  "kbIndexed": $KB_TOTAL,
  "kbCalls": $KB_CALLS,
  "webIndexed": $WEB_TOTAL,
  "webCalls": $WEB_CALLS,
  "totalIndexed": $TOTAL
}
EOF
)

cron_complete "$OUTPUT_JSON" || true

exit 0
