#!/bin/bash
# Cron horaire : Vérification alertes KB + email si nécessaire
# Alerte si budget OpenAI critique, échecs importants, etc.
#
# Installation cron (en tant que root sur le serveur):
#   crontab -e
#   0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

set -e

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
  exit 1
fi

echo ""
echo "✅ Vérification terminée"
echo ""
