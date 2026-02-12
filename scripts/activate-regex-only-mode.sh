#!/bin/bash
#
# Active le mode FORCE_REGEX_ONLY et relance l'extraction
#

set -e

echo "🔧 Activation du mode FORCE_REGEX_ONLY..."

# 1. Ajouter la variable d'environnement
ssh root@84.247.165.187 'cd /opt/moncabinet && \
  grep -q "FORCE_REGEX_ONLY" .env || echo "FORCE_REGEX_ONLY=true" >> .env && \
  sed -i "s/FORCE_REGEX_ONLY=.*/FORCE_REGEX_ONLY=true/" .env && \
  echo "✅ Variable ajoutée à .env"'

# 2. Redémarrer le container pour charger la variable
echo "🔄 Redémarrage container..."
ssh root@84.247.165.187 'docker restart qadhya-nextjs'
echo "✅ Container redémarré"

# 3. Attendre que le container soit prêt
echo "⏳ Attente container (10s)..."
sleep 10

# 4. Vérifier que la variable est chargée
echo "🔍 Vérification..."
ssh root@84.247.165.187 'docker exec qadhya-nextjs printenv | grep FORCE_REGEX_ONLY || echo "⚠️ Variable non visible (sera chargée au runtime)"'

# 5. Arrêter les processus d'extraction en cours
echo "🛑 Arrêt processus existants..."
ssh root@84.247.165.187 'ps aux | grep "extract-metadata" | grep -v grep | awk "{print \$2}" | xargs kill -9 2>/dev/null || true'

# 6. Nettoyer les logs
ssh root@84.247.165.187 'echo "" > /var/log/metadata-extraction.log'

# 7. Relancer l'extraction avec paramètres optimisés
echo "🚀 Lancement extraction Regex-only..."
ssh root@84.247.165.187 'cd /opt/moncabinet && \
  nohup ./scripts/extract-metadata-9anoun-prod.sh \
    --batch-size 50 \
    --concurrency 20 \
    --delay 0 \
    > /var/log/metadata-extraction.log 2>&1 &'

echo "✅ Extraction lancée !"
echo ""
echo "📊 Paramètres optimisés Regex-only :"
echo "   - Batch size : 50 (au lieu de 20)"
echo "   - Concurrency : 20 (au lieu de 10)"
echo "   - Delay : 0s (pas d'attente)"
echo "   - Mode : Regex seul (pas de LLM)"
echo ""
echo "⚡ Vitesse attendue : 30-50 pages/min"
echo "⏱️  Temps estimé : 2-4 heures pour 7,775 pages"
echo ""
echo "📈 Surveillez la progression :"
echo "   ssh root@84.247.165.187 'tail -f /var/log/metadata-extraction.log'"
