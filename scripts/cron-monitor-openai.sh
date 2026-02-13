#!/bin/bash
# Cron quotidien : Monitoring usage OpenAI
# Alerte si budget proche de la limite
#
# Installation cron (en tant que root sur le serveur):
#   crontab -e
#   0 9 * * * /opt/qadhya/scripts/cron-monitor-openai.sh >> /var/log/qadhya/openai-monitor.log 2>&1

set -e

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Timestamp
echo "=============================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring OpenAI"
echo "=============================================="

# Récupérer le secret cron et configurer API
CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2)

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET introuvable dans .env.production.local"
  exit 1
fi

# Configurer variables pour cron-logger
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking de l'exécution
cron_start "monitor-openai" "scheduled"

# Trap pour gérer les erreurs inattendues
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

# Appeler l'API de monitoring
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  https://qadhya.tn/api/admin/monitor-openai)

# Extraire le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# Vérifier le niveau d'alerte
ALERT_LEVEL=$(echo "$BODY" | jq -r '.alert.level' 2>/dev/null || echo "unknown")
ALERT_MESSAGE=$(echo "$BODY" | jq -r '.alert.message' 2>/dev/null || echo "")

# Extraire métriques pour output JSON
USAGE=$(echo "$BODY" | jq -r '.usage // 0' 2>/dev/null || echo "0")
BUDGET=$(echo "$BODY" | jq -r '.budget // 0' 2>/dev/null || echo "0")
PERCENTAGE=$(echo "$BODY" | jq -r '.percentage // 0' 2>/dev/null || echo "0")

if [ "$ALERT_LEVEL" = "critical" ]; then
  echo "⚠️  ALERTE CRITIQUE: $ALERT_MESSAGE"
  echo "   Action: Vérifier solde OpenAI ou basculer sur Ollama"

  # Cleanup trap avant exit
  trap - EXIT

  # Enregistrer échec avec métriques
  OUTPUT_JSON=$(cat <<EOF
{
  "alertLevel": "critical",
  "alertMessage": "$ALERT_MESSAGE",
  "usage": $USAGE,
  "budget": $BUDGET,
  "percentage": $PERCENTAGE
}
EOF
)
  cron_fail "Budget OpenAI critique: $ALERT_MESSAGE" 1

  exit 1
elif [ "$ALERT_LEVEL" = "warning" ]; then
  echo "⚡ WARNING: $ALERT_MESSAGE"
fi

echo ""
echo "✅ Monitoring terminé"
echo ""

# Cleanup trap
trap - EXIT

# Enregistrer succès avec métriques
OUTPUT_JSON=$(cat <<EOF
{
  "alertLevel": "$ALERT_LEVEL",
  "alertMessage": "$ALERT_MESSAGE",
  "usage": $USAGE,
  "budget": $BUDGET,
  "percentage": $PERCENTAGE
}
EOF
)

cron_complete "$OUTPUT_JSON"

exit 0
