#!/bin/bash
# Test API chat en production avec la question de légitime défense

# Get user ID from database (utiliser un utilisateur existant)
USER_ID=$(ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"SELECT id FROM users WHERE email LIKE '%admin%' LIMIT 1;\"")

if [ -z "$USER_ID" ]; then
  echo "❌ Impossible de trouver un utilisateur"
  exit 1
fi

echo "🔍 Test API Chat - Légitime défense"
echo "User ID: $USER_ID"
echo ""

# Question simple pour test
QUESTION="الدفاع الشرعي"

# Appeler l'API chat via curl depuis le serveur
echo "📡 Envoi requête à /api/chat..."
ssh root@84.247.165.187 "docker exec qadhya-nextjs curl -s -X POST http://localhost:7002/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    \"question\": \"$QUESTION\",
    \"usePremiumModel\": false,
    \"includeJurisprudence\": true
  }' \
  -b 'userId=$USER_ID'" | jq -r '.answer' | head -20

echo ""
echo "📊 Vérifier les logs du container (dernières 50 lignes)"
ssh root@84.247.165.187 "docker logs --since 1m qadhya-nextjs 2>&1 | grep -E '(KB Hybrid|RAG|Provider|embedding|Search)' | tail -50"
