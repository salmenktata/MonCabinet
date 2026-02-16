#!/bin/bash
#
# Script d'installation du cron de nettoyage KB sur le serveur de production
#
# Usage :
#   bash scripts/setup-kb-cleanup-cron.sh
#

set -euo pipefail

echo "🚀 Installation du cron de nettoyage KB"
echo ""

# Vérifier qu'on est sur le serveur de production
if [ ! -d "/opt/qadhya" ]; then
  echo "❌ Ce script doit être exécuté sur le serveur de production"
  echo "   Utilisez : ssh root@84.247.165.187 'bash -s' < scripts/setup-kb-cleanup-cron.sh"
  exit 1
fi

# Configuration
CRON_SCRIPT="/opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh"
LOG_DIR="/var/log/qadhya"
CRON_TIME="0 2 * * *"  # 2h du matin tous les jours

echo "📋 Configuration :"
echo "   - Script cron : ${CRON_SCRIPT}"
echo "   - Logs : ${LOG_DIR}/kb-cleanup.log"
echo "   - Planification : ${CRON_TIME} (2h du matin quotidien)"
echo ""

# Créer le répertoire de logs
mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Rendre le script exécutable
chmod +x "$CRON_SCRIPT"

# Vérifier si le cron existe déjà
if crontab -l 2>/dev/null | grep -q "cron-cleanup-corrupted-kb.sh"; then
  echo "⚠️  Le cron existe déjà dans la crontab"
  echo ""
  echo "Voulez-vous le remplacer ? (y/N)"
  read -r response
  if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
    echo "❌ Installation annulée"
    exit 0
  fi

  # Supprimer l'ancien cron
  crontab -l 2>/dev/null | grep -v "cron-cleanup-corrupted-kb.sh" | crontab -
  echo "✅ Ancien cron supprimé"
fi

# Ajouter le nouveau cron
(crontab -l 2>/dev/null; echo "${CRON_TIME} ${CRON_SCRIPT}") | crontab -

echo ""
echo "✅ Cron installé avec succès !"
echo ""
echo "📋 Crontab actuelle :"
crontab -l | grep "cron-cleanup-corrupted-kb.sh"
echo ""
echo "🔧 Commandes utiles :"
echo "   - Voir les logs : tail -f ${LOG_DIR}/kb-cleanup.log"
echo "   - Exécuter manuellement : bash ${CRON_SCRIPT}"
echo "   - Éditer le cron : crontab -e"
echo "   - Voir tous les crons : crontab -l"
echo ""
echo "✅ Installation terminée"
