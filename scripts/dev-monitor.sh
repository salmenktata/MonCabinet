#!/bin/bash
#
# Script de monitoring pour le serveur de développement
# Vérifie la santé du serveur et le redémarre si nécessaire
#
# Usage: ./scripts/dev-monitor.sh
#

PORT=7002
HEALTH_URL="http://localhost:$PORT/api/health"
TIMEOUT=5
MAX_FAILURES=3
CHECK_INTERVAL=30

failures=0

echo "🔍 Monitoring du serveur sur le port $PORT..."
echo "   Health check: $HEALTH_URL"
echo "   Timeout: ${TIMEOUT}s | Max échecs: $MAX_FAILURES | Intervalle: ${CHECK_INTERVAL}s"
echo ""

check_health() {
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$HEALTH_URL" 2>/dev/null)
    echo "$response"
}

restart_server() {
    echo "🔄 Redémarrage du serveur..."

    # Arrêter le serveur
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    sleep 2

    # Nettoyer le cache
    rm -rf .next

    # Redémarrer en arrière-plan
    npm run dev > /tmp/moncabinet-dev.log 2>&1 &

    echo "⏳ Attente du démarrage..."
    sleep 10

    # Vérifier que le serveur a redémarré
    status=$(check_health)
    if [ "$status" = "200" ]; then
        echo "✅ Serveur redémarré avec succès!"
        failures=0
    else
        echo "❌ Échec du redémarrage (status: $status)"
    fi
}

while true; do
    status=$(check_health)
    timestamp=$(date "+%H:%M:%S")

    if [ "$status" = "200" ]; then
        if [ $failures -gt 0 ]; then
            echo "[$timestamp] ✅ Serveur récupéré (était à $failures échecs)"
        fi
        failures=0
    else
        failures=$((failures + 1))
        echo "[$timestamp] ⚠️  Health check échoué (status: $status) - Échec $failures/$MAX_FAILURES"

        if [ $failures -ge $MAX_FAILURES ]; then
            echo "[$timestamp] 🚨 Trop d'échecs, redémarrage automatique..."
            restart_server
        fi
    fi

    sleep $CHECK_INTERVAL
done
