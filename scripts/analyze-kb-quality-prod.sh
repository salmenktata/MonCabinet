#!/bin/bash
#
# Script d'analyse de qualité KB en batch pour PRODUCTION
# Usage: ./scripts/analyze-kb-quality-prod.sh [batch_size] [max_batches]
#
# Exemples:
#   ./scripts/analyze-kb-quality-prod.sh          # 20 docs/batch, illimité
#   ./scripts/analyze-kb-quality-prod.sh 10 5     # 10 docs/batch, max 5 batches
#

set -e

BATCH_SIZE=${1:-20}
MAX_BATCHES=${2:-999}
API_URL="https://qadhya.tn/api/admin/kb/analyze-quality"

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
STATS=$(curl -s "$API_URL")
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

# Estimation temps
ESTIMATED_MINUTES=$(( ACTUAL_BATCHES * 2 ))

echo "🚀 Démarrage du traitement..."
echo "   Batches nécessaires: $NEEDED_BATCHES"
echo "   Batches à exécuter: $ACTUAL_BATCHES"
echo "   ⏱️  Estimation: ~${ESTIMATED_MINUTES} minutes"
echo ""
echo "⚠️  Appuyez sur Ctrl+C pour arrêter (progression sauvegardée)"
echo ""

# Exécuter les batches
TOTAL_ANALYZED=0
TOTAL_SUCCEEDED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)

for i in $(seq 1 $ACTUAL_BATCHES); do
    echo "───────────────────────────────────────────────────────────────"
    echo "🔄 Batch $i/$ACTUAL_BATCHES - $(date +'%H:%M:%S')"
    echo "───────────────────────────────────────────────────────────────"

    BATCH_START=$(date +%s)

    RESULT=$(curl -s -X POST "$API_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"batchSize\":$BATCH_SIZE,\"skipAnalyzed\":true}")

    SUCCESS=$(echo "$RESULT" | jq -r '.success')

    if [ "$SUCCESS" != "true" ]; then
        ERROR=$(echo "$RESULT" | jq -r '.error // "Erreur inconnue"')
        echo "❌ Erreur batch $i: $ERROR"
        continue
    fi

    ANALYZED=$(echo "$RESULT" | jq -r '.analyzed')
    SUCCEEDED=$(echo "$RESULT" | jq -r '.succeeded')
    FAILED=$(echo "$RESULT" | jq -r '.failed')

    TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
    TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

    BATCH_END=$(date +%s)
    BATCH_DURATION=$((BATCH_END - BATCH_START))

    # Calculer score moyen du batch si disponible
    AVG_SCORE=$(echo "$RESULT" | jq -r '[.results[] | select(.success == true) | .qualityScore] | add / length | round')

    echo "   ✅ Analysés: $ANALYZED | Réussis: $SUCCEEDED | Échoués: $FAILED"
    if [ "$AVG_SCORE" != "null" ] && [ "$AVG_SCORE" != "" ]; then
        echo "   📊 Score moyen batch: $AVG_SCORE/100"
    fi
    echo "   ⏱️  Durée batch: ${BATCH_DURATION}s"

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

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
TOTAL_MINUTES=$((TOTAL_DURATION / 60))
TOTAL_SECONDS=$((TOTAL_DURATION % 60))

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
echo "  ⏱️  Durée totale: ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"
if [ "$TOTAL_SUCCEEDED" -gt 0 ]; then
    AVG_PER_DOC=$((TOTAL_DURATION / TOTAL_SUCCEEDED))
    echo "  ⏱️  Temps moyen/doc: ${AVG_PER_DOC}s"
fi
echo ""

# Statistiques finales
echo "📊 Statistiques finales..."
FINAL_STATS=$(curl -s "$API_URL")
FINAL_WITH_SCORE=$(echo "$FINAL_STATS" | jq -r '.stats.withScore')
FINAL_WITHOUT_SCORE=$(echo "$FINAL_STATS" | jq -r '.stats.withoutScore')
FINAL_AVG_SCORE=$(echo "$FINAL_STATS" | jq -r '.stats.avgScore // "N/A"')
FINAL_COVERAGE=$(echo "$FINAL_STATS" | jq -r '.stats.coverage')

echo "   Total: $TOTAL_DOCS documents"
echo "   Avec score: $FINAL_WITH_SCORE"
echo "   Sans score: $FINAL_WITHOUT_SCORE"
echo "   Score moyen global: $FINAL_AVG_SCORE/100"
echo "   📈 Couverture: ${FINAL_COVERAGE}%"
echo ""

if [ "$FINAL_WITHOUT_SCORE" = "0" ]; then
    echo "🎉 ✅ SUCCÈS COMPLET ! Tous les documents ont un score de qualité !"
else
    echo "📈 Progression: ${FINAL_COVERAGE}% de couverture"
    echo "   Restant: $FINAL_WITHOUT_SCORE documents à analyser"
    echo ""
    echo "💡 Pour continuer, relancez:"
    echo "   /analyze-kb-quality"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
