#!/bin/bash
#
# Script d'analyse de qualité KB en batch pour PRODUCTION
# Usage: ./scripts/analyze-kb-quality-prod.sh [batch_size] [max_batches]
#
# Exemples:
#   ./scripts/analyze-kb-quality-prod.sh          # 20 docs/batch, illimité
#   ./scripts/analyze-kb-quality-prod.sh 10 5     # 10 docs/batch, max 5 batches
#

set -eo pipefail

BATCH_SIZE=${1:-20}
MAX_BATCHES=${2:-999}
API_URL="https://qadhya.tn/api/admin/kb/analyze-quality"

# Validation input
if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [ "$BATCH_SIZE" -le 0 ]; then
  echo "❌ Batch size invalide: $BATCH_SIZE (doit être > 0)"
  exit 1
fi

# Récupérer le CRON_SECRET depuis le container prod via SSH
CRON_SECRET=$(ssh moncabinet-prod "docker exec qadhya-nextjs printenv CRON_SECRET 2>/dev/null" 2>/dev/null | tr -d '\n\r')
if [ -z "$CRON_SECRET" ]; then
  echo "❌ Impossible de récupérer CRON_SECRET depuis le container prod"
  echo "   Vérifier: ssh moncabinet-prod 'docker exec qadhya-nextjs printenv CRON_SECRET'"
  exit 1
fi
AUTH_HEADER="x-cron-secret: $CRON_SECRET"

# Accumulateurs pour les stats finales (utilisés aussi par trap)
TOTAL_ANALYZED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)
CURRENT_BATCH=0
ACTUAL_BATCHES=0
TOTAL_DOCS=0
SUM_BATCH_TIMES=0
BATCH_COUNT_FOR_AVG=0

# Curl avec retry (3 tentatives, backoff exponentiel)
curl_with_retry() {
  local max=3
  local attempt=0
  local wait_sec=2
  local result

  until [ $attempt -ge $max ]; do
    result=$(curl -s --connect-timeout 10 --max-time 180 "$@") && echo "$result" && return 0
    attempt=$((attempt + 1))
    if [ $attempt -lt $max ]; then
      echo "   ⚠️  Tentative $attempt/$max échouée — retry dans ${wait_sec}s..."
      sleep $wait_sec
      wait_sec=$((wait_sec * 2))
    fi
  done

  echo "   ❌ curl_with_retry: $max tentatives épuisées"
  return 1
}

# Afficher stats finales (appelé par trap et en fin normale)
show_final_stats() {
  local end_time
  end_time=$(date +%s)
  local total_dur=$((end_time - START_TIME))
  local total_min=$((total_dur / 60))
  local total_sec=$((total_dur % 60))

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  📊 Résumé Final"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "Documents (session):"
  echo "  ✅ Analysés: $TOTAL_ANALYZED"
  echo "  ✅ Réussis:  $TOTAL_SUCCEEDED"
  echo "  ❌ Échoués:  $TOTAL_FAILED"
  echo ""
  echo "Temps:"
  echo "  ⏱️  Durée totale: ${total_min}m ${total_sec}s"
  if [ "$TOTAL_SUCCEEDED" -gt 0 ]; then
    local avg_per_doc=$((total_dur / TOTAL_SUCCEEDED))
    echo "  ⏱️  Temps moyen/doc: ${avg_per_doc}s"
  fi
  echo ""

  # Statistiques finales depuis l'API
  echo "📊 Statistiques KB actuelles..."
  local final_stats
  final_stats=$(curl_with_retry "$API_URL" -H "$AUTH_HEADER" 2>/dev/null) || true

  if [ -n "$final_stats" ]; then
    local final_with
    local final_without
    local final_avg
    local final_coverage
    local dist_low dist_medium dist_good dist_excellent dist_failures
    final_with=$(echo "$final_stats" | jq -r '.stats.withScore // "?"')
    final_without=$(echo "$final_stats" | jq -r '.stats.withoutScore // "?"')
    final_avg=$(echo "$final_stats" | jq -r '.stats.avgScore // empty')
    final_coverage=$(echo "$final_stats" | jq -r '.stats.coverage // "?"')
    dist_low=$(echo "$final_stats" | jq -r '.stats.distribution.low // "?"')
    dist_medium=$(echo "$final_stats" | jq -r '.stats.distribution.medium // "?"')
    dist_good=$(echo "$final_stats" | jq -r '.stats.distribution.good // "?"')
    dist_excellent=$(echo "$final_stats" | jq -r '.stats.distribution.excellent // "?"')
    dist_failures=$(echo "$final_stats" | jq -r '.stats.distribution.likelyFailures // "?"')

    # Valider que avgScore n'est pas null/vide
    if [ -z "$final_avg" ] || [ "$final_avg" = "null" ]; then
      final_avg="N/A"
      echo "   Score moyen global: N/A"
    else
      echo "   Score moyen global: ${final_avg}/100"
    fi

    echo "   Total: $TOTAL_DOCS documents"
    echo "   Avec score: $final_with"
    echo "   Sans score: $final_without"
    echo "   📈 Couverture: ${final_coverage}%"
    echo ""
    echo "   Distribution des scores:"
    echo "     🔴 Faible (<70):    $dist_low docs"
    echo "     🟡 Moyen (70-79):   $dist_medium docs"
    echo "     🟢 Bon (80-89):     $dist_good docs"
    echo "     ✨ Excellent (≥90): $dist_excellent docs"
    echo "     ⚠️  Échecs (=50):   $dist_failures docs"
    echo ""

    if [ "$final_without" = "0" ]; then
      echo "🎉 ✅ SUCCÈS COMPLET ! Tous les documents ont un score de qualité !"
    else
      echo "📈 Progression: ${final_coverage}% de couverture"
      echo "   Restant: $final_without documents à analyser"
      echo ""
      echo "💡 Pour continuer, relancez:"
      echo "   /analyze-kb-quality"
    fi
  else
    echo "   (Impossible de récupérer les stats finales)"
  fi

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
}

