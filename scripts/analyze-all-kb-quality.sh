#!/bin/bash
#
# Script d'analyse de qualité en batch pour tous les documents KB
# Usage: ./scripts/analyze-all-kb-quality.sh [batch_size] [max_batches]
#
# Exemples:
#   ./scripts/analyze-all-kb-quality.sh          # 20 docs/batch, illimité
#   ./scripts/analyze-all-kb-quality.sh 10 5     # 10 docs/batch, max 5 batches
#

set -e

BATCH_SIZE=${1:-20}
MAX_BATCHES=${2:-999}
API_URL="http://localhost:7002/api/admin/kb/analyze-quality"

echo "═══════════════════════════════════════════════════════════════"
echo "  Analyse de Qualité KB - Batch Processing"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  - Batch size: $BATCH_SIZE documents"
echo "  - Max batches: $MAX_BATCHES"
echo "  - API: $API_URL"
echo ""

# Vérifier que le serveur est actif
if ! curl -s -f "$API_URL" > /dev/null; then
    echo "❌ ERREUR: Serveur Next.js non accessible"
    echo "   Démarrez le serveur avec: npm run dev"
    exit 1
fi

echo "✅ Serveur Next.js accessible"
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

if [ "$WITHOUT_SCORE" -eq 0 ]; then
    echo "✅ Tous les documents ont déjà un score de qualité !"
    exit 0
fi

# Calculer nombre de batches nécessaires
NEEDED_BATCHES=$(( (WITHOUT_SCORE + BATCH_SIZE - 1) / BATCH_SIZE ))
ACTUAL_BATCHES=$(( NEEDED_BATCHES < MAX_BATCHES ? NEEDED_BATCHES : MAX_BATCHES ))

echo "🚀 Démarrage du traitement..."
echo "   Batches nécessaires: $NEEDED_BATCHES"
echo "   Batches à exécuter: $ACTUAL_BATCHES"
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
    AVG_TIME=$(echo "$RESULT" | jq -r '.avgProcessingTimeMs')

    TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
    TOTAL_SUCCEEDED=$((TOTAL_SUCCEEDED + SUCCEEDED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

    BATCH_END=$(date +%s)
    BATCH_DURATION=$((BATCH_END - BATCH_START))

    echo "   ✅ Analysés: $ANALYZED | Réussis: $SUCCEEDED | Échoués: $FAILED"
    echo "   ⏱️  Temps/doc: ${AVG_TIME}ms | Batch: ${BATCH_DURATION}s"

    # Si le batch a retourné moins de documents que demandé, on a terminé
    if [ "$ANALYZED" -lt "$BATCH_SIZE" ]; then
        echo ""
        echo "✅ Tous les documents disponibles ont été analysés"
        break
    fi

    # Pause de 2 secondes entre les batches pour éviter de surcharger
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

echo "   Total: $TOTAL_DOCS documents"
echo "   Avec score: $FINAL_WITH_SCORE"
echo "   Sans score: $FINAL_WITHOUT_SCORE"
echo "   Score moyen: $FINAL_AVG_SCORE"
echo ""

if [ "$FINAL_WITHOUT_SCORE" -eq 0 ]; then
    echo "🎉 ✅ SUCCÈS COMPLET ! Tous les documents ont un score de qualité !"
else
    COVERAGE=$(echo "scale=1; $FINAL_WITH_SCORE * 100 / $TOTAL_DOCS" | bc)
    echo "📈 Progression: ${COVERAGE}% de couverture"
    echo "   Restant: $FINAL_WITHOUT_SCORE documents à analyser"
    echo ""
    echo "💡 Pour continuer, relancez ce script:"
    echo "   ./scripts/analyze-all-kb-quality.sh $BATCH_SIZE"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
