#!/bin/bash
# Script de test rapide : Vérifie que la recherche KB fonctionne en production
# Usage: ./scripts/test-kb-search-prod.sh

echo "🔍 Test Recherche Knowledge Base Production"
echo "================================================"

# 1. Vérifier OLLAMA_ENABLED
echo ""
echo "1️⃣  Vérifier OLLAMA_ENABLED..."
OLLAMA_STATUS=$(ssh root@84.247.165.187 "docker exec qadhya-nextjs env | grep OLLAMA_ENABLED")
echo "   $OLLAMA_STATUS"

if [[ "$OLLAMA_STATUS" != *"true"* ]]; then
    echo "   ❌ ERREUR: OLLAMA_ENABLED=false"
    echo "   Fix: ssh root@84.247.165.187 'sed -i \"s/OLLAMA_ENABLED=false/OLLAMA_ENABLED=true/\" /opt/moncabinet/.env && docker-compose -f /opt/moncabinet/docker-compose.prod.yml up -d --no-deps nextjs'"
    exit 1
fi
echo "   ✅ Ollama activé"

# 2. Vérifier état KB
echo ""
echo "2️⃣  Vérifier état Knowledge Base..."
KB_COUNT=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c 'SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = true'")
CHUNKS_COUNT=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c 'SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding IS NOT NULL'")
echo "   Documents indexés: $(echo $KB_COUNT | xargs)"
echo "   Chunks avec embedding: $(echo $CHUNKS_COUNT | xargs)"

if [[ $(echo $CHUNKS_COUNT | xargs) -eq 0 ]]; then
    echo "   ❌ ERREUR: Aucun chunk indexé"
    exit 1
fi
echo "   ✅ KB prête"

# 3. Vérifier service Ollama
echo ""
echo "3️⃣  Vérifier service Ollama..."
OLLAMA_MODELS=$(ssh root@84.247.165.187 "curl -s http://localhost:11434/api/tags | jq -r '.models[].name' | grep embedding")
echo "   Modèles embeddings: $OLLAMA_MODELS"

if [[ -z "$OLLAMA_MODELS" ]]; then
    echo "   ❌ ERREUR: Modèle embedding manquant"
    exit 1
fi
echo "   ✅ Ollama embeddings disponible"

echo ""
echo "================================================"
echo "✅ Tous les tests passent ! KB prête à fonctionner"
echo ""
echo "📝 Test manuel recommandé:"
echo "   1. Aller sur https://qadhya.tn/assistant-ia"
echo "   2. Tester avec un prompt juridique complexe en arabe"
echo "   3. Vérifier que la réponse contient des sources [KB-N]"
