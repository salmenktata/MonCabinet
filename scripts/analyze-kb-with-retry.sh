#!/bin/bash
#
# Analyse KB qualité avec retry logic
# - Réessaie en cas d'échec
# - Gère les timeouts
# - Meilleur taux de succès
#

API_URL="https://qadhya.tn/api/admin/kb/analyze-quality"
BATCH_SIZE=20
MAX_RETRIES=3
PAUSE_BETWEEN_BATCHES=3
PAUSE_ON_ERROR=10
LOG_FILE="/tmp/kb-analysis-retry.log"

echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  🎯 Analyse Qualité KB avec Retry Logic - $(date)" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

BATCH=1
TOTAL_SUCCESS=0
TOTAL_FAILED=0
TOTAL_ANALYZED=0

while true; do
    echo "─────────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"
    echo "🔄 Batch $BATCH - $(date +%H:%M:%S)" | tee -a "$LOG_FILE"
    echo "─────────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"

    RETRY=0
    SUCCESS=false

    while [ $RETRY -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
        if [ $RETRY -gt 0 ]; then
            echo "   🔁 Retry $RETRY/$MAX_RETRIES..." | tee -a "$LOG_FILE"
            sleep $PAUSE_ON_ERROR
        fi

        # Appel API avec timeout de 120s
        RESPONSE=$(curl -s -m 120 -X POST "$API_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"batchSize\":$BATCH_SIZE,\"skipAnalyzed\":true}" 2>&1)

        CURL_EXIT=$?

        if [ $CURL_EXIT -eq 0 ]; then
            # Parse JSON
            ANALYZED=$(echo "$RESPONSE" | jq -r '.analyzed // 0' 2>/dev/null)
            SUCCEEDED=$(echo "$RESPONSE" | jq -r '.succeeded // 0' 2>/dev/null)
            FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0' 2>/dev/null)

            if [ "$ANALYZED" != "0" ] && [ "$ANALYZED" != "null" ]; then
                SUCCESS=true
                TOTAL_ANALYZED=$((TOTAL_ANALYZED + ANALYZED))
                TOTAL_SUCCESS=$((TOTAL_SUCCESS + SUCCEEDED))
                TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

                echo "   ✅ Analysés: $ANALYZED | Réussis: $SUCCEEDED | Échoués: $FAILED" | tee -a "$LOG_FILE"
                echo "   📊 Total: $TOTAL_SUCCESS réussis sur $TOTAL_ANALYZED tentés" | tee -a "$LOG_FILE"

                # Si moins de documents que demandé, on a terminé
                if [ "$ANALYZED" -lt "$BATCH_SIZE" ]; then
                    echo "" | tee -a "$LOG_FILE"
                    echo "✅ Tous les documents disponibles ont été analysés !" | tee -a "$LOG_FILE"
                    echo "" | tee -a "$LOG_FILE"
                    echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
                    echo "  📊 RÉSUMÉ FINAL" | tee -a "$LOG_FILE"
                    echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
                    echo "   Total analysés: $TOTAL_ANALYZED" | tee -a "$LOG_FILE"
                    echo "   Réussis: $TOTAL_SUCCESS" | tee -a "$LOG_FILE"
                    echo "   Échoués: $TOTAL_FAILED" | tee -a "$LOG_FILE"
                    echo "   Taux succès: $(( TOTAL_SUCCESS * 100 / TOTAL_ANALYZED ))%" | tee -a "$LOG_FILE"
                    echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
                    exit 0
                fi
            else
                echo "   ⚠️  Réponse invalide (retry)" | tee -a "$LOG_FILE"
            fi
        else
            echo "   ❌ Erreur curl (code: $CURL_EXIT)" | tee -a "$LOG_FILE"
        fi

        RETRY=$((RETRY + 1))
    done

    if [ "$SUCCESS" = false ]; then
        echo "   🔴 Échec après $MAX_RETRIES tentatives - pause 30s" | tee -a "$LOG_FILE"
        sleep 30
    fi

    BATCH=$((BATCH + 1))
    sleep $PAUSE_BETWEEN_BATCHES
done
