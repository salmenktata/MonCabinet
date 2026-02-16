#!/bin/bash
# Validation Fix RAG Après Déploiement Tier 2

SERVER="root@84.247.165.187"
QUERY="الدفاع الشرعي"

echo "✅ VALIDATION FIX RAG PRODUCTION"
echo "================================"
echo ""

# 1. Vérifier que le déploiement est terminé
echo "📋 1. Vérification déploiement..."
CONTAINER_STATUS=$(ssh $SERVER "docker ps --filter name=qadhya-nextjs --format '{{.Status}}'")
echo "  ✓ Container status: $CONTAINER_STATUS"

# 2. Vérifier les variables d'environnement
echo ""
echo "📋 2. Vérification configuration..."
NODE_ENV=$(ssh $SERVER "docker exec qadhya-nextjs env | grep NODE_ENV | cut -d'=' -f2")
echo "  ✓ NODE_ENV: $NODE_ENV"

# 3. Purger cache Redis embeddings (forcer régénération)
echo ""
echo "📋 3. Purge cache Redis embeddings..."
KEYS_BEFORE=$(ssh $SERVER "docker exec qadhya-redis redis-cli KEYS 'embedding:*' | wc -l")
echo "  - Clés avant: $KEYS_BEFORE"

if [ "$KEYS_BEFORE" -gt "0" ]; then
  ssh $SERVER "docker exec qadhya-redis redis-cli --scan --pattern 'embedding:*' | xargs -L 100 docker exec -i qadhya-redis redis-cli DEL" > /dev/null
  echo "  ✓ Cache purgé"
else
  echo "  ✓ Pas de clés à purger"
fi

# 4. Test manuel avec logs
echo ""
echo "📋 4. Test manuel requis (5 minutes)"
echo "===================================="
echo ""
echo "🔴 OUVRIR 2 TERMINAUX:"
echo ""
echo "Terminal 1 - Logs temps réel:"
echo "  ssh $SERVER 'docker logs -f qadhya-nextjs 2>&1 | grep -E \"Provider|use_openai|KB Hybrid|totalFound\"'"
echo ""
echo "Terminal 2 - Navigateur:"
echo "  1. Ouvrir: https://qadhya.tn/assistant-ia"
echo "  2. Tester: $QUERY"
echo "  3. Observer Terminal 1"
echo ""
echo "✅ ATTENDU DANS LES LOGS:"
echo "  - [KB Hybrid Search] Provider: openai"
echo "  - true  -- use_openai = true (OpenAI en prod)"
echo "  - [RAG Search] {\"totalFound\":5,...} (au moins 1 résultat)"
echo ""
echo "❌ SI TOUJOURS FAUX (Ollama):"
echo "  - Vérifier que le build Docker Tier 2 a bien réussi"
echo "  - Vérifier logs déploiement: gh run view 22075168113 --log-failed"
echo "  - Redémarrer container: ssh $SERVER 'docker compose restart nextjs'"
echo ""
echo "📊 Health Check API:"
echo "  curl -s https://qadhya.tn/api/health | jq '.rag'"
echo ""
echo "✅ Si tout est OK, l'Assistant IA devrait maintenant retourner des sources pertinentes !"
