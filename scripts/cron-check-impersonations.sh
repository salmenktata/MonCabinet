#!/bin/bash

# Script : cron-check-impersonations.sh
# Description : Vérifie les impersonnalisations actives et alerte si durée excessive (>1h)
# Usage : Cron horaire ou manuel
# Date : 2026-02-16

set -e

# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Timestamp
echo "=============================================="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Vérification Impersonations"
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
cron_start "check-impersonations" "scheduled"

# Trap pour gérer les erreurs inattendues
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

# Appeler l'API de vérification impersonations
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  --max-time 30 \
  https://qadhya.tn/api/admin/alerts/check-impersonations)

# Extraire le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

# Afficher résultat
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

# Vérifier le résultat
SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null || echo "false")
CHECKED=$(echo "$BODY" | jq -r '.checked' 2>/dev/null || echo "0")
ALERTS=$(echo "$BODY" | jq -r '.alerts' 2>/dev/null || echo "0")

if [ "$HTTP_CODE" = "200" ] && [ "$SUCCESS" = "true" ]; then
  if [ "$CHECKED" -gt "0" ]; then
    echo "⚠️  $CHECKED impersonation(s) longue(s) détectée(s), $ALERTS email(s) envoyé(s)"
    cron_complete "success" "$CHECKED impersonation(s) longue(s), $ALERTS alerte(s)"
  else
    echo "✅ Aucune impersonation longue détectée"
    cron_complete "success" "Aucune impersonation longue"
  fi
else
  echo "❌ Erreur lors de la vérification (HTTP $HTTP_CODE)"
  cron_fail "HTTP $HTTP_CODE" 1
fi

# Désactiver le trap si succès
trap - EXIT

echo "$(date '+%Y-%m-%d %H:%M:%S') - Fin vérification"
echo "=============================================="
