#!/bin/bash
# Script de déploiement du fix d'indexation web_pages
# À exécuter APRÈS que GitHub Actions ait terminé le build

set -e

echo "=== Déploiement Fix Indexation Web Pages ==="
echo ""

# 1. Mettre à jour l'image Docker
echo "[1/4] Pull de la nouvelle image Docker..."
ssh root@84.247.165.187 "cd /opt/moncabinet && docker-compose pull"

# 2. Redémarrer le container
echo "[2/4] Redémarrage du container..."
ssh root@84.247.165.187 "cd /opt/moncabinet && docker-compose up -d"

# 3. Attendre que le container soit healthy
echo "[3/4] Attente du démarrage (30s)..."
sleep 30

# 4. Mettre à jour le script cron
echo "[4/4] Mise à jour du script cron..."
ssh root@84.247.165.187 'cat > /opt/moncabinet/index-kb-progressive.sh << '\''EOFSCRIPT'\''
#!/bin/bash
# Script d'\''indexation progressive via API endpoints
# Indexe knowledge_base ET web_pages (2 docs par batch chacun)

CRON_SECRET=$(docker exec moncabinet-nextjs env | grep CRON_SECRET | cut -d= -f2)
LOG_FILE="/var/log/kb-indexing.log"

echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - === Début cycle indexation ===" >> $LOG_FILE

# =============================================================================
# 1. Indexer knowledge_base (documents uploadés)
# =============================================================================
echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [KB] Indexation knowledge_base..." >> $LOG_FILE

KB_RESPONSE=$(timeout 240 curl -s -X GET "http://127.0.0.1:3000/api/admin/index-kb" \
  -H "Authorization: Bearer $CRON_SECRET" 2>&1)

KB_EXIT=$?

if [ $KB_EXIT -eq 124 ]; then
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [KB] ⚠️ Timeout après 4 minutes" >> $LOG_FILE
elif [ $KB_EXIT -eq 0 ]; then
  KB_SUMMARY=$(echo "$KB_RESPONSE" | grep -o '\''"indexed":[0-9]*'\'' | head -1)
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [KB] ✓ $KB_SUMMARY" >> $LOG_FILE
else
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [KB] ✗ Erreur (code: $KB_EXIT)" >> $LOG_FILE
fi

# =============================================================================
# 2. Indexer web_pages (pages crawlées)
# =============================================================================
echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [WEB] Indexation web_pages..." >> $LOG_FILE

WEB_RESPONSE=$(timeout 290 curl -s -X GET "http://127.0.0.1:3000/api/admin/index-web-pages" \
  -H "Authorization: Bearer $CRON_SECRET" 2>&1)

WEB_EXIT=$?

if [ $WEB_EXIT -eq 124 ]; then
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [WEB] ⚠️ Timeout après 4 minutes" >> $LOG_FILE
elif [ $WEB_EXIT -eq 0 ]; then
  WEB_SUMMARY=$(echo "$WEB_RESPONSE" | grep -o '\''"indexed":[0-9]*'\'' | head -1)
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [WEB] ✓ $WEB_SUMMARY" >> $LOG_FILE
else
  echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - [WEB] ✗ Erreur (code: $WEB_EXIT)" >> $LOG_FILE
fi

echo "$(date '\''+%Y-%m-%d %H:%M:%S'\'') - === Fin cycle indexation ===" >> $LOG_FILE
EOFSCRIPT'

# Rendre le script exécutable
ssh root@84.247.165.187 "chmod +x /opt/moncabinet/index-kb-progressive.sh"

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "Vérifications:"
echo "1. Logs cron:     tail -f /var/log/kb-indexing.log"
echo "2. Stats DB:      docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c \"SELECT COUNT(*) FILTER (WHERE is_indexed = false) FROM web_pages;\""
echo "3. Test API:      curl -H \"Authorization: Bearer \$CRON_SECRET\" http://localhost:3000/api/admin/index-web-pages"
echo ""
