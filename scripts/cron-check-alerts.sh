#!/bin/bash
# Cron horaire : Vérification alertes KB + email si nécessaire
# Alerte si budget OpenAI critique, échecs importants, etc.
#
# Installation cron (en tant que root sur le serveur):
#   crontab -e
#   0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

set -e

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Timestamp
echo "=============================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Vérification Alertes"
echo "=============================================="

# Récupérer le secret cron depuis le container Docker
CRON_SECRET=$(docker exec qadhya-nextjs env | grep CRON_SECRET | cut -d= -f2)

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET introuvable dans le container"
  exit 1
fi

# Configurer variables pour cron-logger
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking de l'exécution
cron_start "check-alerts" "scheduled"

# Trap pour gérer les erreurs inattendues
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

# --- Vérification Health endpoint ---
echo ""
echo "--- Vérification Health ---"
HEALTH_RESPONSE=$(curl -s --max-time 10 -w "\nHTTP_CODE:%{http_code}" https://qadhya.tn/api/health 2>/dev/null || echo -e "\nHTTP_CODE:000")
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | grep HTTP_CODE | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/HTTP_CODE/d')
HEALTH_STATUS=$(echo "$HEALTH_BODY" | jq -r '.status' 2>/dev/null || echo "unknown")

if [ "$HEALTH_HTTP_CODE" = "000" ] || [ "${HEALTH_HTTP_CODE:-0}" -ge 500 ]; then
  echo "🔴 Site inaccessible (HTTP ${HEALTH_HTTP_CODE}) — le watchdog devrait gérer le restart"
elif [ "$HEALTH_STATUS" != "healthy" ]; then
  echo "⚠️  Health status dégradé: $HEALTH_STATUS (HTTP $HEALTH_HTTP_CODE)"
  # Déclencher une vérification d'alerte supplémentaire (l'API est accessible)
  curl -s --max-time 10 \
    -H "X-Cron-Secret: $CRON_SECRET" \
    "https://qadhya.tn/api/admin/alerts/check" > /dev/null 2>&1 || true
else
  echo "✅ Health OK (status=$HEALTH_STATUS)"
fi
echo ""

# Appeler l'API de vérification alertes
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  https://qadhya.tn/api/admin/alerts/check)

# Extraire le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

# Afficher résultat
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# Vérifier le résultat
ALERTS_DETECTED=$(echo "$BODY" | jq -r '.alertsDetected' 2>/dev/null || echo "0")
ALERTS_SENT=$(echo "$BODY" | jq -r '.alertsSent' 2>/dev/null || echo "0")
SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null || echo "false")

if [ "$SUCCESS" = "true" ]; then
  if [ "$ALERTS_DETECTED" -gt "0" ]; then
    echo "⚠️  $ALERTS_DETECTED alerte(s) détectée(s), $ALERTS_SENT email(s) envoyé(s)"
  else
    echo "✅ Aucune alerte - Système normal"
  fi
else
  echo "❌ Erreur lors de la vérification des alertes"

  # Cleanup trap avant exit
  trap - EXIT

  # Enregistrer échec
  OUTPUT_JSON=$(cat <<EOF
{
  "success": false,
  "alertsDetected": $ALERTS_DETECTED,
  "alertsSent": $ALERTS_SENT,
  "httpCode": $HTTP_CODE
}
EOF
)
  cron_fail "Erreur API alerts/check (HTTP $HTTP_CODE)" 1

  exit 1
fi

echo ""
echo "✅ Vérification terminée"
echo ""

# Cleanup trap
trap - EXIT

# Enregistrer succès avec métriques
OUTPUT_JSON=$(cat <<EOF
{
  "success": true,
  "alertsDetected": $ALERTS_DETECTED,
  "alertsSent": $ALERTS_SENT,
  "httpCode": $HTTP_CODE,
  "healthStatus": "$HEALTH_STATUS"
}
EOF
)

cron_complete "$OUTPUT_JSON"

exit 0
