#!/bin/bash
# Cron quotidien : Monitoring usage OpenAI
# Alerte si budget proche de la limite
#
# Installation cron (en tant que root sur le serveur):
#   crontab -e
#   0 9 * * * /opt/qadhya/scripts/cron-monitor-openai.sh >> /var/log/qadhya/openai-monitor.log 2>&1

set -e

# Timestamp
echo "=============================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring OpenAI"
echo "=============================================="

# Charger les variables d'environnement
cd /opt/qadhya
source /opt/qadhya/.env.production.local

# Exécuter le monitoring
npx tsx scripts/monitor-openai-usage.ts

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "⚠️  ALERTE envoyée - Vérifier le budget OpenAI"

  # TODO: Envoyer notification (email, Slack, etc.)
  # curl -X POST https://hooks.slack.com/... -d "Budget OpenAI critique"
fi

echo ""
echo "Monitoring terminé avec code: $EXIT_CODE"
echo ""
