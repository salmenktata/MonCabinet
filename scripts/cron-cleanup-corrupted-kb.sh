#!/bin/bash
#
# Cron de nettoyage quotidien des contenus corrompus dans la KB
#
# Crontab recommandé :
#   0 2 * * * /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh
#
# Description :
#   - Exécuté tous les jours à 2h du matin
#   - Identifie et nettoie les documents avec >50% de chunks corrompus
#   - Envoie un email d'alerte si >10 documents nettoyés
#   - Logs dans /var/log/qadhya/kb-cleanup.log
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${LOG_FILE:-/var/log/qadhya/kb-cleanup.log}"
MIN_CORRUPTION_RATIO="${MIN_CORRUPTION_RATIO:-0.5}"
ALERT_THRESHOLD="${ALERT_THRESHOLD:-10}"

# Charger la bibliothèque cron-logger si disponible
if [ -f "$SCRIPT_DIR/lib/cron-logger.sh" ]; then
  source "$SCRIPT_DIR/lib/cron-logger.sh"
else
  # Fonctions de fallback simples
  cron_start() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] START: $1" >> "$LOG_FILE"; }
  cron_complete() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] COMPLETE: $1" >> "$LOG_FILE"; }
  cron_fail() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] FAIL: $1 - $2" >> "$LOG_FILE"; }
fi

# Nom du cron
CRON_NAME="cleanup-corrupted-kb"

# Créer le répertoire de logs si nécessaire
mkdir -p "$(dirname "$LOG_FILE")"

# Fonction pour logger
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Fonction pour envoyer une alerte email
send_alert() {
  local subject="$1"
  local message="$2"

  # Utiliser l'API d'alertes si disponible
  if [ -n "${CRON_API_BASE:-}" ] && [ -n "${CRON_SECRET:-}" ]; then
    curl -X POST "${CRON_API_BASE}/api/admin/alerts/send" \
      -H "X-Cron-Secret: ${CRON_SECRET}" \
      -H "Content-Type: application/json" \
      -d "{
        \"subject\": \"$subject\",
        \"message\": \"$message\",
        \"severity\": \"warning\"
      }" \
      2>&1 | tee -a "$LOG_FILE" || true
  fi
}

# Début du cron
cron_start "$CRON_NAME"

log "================================================"
log "🧹 Nettoyage des contenus corrompus KB"
log "================================================"
log ""
log "Configuration :"
log "  - Ratio min corruption : ${MIN_CORRUPTION_RATIO}"
log "  - Seuil alerte : ${ALERT_THRESHOLD} documents"
log "  - Log file : ${LOG_FILE}"
log ""

# Exécuter le nettoyage
cd "$PROJECT_DIR"

# Créer un fichier temporaire pour capturer la sortie
TEMP_OUTPUT=$(mktemp)

if npx tsx scripts/cleanup-corrupted-kb.ts \
  --min-ratio="$MIN_CORRUPTION_RATIO" \
  2>&1 | tee "$TEMP_OUTPUT" >> "$LOG_FILE"; then

  # Extraire le nombre de documents nettoyés
  CLEANED_COUNT=$(grep "Documents nettoyés:" "$TEMP_OUTPUT" | grep -oP '\d+' | head -1 || echo "0")

  log ""
  log "✅ Nettoyage terminé avec succès"
  log "   Documents nettoyés : ${CLEANED_COUNT}"

  # Vérifier si on doit envoyer une alerte
  if [ "$CLEANED_COUNT" -ge "$ALERT_THRESHOLD" ]; then
    log "⚠️  Seuil d'alerte atteint (${CLEANED_COUNT} >= ${ALERT_THRESHOLD})"

    ALERT_MESSAGE="Le nettoyage quotidien de la KB a détecté et nettoyé ${CLEANED_COUNT} documents corrompus.

Configuration :
- Ratio minimum de corruption : ${MIN_CORRUPTION_RATIO}
- Seuil d'alerte : ${ALERT_THRESHOLD}

Action recommandée :
Vérifier les sources de données et améliorer l'extraction de texte.

Logs complets : ${LOG_FILE}

Dashboard : https://qadhya.tn/super-admin/knowledge-base"

    send_alert "⚠️ KB Cleanup Alert: ${CLEANED_COUNT} documents nettoyés" "$ALERT_MESSAGE"
  fi

  # Déclencher la réindexation si nécessaire
  if [ "$CLEANED_COUNT" -gt "0" ]; then
    log ""
    log "🔄 Déclenchement de la réindexation améliorée..."

    if npx tsx scripts/reindex-kb-improved.ts --batch-size=5 2>&1 | tee -a "$LOG_FILE"; then
      log "✅ Réindexation terminée avec succès"
    else
      log "⚠️  La réindexation a échoué, mais le nettoyage a réussi"
    fi
  fi

  cron_complete "$CRON_NAME"

else
  ERROR_MSG="Échec du nettoyage des contenus corrompus"
  log "❌ ${ERROR_MSG}"

  cron_fail "$CRON_NAME" "$ERROR_MSG"

  # Envoyer une alerte en cas d'échec
  send_alert "❌ KB Cleanup Failed" "Le nettoyage quotidien de la KB a échoué. Vérifier les logs : ${LOG_FILE}"

  exit 1
fi

# Nettoyer le fichier temporaire
rm -f "$TEMP_OUTPUT"

log ""
log "================================================"
log "✅ Cron cleanup-corrupted-kb terminé"
log "================================================"

exit 0