# Trap Ctrl+C — afficher stats gracieusement avant de quitter
trap 'echo ""; echo "⚠️  Interruption au batch $CURRENT_BATCH/$ACTUAL_BATCHES"; show_final_stats; exit 1' INT

echo "═══════════════════════════════════════════════════════════════"
echo "  🎯 Analyse Qualité KB Production - Qadhya"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  - Batch size: $BATCH_SIZE documents"
echo "  - Max batches: $MAX_BATCHES"
echo "  - API: $API_URL"
echo ""

# Récupérer statistiques initiales
echo "📊 Statistiques initiales..."
STATS=$(curl_with_retry "$API_URL" -H "$AUTH_HEADER")
TOTAL_DOCS=$(echo "$STATS" | jq -r '.stats.totalDocs')
WITHOUT_SCORE=$(echo "$STATS" | jq -r '.stats.withoutScore')
WITH_SCORE=$(echo "$STATS" | jq -r '.stats.withScore')

echo "   Total documents: $TOTAL_DOCS"
echo "   Avec score: $WITH_SCORE"
echo "   Sans score: $WITHOUT_SCORE"
echo ""

if [ "$WITHOUT_SCORE" = "0" ]; then
  echo "✅ Tous les documents ont déjà un score de qualité !"
  exit 0
fi

# Calculer nombre de batches nécessaires
NEEDED_BATCHES=$(( (WITHOUT_SCORE + BATCH_SIZE - 1) / BATCH_SIZE ))
ACTUAL_BATCHES=$(( NEEDED_BATCHES < MAX_BATCHES ? NEEDED_BATCHES : MAX_BATCHES ))

# Estimation initiale conservatrice (~8s/doc → ~8*batchSize/60 min/batch)
ESTIMATED_SECONDS=$((ACTUAL_BATCHES * BATCH_SIZE * 8))
ESTIMATED_MINUTES=$((ESTIMATED_SECONDS / 60))

echo "🚀 Démarrage du traitement..."
echo "   Batches nécessaires: $NEEDED_BATCHES"
echo "   Batches à exécuter: $ACTUAL_BATCHES"
echo "   ⏱️  Estimation initiale: ~${ESTIMATED_MINUTES} minutes"
echo ""
echo "⚠️  Appuyez sur Ctrl+C pour arrêter (stats affichées à l'interruption)"
echo ""

for i in $(seq 1 $ACTUAL_BATCHES); do
  CURRENT_BATCH=$i
  echo "───────────────────────────────────────────────────────────────"
  echo "🔄 Batch $i/$ACTUAL_BATCHES - $(date +'%H:%M:%S')"
  echo "───────────────────────────────────────────────────────────────"

  BATCH_START=$(date +%s)

  RESULT=$(curl_with_retry -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    -H "$AUTH_HEADER" \
    -d "{\"batchSize\":$BATCH_SIZE,\"skipAnalyzed\":true}")

  SUCCESS=$(echo "$RESULT" | jq -r '.success // "false"')

  if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$RESULT" | jq -r '.error // "Erreur inconnue"')
    echo "❌ Erreur batch $i: $ERROR"
    continue
  fi

  ANALYZED=$(echo "$RESULT" | jq -r '.analyzed // 0')
  SUCCEEDED=$(echo "$RESULT" | jq -r '.succeeded // 0')
  FAILED=$(echo "$RESULT" | jq -r '.failed // 0')

  TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  BATCH_END=$(date +%s)
  BATCH_DURATION=$((BATCH_END - BATCH_START))

  # Calculer score moyen du batch
  AVG_SCORE=$(echo "$RESULT" | jq -r '[.results[] | select(.success == true) | .qualityScore] | if length > 0 then (add / length | round) else null end')

  echo "   ✅ Analysés: $ANALYZED | Réussis: $SUCCEEDED | Échoués: $FAILED"
  if [ "$AVG_SCORE" != "null" ] && [ -n "$AVG_SCORE" ]; then
    echo "   📊 Score moyen batch: ${AVG_SCORE}/100"
  fi
  echo "   ⏱️  Durée batch: ${BATCH_DURATION}s"

  # Mettre à jour estimation live basée sur timings réels
  if [ "$ANALYZED" -gt 0 ]; then
    SUM_BATCH_TIMES=$((SUM_BATCH_TIMES + BATCH_DURATION))
    BATCH_COUNT_FOR_AVG=$((BATCH_COUNT_FOR_AVG + 1))
    AVG_BATCH_TIME=$((SUM_BATCH_TIMES / BATCH_COUNT_FOR_AVG))
    REMAINING_BATCHES=$((ACTUAL_BATCHES - i))
    if [ "$REMAINING_BATCHES" -gt 0 ]; then
      ETA_SECONDS=$((REMAINING_BATCHES * AVG_BATCH_TIME))
      ETA_MINUTES=$((ETA_SECONDS / 60))
      ETA_SECS=$((ETA_SECONDS % 60))
      echo "   🕐 ETA restant: ~${ETA_MINUTES}m ${ETA_SECS}s"
    fi
  fi

  # Si le batch a retourné moins de documents que demandé, on a terminé
  if [ "$ANALYZED" -lt "$BATCH_SIZE" ]; then
    echo ""
    echo "✅ Tous les documents disponibles ont été analysés"
    break
  fi

  # Pause de 2 secondes entre les batches
  if [ $i -lt $ACTUAL_BATCHES ]; then
    echo "   💤 Pause 2s..."
    sleep 2
  fi

  echo ""
done

show_final_stats
