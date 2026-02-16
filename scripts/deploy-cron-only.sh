#!/bin/bash
# Déploiement manuel du script cron uniquement
# (sans attendre le build Docker complet)

set -e

echo "=== Déploiement Manuel Script Cron Indexation Web ==="
echo ""

# 1. Vérifier que l'API existe déjà dans l'image actuelle
echo "[1/3] Test si l'API /index-web-pages existe déjà..."
RESPONSE=$(ssh root@84.247.165.187 "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/admin/index-web-pages" || echo "000")

if [ "$RESPONSE" = "401" ]; then
  echo "✅ L'API existe déjà (401 Unauthorized = endpoint existe)"
elif [ "$RESPONSE" = "404" ]; then
  echo "❌ L'API n'existe pas encore, attendre le build Docker..."
  exit 1
else
  echo "⚠️ Statut inattendu: $RESPONSE, on continue quand même..."
fi

# 2. Mettre à jour le script cron
echo ""
echo "[2/3] Mise à jour du script cron..."
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

echo "✅ Script cron mis à jour"

# 3. Test manuel du script cron
echo ""
echo "[3/3] Test manuel d'exécution..."
ssh root@84.247.165.187 "bash /opt/moncabinet/index-kb-progressive.sh"

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "📊 Vérifications:"
echo "1. Logs en temps réel:  tail -f /var/log/kb-indexing.log"
echo "2. Stats web_pages:     ssh root@84.247.165.187 \"docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c 'SELECT COUNT(*) FILTER (WHERE is_indexed = false) FROM web_pages;'\""
echo "3. Prochain cycle:      Dans 5 minutes (cron toutes les 5min)"
echo ""
