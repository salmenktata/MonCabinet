#!/bin/bash
# Script de vérification des routes API cron monitoring en production
# Vérifie que les routes start/complete sont accessibles et retournent 401 (pas 404)

set -e

echo "════════════════════════════════════════════════════════════════"
echo "   VÉRIFICATION ROUTES API CRON MONITORING - PRODUCTION"
echo "════════════════════════════════════════════════════════════════"

PROD_URL="https://qadhya.tn"

echo ""
echo "▓▓▓ TEST 1 : Route /api/admin/monitoring/crons/start ▓▓▓"
echo "Appel sans authentification (attendu: 401 Unauthorized, PAS 404)"

STATUS_START=$(curl -s -o /dev/null -w "%{http_code}" "${PROD_URL}/api/admin/monitoring/crons/start" -X POST)

if [ "$STATUS_START" = "401" ]; then
  echo "✅ Route START existe et retourne 401 (authentification requise)"
elif [ "$STATUS_START" = "404" ]; then
  echo "❌ Route START retourne 404 (NOT FOUND) - déploiement incomplet !"
  exit 1
else
  echo "⚠️  Route START retourne $STATUS_START (inattendu)"
fi

echo ""
echo "▓▓▓ TEST 2 : Route /api/admin/monitoring/crons/complete ▓▓▓"
echo "Appel sans authentification (attendu: 401 Unauthorized, PAS 404)"

STATUS_COMPLETE=$(curl -s -o /dev/null -w "%{http_code}" "${PROD_URL}/api/admin/monitoring/crons/complete" -X POST)

if [ "$STATUS_COMPLETE" = "401" ]; then
  echo "✅ Route COMPLETE existe et retourne 401 (authentification requise)"
elif [ "$STATUS_COMPLETE" = "404" ]; then
  echo "❌ Route COMPLETE retourne 404 (NOT FOUND) - déploiement incomplet !"
  exit 1
else
  echo "⚠️  Route COMPLETE retourne $STATUS_COMPLETE (inattendu)"
fi

echo ""
echo "▓▓▓ TEST 3 : Dernières exécutions index-kb ▓▓▓"
echo "Vérification via API monitoring (dernières exécutions)..."

# SSH pour query directe DB (plus fiable)
ssh root@84.247.165.187 << 'REMOTE_SQL'
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  cron_name,
  status,
  started_at,
  completed_at,
  duration_ms,
  error_message
FROM cron_executions
WHERE cron_name = 'index-kb'
ORDER BY started_at DESC
LIMIT 5;
"
REMOTE_SQL

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "   VÉRIFICATION TERMINÉE"
echo "════════════════════════════════════════════════════════════════"

if [ "$STATUS_START" = "401" ] && [ "$STATUS_COMPLETE" = "401" ]; then
  echo "✅ Toutes les routes API sont accessibles"
  echo ""
  echo "📋 Prochaines étapes :"
  echo "  1. Attendre la prochaine exécution de index-kb (toutes les 5 min)"
  echo "  2. Vérifier qu'il n'y a plus d'erreur HTTP 404"
  echo "  3. Monitorer le dashboard : ${PROD_URL}/super-admin/monitoring?tab=crons"
  exit 0
else
  echo "❌ Certaines routes sont inaccessibles"
  exit 1
fi
