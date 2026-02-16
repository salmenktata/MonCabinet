#!/bin/bash
# =====================================================
# Cron Pipeline Auto-Advance
# Traite progressivement les documents KB backfillés
# en petits batches pour éviter les timeouts/OOM
#
# Usage:
#   bash scripts/cron-pipeline-auto-advance.sh
#
# Configurable via variables:
#   BATCH_SIZE=20         Nombre de docs par batch
#   MAX_BATCHES=10        Nombre max de batches par exécution
#   PAUSE_SECONDS=5       Pause entre batches (en secondes)
# =====================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Configuration
BATCH_SIZE="${BATCH_SIZE:-20}"
MAX_BATCHES="${MAX_BATCHES:-10}"
PAUSE_SECONDS="${PAUSE_SECONDS:-5}"

# API
API_BASE="${CRON_API_BASE:-http://localhost:3000}"
API_URL="$API_BASE/api/admin/pipeline/auto-advance"

cron_start "pipeline-auto-advance"

echo "Configuration: batch_size=$BATCH_SIZE, max_batches=$MAX_BATCHES, pause=${PAUSE_SECONDS}s"
echo ""

total_processed=0
total_advanced=0
total_unchanged=0
total_errors=0

for i in $(seq 1 "$MAX_BATCHES"); do
  # Appel API
  response=$(curl -sf --max-time 120 \
    -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"stages\":[\"crawled\",\"content_reviewed\",\"classified\",\"indexed\",\"quality_analyzed\"],\"limit\":$BATCH_SIZE}" \
    2>&1)

  if [ $? -ne 0 ]; then
    echo "Batch $i: ERREUR curl - $response"
    total_errors=$((total_errors + 1))
    break
  fi

  # Parser la réponse JSON
  processed=$(echo "$response" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('processed',0))" 2>/dev/null)
  advanced=$(echo "$response" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('advanced',0))" 2>/dev/null)
  unchanged=$(echo "$response" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('unchanged',0))" 2>/dev/null)
  errors=$(echo "$response" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('errors',0))" 2>/dev/null)

  echo "Batch $i: $advanced/$processed avancés, $unchanged inchangés, $errors erreurs"

  total_processed=$((total_processed + ${processed:-0}))
  total_advanced=$((total_advanced + ${advanced:-0}))
  total_unchanged=$((total_unchanged + ${unchanged:-0}))
  total_errors=$((total_errors + ${errors:-0}))

  # Arrêter si plus rien à traiter
  if [ "${processed:-0}" -eq 0 ] || [ "${advanced:-0}" -eq 0 ]; then
    echo "Plus de documents éligibles, arrêt."
    break
  fi

  # Pause entre batches
  if [ "$i" -lt "$MAX_BATCHES" ]; then
    sleep "$PAUSE_SECONDS"
  fi
done

echo ""
echo "=== Résumé ==="
echo "Total traités:  $total_processed"
echo "Total avancés:  $total_advanced"
echo "Total inchangés: $total_unchanged"
echo "Total erreurs:  $total_errors"

if [ "$total_errors" -gt 0 ]; then
  cron_complete "warning" "Avancés: $total_advanced, Erreurs: $total_errors"
else
  cron_complete "success" "Avancés: $total_advanced/$total_processed"
fi
