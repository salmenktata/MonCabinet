#!/bin/bash
# =============================================================================
# Cron : Vérification fraîcheur des documents juridiques
# Quotidien - Détecte les documents périmés nécessitant re-crawl
#
# Usage: bash scripts/cron-check-freshness.sh
# Cron:  0 6 * * * /opt/qadhya/scripts/cron-check-freshness.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Charger la bibliothèque de logging cron (si disponible)
if [ -f "$SCRIPT_DIR/lib/cron-logger.sh" ]; then
  source "$SCRIPT_DIR/lib/cron-logger.sh"
  HAS_LOGGER=true
else
  HAS_LOGGER=false
fi

CRON_NAME="check-freshness"
LOG_FILE="${LOG_DIR:-/var/log/qadhya}/freshness-check.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Démarrer le tracking cron
if [ "$HAS_LOGGER" = true ]; then
  cron_start "$CRON_NAME" || true
fi

log "=== Vérification fraîcheur documents juridiques ==="

# Récupérer les variables d'environnement
if [ -n "${CRON_API_BASE:-}" ]; then
  API_BASE="$CRON_API_BASE"
elif [ -n "${NEXT_PUBLIC_APP_URL:-}" ]; then
  API_BASE="$NEXT_PUBLIC_APP_URL"
else
  API_BASE="https://qadhya.tn"
fi

# Récupérer le CRON_SECRET
if [ -n "${CRON_SECRET:-}" ]; then
  SECRET="$CRON_SECRET"
else
  SECRET=$(docker exec qadhya-nextjs printenv CRON_SECRET 2>/dev/null || echo "")
  if [ -z "$SECRET" ]; then
    log "❌ CRON_SECRET non disponible"
    if [ "$HAS_LOGGER" = true ]; then
      cron_fail "$CRON_NAME" "CRON_SECRET non disponible" || true
    fi
    exit 1
  fi
fi

# Appeler l'API de vérification fraîcheur
log "📡 Appel API: $API_BASE/api/admin/legal-documents/freshness"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "X-Cron-Secret: $SECRET" \
  "$API_BASE/api/admin/legal-documents/freshness" \
  2>&1) || true

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  # Extraire les stats
  TOTAL=$(echo "$BODY" | jq -r '.totalDocuments // 0')
  FRESH=$(echo "$BODY" | jq -r '.freshDocuments // 0')
  STALE=$(echo "$BODY" | jq -r '.staleDocuments | length // 0')
  CRITICAL=$(echo "$BODY" | jq -r '.criticalCount // 0')

  log "✅ Vérification terminée"
  log "   Total: $TOTAL documents"
  log "   Frais: $FRESH"
  log "   Périmés: $STALE"
  log "   Critiques: $CRITICAL"

  if [ "$CRITICAL" -gt 0 ]; then
    log "⚠️ $CRITICAL documents critiques nécessitent un re-crawl immédiat"
  fi

  if [ "$HAS_LOGGER" = true ]; then
    cron_complete "$CRON_NAME" "{\"total\": $TOTAL, \"fresh\": $FRESH, \"stale\": $STALE, \"critical\": $CRITICAL}" || true
  fi
else
  log "❌ Erreur API (HTTP $HTTP_CODE)"
  log "   Réponse: $BODY"

  if [ "$HAS_LOGGER" = true ]; then
    cron_fail "$CRON_NAME" "HTTP $HTTP_CODE" || true
  fi
  exit 1
fi

log "=== Fin vérification fraîcheur ==="
