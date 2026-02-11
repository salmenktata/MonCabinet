#!/bin/bash
# Script de test des clés IA en production
# Teste chaque provider configuré

set -e

echo "🔍 Test des clés IA sur PROD..."
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Récupérer les clés depuis la base de données
echo "📊 Récupération des clés actives..."
ssh root@84.247.165.187 << 'ENDSSH'
set -e

# Fonction de test Ollama
test_ollama() {
  echo ""
  echo "============================================================"
  echo "🔑 Provider: OLLAMA"
  echo "📝 Label: Ollama Local - Embeddings & Chat"
  echo "🎯 Modèle: qwen2.5:3b"
  echo "💰 Tier: free"
  echo "============================================================"

  START=$(date +%s%3N)
  RESPONSE=$(docker exec qadhya-nextjs curl -s -X POST http://host.docker.internal:11434/api/generate \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen2.5:3b",
      "prompt": "Bonjour, réponds en un mot.",
      "stream": false
    }' 2>&1 || echo "ERROR")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  if echo "$RESPONSE" | grep -q "response"; then
    ANSWER=$(echo "$RESPONSE" | grep -o '"response":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "✅ SUCCÈS (${LATENCY}ms)"
    echo "📊 Résultat: ✅ Réponse: ${ANSWER:0:50}..."

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET last_used_at = NOW(), error_count = 0, last_error = NULL WHERE provider = 'ollama';" > /dev/null
  else
    echo ""
    echo "❌ ÉCHEC"
    echo "📊 Résultat: ❌ Erreur: $RESPONSE"

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET error_count = error_count + 1, last_error = 'Connection failed' WHERE provider = 'ollama';" > /dev/null
  fi
}

# Fonction de test Groq
test_groq() {
  API_KEY=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \
    "SELECT encode(decode(api_key_encrypted, 'base64'), 'escape') FROM api_keys WHERE provider = 'groq';" | xargs)

  echo ""
  echo "============================================================"
  echo "🔑 Provider: GROQ"
  echo "📝 Label: Groq API Key - Llama 3.3 70B"
  echo "🎯 Modèle: llama-3.3-70b-versatile"
  echo "💰 Tier: free"
  echo "============================================================"

  START=$(date +%s%3N)
  RESPONSE=$(curl -s -X POST https://api.groq.com/openai/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "llama-3.3-70b-versatile",
      "messages": [{"role": "user", "content": "Bonjour, réponds en un mot."}],
      "max_tokens": 10
    }' 2>&1 || echo "ERROR")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  if echo "$RESPONSE" | grep -q "choices"; then
    ANSWER=$(echo "$RESPONSE" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "✅ SUCCÈS (${LATENCY}ms)"
    echo "📊 Résultat: ✅ Réponse: $ANSWER"

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET last_used_at = NOW(), error_count = 0, last_error = NULL WHERE provider = 'groq';" > /dev/null
  else
    echo ""
    echo "❌ ÉCHEC"
    echo "📊 Résultat: ❌ Erreur: ${RESPONSE:0:200}"

    ERROR_MSG=$(echo "$RESPONSE" | tr '"' "'" | head -c 200)
    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET error_count = error_count + 1, last_error = '$ERROR_MSG' WHERE provider = 'groq';" > /dev/null
  fi
}

# Fonction de test DeepSeek
test_deepseek() {
  API_KEY=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \
    "SELECT encode(decode(api_key_encrypted, 'base64'), 'escape') FROM api_keys WHERE provider = 'deepseek';" | xargs)

  echo ""
  echo "============================================================"
  echo "🔑 Provider: DEEPSEEK"
  echo "📝 Label: DeepSeek API Key"
  echo "🎯 Modèle: deepseek-chat"
  echo "💰 Tier: paid"
  echo "============================================================"

  START=$(date +%s%3N)
  RESPONSE=$(curl -s -X POST https://api.deepseek.com/v1/chat/completions \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "deepseek-chat",
      "messages": [{"role": "user", "content": "Bonjour, réponds en un mot."}],
      "max_tokens": 10
    }' 2>&1 || echo "ERROR")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  if echo "$RESPONSE" | grep -q "choices"; then
    ANSWER=$(echo "$RESPONSE" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "✅ SUCCÈS (${LATENCY}ms)"
    echo "📊 Résultat: ✅ Réponse: $ANSWER"

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET last_used_at = NOW(), error_count = 0, last_error = NULL WHERE provider = 'deepseek';" > /dev/null
  else
    echo ""
    echo "❌ ÉCHEC"
    echo "📊 Résultat: ❌ Erreur: ${RESPONSE:0:200}"

    ERROR_MSG=$(echo "$RESPONSE" | tr '"' "'" | head -c 200)
    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET error_count = error_count + 1, last_error = '$ERROR_MSG' WHERE provider = 'deepseek';" > /dev/null
  fi
}

# Fonction de test Gemini
test_gemini() {
  API_KEY=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \
    "SELECT encode(decode(api_key_encrypted, 'base64'), 'escape') FROM api_keys WHERE provider = 'gemini';" | xargs)

  echo ""
  echo "============================================================"
  echo "🔑 Provider: GEMINI"
  echo "📝 Label: Gemini API Key - Projet Qadhya"
  echo "🎯 Modèle: gemini-2.0-flash-exp"
  echo "💰 Tier: free"
  echo "============================================================"

  START=$(date +%s%3N)
  RESPONSE=$(curl -s -X POST \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=$API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "contents": [{"parts": [{"text": "Bonjour, réponds en un mot."}]}]
    }' 2>&1 || echo "ERROR")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  if echo "$RESPONSE" | grep -q "candidates"; then
    ANSWER=$(echo "$RESPONSE" | grep -o '"text":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "✅ SUCCÈS (${LATENCY}ms)"
    echo "📊 Résultat: ✅ Réponse: $ANSWER"

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET last_used_at = NOW(), error_count = 0, last_error = NULL WHERE provider = 'gemini';" > /dev/null
  else
    echo ""
    echo "❌ ÉCHEC"
    echo "📊 Résultat: ❌ Erreur: ${RESPONSE:0:200}"

    ERROR_MSG=$(echo "$RESPONSE" | tr '"' "'" | head -c 200)
    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET error_count = error_count + 1, last_error = '$ERROR_MSG' WHERE provider = 'gemini';" > /dev/null
  fi
}

# Fonction de test OpenAI
test_openai() {
  API_KEY=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \
    "SELECT encode(decode(api_key_encrypted, 'base64'), 'escape') FROM api_keys WHERE provider = 'openai';" | xargs)

  echo ""
  echo "============================================================"
  echo "🔑 Provider: OPENAI"
  echo "📝 Label: OpenAI API - Embeddings Fallback"
  echo "🎯 Modèle: text-embedding-3-small"
  echo "💰 Tier: paid"
  echo "============================================================"

  START=$(date +%s%3N)
  RESPONSE=$(curl -s -X POST https://api.openai.com/v1/embeddings \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "text-embedding-3-small",
      "input": "Test embedding"
    }' 2>&1 || echo "ERROR")
  END=$(date +%s%3N)
  LATENCY=$((END - START))

  if echo "$RESPONSE" | grep -q "embedding"; then
    DIM=$(echo "$RESPONSE" | grep -o '"embedding":\[[^]]*\]' | head -1 | grep -o '[-0-9.]' | wc -l)
    echo ""
    echo "✅ SUCCÈS (${LATENCY}ms)"
    echo "📊 Résultat: ✅ Embedding généré ($DIM dimensions)"

    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET last_used_at = NOW(), error_count = 0, last_error = NULL WHERE provider = 'openai';" > /dev/null
  else
    echo ""
    echo "❌ ÉCHEC"
    echo "📊 Résultat: ❌ Erreur: ${RESPONSE:0:200}"

    ERROR_MSG=$(echo "$RESPONSE" | tr '"' "'" | head -c 200)
    docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \
      "UPDATE api_keys SET error_count = error_count + 1, last_error = '$ERROR_MSG' WHERE provider = 'openai';" > /dev/null
  fi
}

# Exécuter les tests
test_ollama
test_groq
test_deepseek
test_gemini
test_openai

# Afficher le résumé
echo ""
echo "============================================================"
echo "📊 RÉSUMÉ FINAL"
echo "============================================================"

docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  provider,
  CASE WHEN last_used_at IS NOT NULL THEN '✅ SUCCÈS' ELSE '❌ ÉCHEC' END as statut,
  CASE
    WHEN last_used_at IS NOT NULL THEN to_char(last_used_at, 'YYYY-MM-DD HH24:MI:SS')
    ELSE 'Jamais utilisée'
  END as derniere_utilisation,
  error_count as erreurs
FROM api_keys
WHERE is_active = true
ORDER BY provider;
"

echo "============================================================"
ENDSSH
