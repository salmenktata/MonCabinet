#!/bin/bash
# Script d'indexation continue Google Drive avec Ollama
# Traite 1 fichier à la fois jusqu'à completion

echo "🚀 Démarrage indexation Google Drive (Ollama - mode lent)"
echo "=========================================================="
echo ""

TOTAL=53
INDEXED=0
FAILED_TOTAL=0
ITERATION=0

while [ $INDEXED -lt $TOTAL ]; do
  ITERATION=$((ITERATION + 1))
  REMAINING=$((TOTAL - INDEXED))

  echo "📊 Iteration $ITERATION - Indexés: $INDEXED/$TOTAL - Restants: $REMAINING"
  echo "⏱️  $(date '+%H:%M:%S') - Appel API (timeout 15min)..."

  # Appel API avec timeout 15 minutes
  RESULT=$(curl -X POST "http://localhost:3000/api/admin/index-kb-simple" \
    -H "Content-Type: application/json" \
    -d '{"batchSize": 1}' \
    -m 900 \
    -s 2>&1)

  # Parser le résultat JSON
  SUCCEEDED=$(echo "$RESULT" | grep -o '"succeeded":[0-9]*' | cut -d':' -f2)
  FAILED=$(echo "$RESULT" | grep -o '"failed":[0-9]*' | cut -d':' -f2)
  REMAINING_API=$(echo "$RESULT" | grep -o '"remaining":[0-9]*' | cut -d':' -f2)

  if [ -n "$SUCCEEDED" ]; then
    INDEXED=$((INDEXED + SUCCEEDED))
    FAILED_TOTAL=$((FAILED_TOTAL + FAILED))

    if [ "$SUCCEEDED" -eq 1 ]; then
      echo "  ✅ Succès: 1 fichier indexé"
    else
      echo "  ⚠️  Aucun fichier indexé cette itération"
    fi

    if [ "$FAILED" -gt 0 ]; then
      echo "  ❌ Échecs: $FAILED"
    fi
  else
    echo "  ⚠️  Erreur API ou timeout - Retry dans 10s..."
    sleep 10
    continue
  fi

  # Si plus de fichiers restants, arrêter
  if [ "$REMAINING_API" -eq 0 ]; then
    echo ""
    echo "✅ INDEXATION TERMINÉE !"
    break
  fi

  # Petit délai entre les requêtes
  echo "  💤 Pause 5s avant prochaine itération..."
  echo ""
  sleep 5
done

echo ""
echo "=========================================================="
echo "📊 RÉSULTAT FINAL"
echo "=========================================================="
echo "✅ Fichiers indexés: $INDEXED/$TOTAL"
echo "❌ Échecs totaux: $FAILED_TOTAL"
echo "📈 Taux de succès: $(awk "BEGIN {printf \"%.1f\", ($INDEXED/$TOTAL)*100}")%"
echo "⏱️  Terminé à: $(date '+%H:%M:%S')"
echo "=========================================================="
