#!/bin/bash
# Cron mensuel : Mise à jour constitution depuis IORT (1er du mois à 3h)
# Crawle la page M4 IORT, OCR PDF, réindexe article par article (~142 فصل)
#
# Installation cron (en tant que root sur le serveur):
#   crontab -e
#   0 3 1 * * /opt/qadhya/scripts/cron-crawl-iort-constitution.sh >> /var/log/qadhya/iort-constitution.log 2>&1

set -e

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

echo "=============================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Crawl Constitution IORT"
echo "=============================================="

# Récupérer le secret cron depuis le container Docker
CRON_SECRET=$(docker exec qadhya-nextjs env | grep CRON_SECRET | cut -d= -f2)

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET introuvable dans le container"
  exit 1
fi

export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking
cron_start "iort-constitution-refresh" "scheduled"
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

echo ""
echo "--- Lancement crawl IORT (timeout 10min) ---"

# Appeler via localhost pour bypass Nginx timeout (OCR 42 pages = ~7 min)
RESPONSE=$(docker exec qadhya-nextjs sh -c "curl -s -w '\nHTTP_CODE:%{http_code}' --max-time 650 \
  -H 'X-Cron-Secret: $CRON_SECRET' \
  'http://localhost:3000/api/admin/iort/crawl-constitution'" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null || echo "false")
CHUNKS=$(echo "$BODY" | jq -r '.chunksCreated' 2>/dev/null || echo "0")
ELAPSED=$(echo "$BODY" | jq -r '.elapsed' 2>/dev/null || echo "0")
TITLE=$(echo "$BODY" | jq -r '.title' 2>/dev/null || echo "")

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Constitution IORT mise à jour : $CHUNKS chunks créés en ${ELAPSED}s"
else
  ERROR=$(echo "$BODY" | jq -r '.error' 2>/dev/null || echo "Erreur inconnue")
  echo "❌ Échec crawl IORT : $ERROR"

  trap - EXIT
  OUTPUT_JSON=$(cat <<EOF
{
  "success": false,
  "error": "$ERROR",
  "httpCode": $HTTP_CODE
}
EOF
)
  cron_fail "$ERROR" 1
  exit 1
fi

echo ""
echo "=============================================="
trap - EXIT

OUTPUT_JSON=$(cat <<EOF
{
  "success": true,
  "chunksCreated": $CHUNKS,
  "elapsed": $ELAPSED,
  "title": "$TITLE",
  "httpCode": $HTTP_CODE
}
EOF
)
cron_complete "$OUTPUT_JSON"
exit 0
