#!/bin/bash
#
# Watchdog - Surveille la réindexation et notifie quand terminé
#

REINDEX_PID=$1
LOG_FILE="/tmp/reindex-log.txt"

if [ -z "$REINDEX_PID" ]; then
  echo "Usage: $0 <PID>"
  exit 1
fi

echo "👀 Surveillance du processus $REINDEX_PID..."
echo "⏳ Vous serez notifié quand c'est terminé."
echo ""

# Attendre que le processus se termine
while ps -p $REINDEX_PID > /dev/null 2>&1; do
  sleep 30  # Vérifier toutes les 30s
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 RÉINDEXATION TERMINÉE !"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Afficher les logs finaux (dernières 30 lignes)
tail -30 "$LOG_FILE"

echo ""
echo "📋 Logs complets: $LOG_FILE"
echo ""
