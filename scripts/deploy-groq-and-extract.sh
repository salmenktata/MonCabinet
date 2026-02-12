#!/bin/bash
#
# Script tout-en-un : Active Groq et lance extraction complète
# À exécuter demain matin avec la nouvelle clé Groq
#
# Usage: ./scripts/deploy-groq-and-extract.sh <GROQ_API_KEY>
#

set -e

if [ -z "$1" ]; then
  echo "❌ Erreur : Clé API Groq manquante"
  echo ""
  echo "Usage: ./scripts/deploy-groq-and-extract.sh <GROQ_API_KEY>"
  echo ""
  echo "Obtenir une clé gratuite : https://console.groq.com/keys"
  exit 1
fi

GROQ_KEY="$1"
SOURCE_ID="4319d2d1-569c-4107-8f52-d71e2a2e9fe9"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     ACTIVATION GROQ + EXTRACTION COMPLÈTE                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 1. Activer Groq et désactiver mode Regex-only
echo "🔧 Configuration Groq..."
ssh root@84.247.165.187 "cd /opt/moncabinet && \
  sed -i 's/^GROQ_API_KEY=.*/GROQ_API_KEY=$GROQ_KEY/' .env && \
  sed -i 's/^FORCE_REGEX_ONLY=.*/FORCE_REGEX_ONLY=false/' .env && \
  sed -i 's/^OLLAMA_ENABLED=.*/OLLAMA_ENABLED=false/' .env && \
  echo '✅ Variables configurées'"

# 2. Redémarrer container
echo "🔄 Redémarrage container..."
ssh root@84.247.165.187 'docker restart qadhya-nextjs'
echo "⏳ Attente démarrage (15s)..."
sleep 15
echo "✅ Container prêt"

# 3. Tester la connexion Groq
echo ""
echo "🧪 Test connexion Groq..."
ssh root@84.247.165.187 'source /opt/moncabinet/.env && \
  curl -s https://api.groq.com/openai/v1/models \
    -H "Authorization: Bearer $GROQ_API_KEY" | \
  jq -r "(.data[0].id // .error.message) | select(length > 0)" | head -1'

TEST_RESULT=$?
if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Erreur : Clé Groq invalide ou problème de connexion"
  exit 1
fi
echo "✅ Groq opérationnel"

# 4. Vérifier état actuel
echo ""
echo "📊 État actuel des métadonnées..."
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"
  SELECT
    COUNT(*) as total,
    COUNT(wpsm.web_page_id) as avec_metadata,
    COUNT(*) - COUNT(wpsm.web_page_id) as restantes
  FROM web_pages wp
  LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
  WHERE wp.web_source_id = '$SOURCE_ID';
\""

# 5. Créer script cron optimisé avec Groq
echo ""
echo "⚙️  Configuration cron extraction..."
ssh root@84.247.165.187 "cat > /opt/moncabinet/cron-extract-groq.sh << 'EOFSCRIPT'
#!/bin/bash
source /opt/moncabinet/.env
curl -s -X POST https://qadhya.tn/api/cron/extract-metadata \\
  -H \"Authorization: Bearer \$CRON_SECRET\" \\
  -H \"Content-Type: application/json\" \\
  -d '{\"sourceId\":\"$SOURCE_ID\",\"batchSize\":20,\"concurrency\":5}' \\
  >> /var/log/cron-metadata-groq.log 2>&1
EOFSCRIPT
chmod +x /opt/moncabinet/cron-extract-groq.sh
echo '✅ Script cron créé'"

# 6. Configurer cron (toutes les 2 minutes)
echo "📅 Activation cron (toutes les 2 minutes)..."
ssh root@84.247.165.187 '(crontab -l 2>/dev/null | grep -v "cron-extract"; echo "*/2 * * * * /opt/moncabinet/cron-extract-groq.sh") | crontab - && echo "✅ Cron activé"'

# 7. Lancer premier batch immédiatement
echo ""
echo "🚀 Lancement premier batch..."
ssh root@84.247.165.187 '/opt/moncabinet/cron-extract-groq.sh'
sleep 5
ssh root@84.247.165.187 'tail -n 5 /var/log/cron-metadata-groq.log'

# 8. Afficher estimation
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    EXTRACTION LANCÉE                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Configuration :"
echo "   - Provider    : Groq (llama-3.3-70b-versatile)"
echo "   - Batch size  : 20 pages"
echo "   - Concurrency : 5"
echo "   - Fréquence   : Toutes les 2 minutes"
echo ""
echo "⚡ Performance attendue :"
echo "   - Vitesse     : 10-20 pages/min"
echo "   - Durée totale: 4-6 heures"
echo "   - Coût estimé : ~\$0.40"
echo ""
echo "📈 Monitoring :"
echo "   ssh root@84.247.165.187 'watch -n 30 \"docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \\\"SELECT COUNT(wpsm.web_page_id) FROM web_pages wp LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id WHERE wp.web_source_id = '\\''$SOURCE_ID'\\''\\\"\"'"
echo ""
echo "📋 Logs :"
echo "   ssh root@84.247.165.187 'tail -f /var/log/cron-metadata-groq.log'"
echo ""
echo "✅ Tout est configuré ! L'extraction continue automatiquement."
echo ""
