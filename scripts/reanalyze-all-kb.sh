#!/bin/bash
#
# Ré-analyse COMPLÈTE de tous les documents KB avec les nouveaux prompts
# Force la ré-analyse même des documents déjà analysés (skipAnalyzed=false)
#

set -e

# Configuration
BATCH_SIZE=${1:-20}
MAX_BATCHES=${2:-20}
API_URL="http://localhost:7002/api/admin/kb/analyze-quality"

echo "═══════════════════════════════════════════════════════════════"
echo "  Ré-analyse Complète KB - Nouveaux Prompts"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  - Batch size: $BATCH_SIZE documents"
echo "  - Max batches: $MAX_BATCHES"
echo "  - Mode: FORCE (skipAnalyzed=false)"
echo "  - API: $API_URL"
echo ""

# Vérifier que le serveur Next.js est accessible
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:7002/api/health" || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ ERREUR: Serveur Next.js non accessible"
  echo "   Démarrez le serveur avec: npm run dev"
  exit 1
fi

echo "✅ Serveur Next.js accessible"
echo ""

# Récupérer statistiques initiales
echo "📊 Statistiques initiales..."
STATS=$(curl -s "$API_URL")
TOTAL=$(echo "$STATS" | grep -o '"totalDocs":"[0-9]*"' | grep -o '[0-9]*' | head -1)
WITH_SCORE=$(echo "$STATS" | grep -o '"withScore":"[0-9]*"' | grep -o '[0-9]*' | head -1)
WITHOUT_SCORE=$(echo "$STATS" | grep -o '"withoutScore":"[0-9]*"' | grep -o '[0-9]*' | head -1)

echo "   Total documents: $TOTAL"
echo "   Avec score: $WITH_SCORE"
echo "   Sans score: $WITHOUT_SCORE"
echo ""

# Calculer nombre de batches nécessaires
BATCHES_NEEDED=$(( ($TOTAL + $BATCH_SIZE - 1) / $BATCH_SIZE ))
BATCHES_TO_RUN=$BATCHES_NEEDED
if [ $BATCHES_TO_RUN -gt $MAX_BATCHES ]; then
  BATCHES_TO_RUN=$MAX_BATCHES
fi

echo "🚀 Démarrage du traitement..."
echo "   Batches nécessaires: $BATCHES_NEEDED"
echo "   Batches à exécuter: $BATCHES_TO_RUN"
echo ""

TOTAL_ANALYZED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)

for ((i=1; i<=$BATCHES_TO_RUN; i++)); do
  echo "───────────────────────────────────────────────────────────────"
  echo "🔄 Batch $i/$BATCHES_TO_RUN - $(date '+%H:%M:%S')"
  echo "───────────────────────────────────────────────────────────────"

  BATCH_START=$(date +%s)

  # Appel API avec skipAnalyzed=false pour forcer la ré-analyse
  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"batchSize\": $BATCH_SIZE, \"skipAnalyzed\": false}")

  ANALYZED=$(echo "$RESPONSE" | grep -o '"analyzed":[0-9]*' | grep -o '[0-9]*' | head -1)
  SUCCEEDED=$(echo "$RESPONSE" | grep -o '"succeeded":[0-9]*' | grep -o '[0-9]*' | head -1)
  FAILED=$(echo "$RESPONSE" | grep -o '"failed":[0-9]*' | grep -o '[0-9]*' | head -1)

  BATCH_END=$(date +%s)
  BATCH_DURATION=$((BATCH_END - BATCH_START))

  if [ "$ANALYZED" -gt 0 ]; then
    TIME_PER_DOC=$((BATCH_DURATION / ANALYZED))
  else
    TIME_PER_DOC=0
  fi

  TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
  TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  echo "   ✅ Analysés: $ANALYZED | Réussis: $SUCCEEDED | Échoués: $FAILED"
  echo "   ⏱️  Temps/doc: ${TIME_PER_DOC}s | Batch: ${BATCH_DURATION}s"

  # Si aucun document n'a été analysé, on arrête
  if [ "$ANALYZED" -eq 0 ]; then
    echo ""
    echo "✅ Tous les documents disponibles ont été analysés"
    break
  fi

  # Pause entre les batches
  if [ $i -lt $BATCHES_TO_RUN ]; then
    echo "   💤 Pause 2s..."
    sleep 2
  fi
  echo ""
done

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
MINUTES=$((TOTAL_DURATION / 60))
SECONDS=$((TOTAL_DURATION % 60))

if [ $TOTAL_ANALYZED -gt 0 ]; then
  AVG_TIME_PER_DOC=$((TOTAL_DURATION / TOTAL_ANALYZED))
else
  AVG_TIME_PER_DOC=0
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  📊 Résumé Final"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Documents:"
echo "  ✅ Analysés: $TOTAL_ANALYZED"
echo "  ✅ Réussis: $TOTAL_SUCCEEDED"
echo "  ❌ Échoués: $TOTAL_FAILED"
echo ""
echo "Temps:"
echo "  ⏱️  Durée totale: ${MINUTES}m ${SECONDS}s"
echo "  ⏱️  Temps moyen/doc: ${AVG_TIME_PER_DOC}s"
echo ""

# Statistiques finales
echo "📊 Statistiques finales..."
STATS_FINAL=$(curl -s "$API_URL")
TOTAL_FINAL=$(echo "$STATS_FINAL" | grep -o '"totalDocs":"[0-9]*"' | grep -o '[0-9]*' | head -1)
WITH_SCORE_FINAL=$(echo "$STATS_FINAL" | grep -o '"withScore":"[0-9]*"' | grep -o '[0-9]*' | head -1)
WITHOUT_SCORE_FINAL=$(echo "$STATS_FINAL" | grep -o '"withoutScore":"[0-9]*"' | grep -o '[0-9]*' | head -1)
AVG_SCORE=$(echo "$STATS_FINAL" | grep -o '"avgScore":"[0-9]*"' | grep -o '[0-9]*' | head -1)

echo "   Total: $TOTAL_FINAL documents"
echo "   Avec score: $WITH_SCORE_FINAL"
echo "   Sans score: $WITHOUT_SCORE_FINAL"
echo "   Score moyen: $AVG_SCORE"
echo ""

COVERAGE=$(( ($WITH_SCORE_FINAL * 100) / $TOTAL_FINAL ))
echo "📈 Progression: ${COVERAGE}% de couverture"

if [ "$WITHOUT_SCORE_FINAL" -gt 0 ]; then
  echo "   Restant: $WITHOUT_SCORE_FINAL documents à analyser"
  echo ""
  echo "💡 Pour continuer, relancez ce script:"
  echo "   ./scripts/reanalyze-all-kb.sh $BATCH_SIZE"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
