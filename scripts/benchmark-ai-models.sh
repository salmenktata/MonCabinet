#!/bin/bash
# Benchmark comparatif des modèles IA
# Compare : Ollama, Gemini, Groq, DeepSeek

set -e

echo "🎯 Benchmark des modèles IA - Question juridique"
echo "=================================================="
echo ""

# Question juridique en français
QUESTION="Un employeur peut-il licencier un salarié pour faute grave sans préavis en Tunisie? Réponds en 2-3 phrases courtes."

echo "📝 Question posée :"
echo "   \"$QUESTION\""
echo ""

ssh root@84.247.165.187 << ENDSSH
set -e

# Source le fichier .env
source /opt/qadhya/.env.production.local

QUESTION="Un employeur peut-il licencier un salarié pour faute grave sans préavis en Tunisie? Réponds en 2-3 phrases courtes."

echo "============================================================"
echo "1️⃣  OLLAMA (qwen2.5:3b) - Local, Gratuit"
echo "============================================================"
START=\$(date +%s%N)
RESPONSE=\$(curl -s -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"qwen2.5:3b\",
    \"prompt\": \"\$QUESTION\",
    \"stream\": false,
    \"options\": {
      \"temperature\": 0.3,
      \"num_predict\": 200
    }
  }" 2>&1)
END=\$(date +%s%N)
LATENCY=\$(( (END - START) / 1000000 ))

if echo "\$RESPONSE" | grep -q "response"; then
  ANSWER=\$(echo "\$RESPONSE" | grep -o '"response":"[^"]*"' | sed 's/"response":"//;s/"$//' | head -c 500)
  echo "⏱️  Latence: \${LATENCY}ms"
  echo "💰 Coût: 0€ (local)"
  echo "📊 Réponse:"
  echo "\$ANSWER"
else
  echo "❌ ÉCHEC"
fi

echo ""
echo "============================================================"
echo "2️⃣  GEMINI (2.5-flash) - Gratuit"
echo "============================================================"
START=\$(date +%s%N)
RESPONSE=\$(curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{\"parts\": [{\"text\": \"\$QUESTION\"}]}],
    \"generationConfig\": {
      \"temperature\": 0.3,
      \"maxOutputTokens\": 200
    }
  }" 2>&1)
END=\$(date +%s%N)
LATENCY=\$(( (END - START) / 1000000 ))

if echo "\$RESPONSE" | grep -q "candidates"; then
  ANSWER=\$(echo "\$RESPONSE" | grep -o '"text":"[^"]*"' | sed 's/"text":"//;s/"$//' | head -c 500)
  echo "⏱️  Latence: \${LATENCY}ms"
  echo "💰 Coût: 0€ (gratuit)"
  echo "📊 Réponse:"
  echo "\$ANSWER"
else
  echo "❌ ÉCHEC"
fi

echo ""
echo "============================================================"
echo "3️⃣  GROQ (llama-3.3-70b) - Gratuit"
echo "============================================================"
START=\$(date +%s%N)
RESPONSE=\$(curl -s -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer \$GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"llama-3.3-70b-versatile\",
    \"messages\": [{\"role\": \"user\", \"content\": \"\$QUESTION\"}],
    \"temperature\": 0.3,
    \"max_tokens\": 200
  }" 2>&1)
END=\$(date +%s%N)
LATENCY=\$(( (END - START) / 1000000 ))

if echo "\$RESPONSE" | grep -q "choices"; then
  ANSWER=\$(echo "\$RESPONSE" | grep -o '"content":"[^"]*"' | sed 's/"content":"//;s/"$//' | head -c 500)
  echo "⏱️  Latence: \${LATENCY}ms"
  echo "💰 Coût: 0€ (gratuit)"
  echo "📊 Réponse:"
  echo "\$ANSWER"
else
  ERROR=\$(echo "\$RESPONSE" | head -c 200)
  echo "❌ ÉCHEC: \$ERROR"
fi

echo ""
echo "============================================================"
echo "4️⃣  DEEPSEEK (deepseek-chat) - Payant (très bon rapport qualité/prix)"
echo "============================================================"
START=\$(date +%s%N)
RESPONSE=\$(curl -s -X POST https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer \$DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"deepseek-chat\",
    \"messages\": [{\"role\": \"user\", \"content\": \"\$QUESTION\"}],
    \"temperature\": 0.3,
    \"max_tokens\": 200
  }" 2>&1)
END=\$(date +%s%N)
LATENCY=\$(( (END - START) / 1000000 ))

if echo "\$RESPONSE" | grep -q "choices"; then
  ANSWER=\$(echo "\$RESPONSE" | grep -o '"content":"[^"]*"' | sed 's/"content":"//;s/"$//' | head -c 500)
  echo "⏱️  Latence: \${LATENCY}ms"
  echo "💰 Coût: ~0.001€ par requête"
  echo "📊 Réponse:"
  echo "\$ANSWER"
else
  ERROR=\$(echo "\$RESPONSE" | head -c 200)
  echo "❌ ÉCHEC: \$ERROR"
fi

echo ""
echo "============================================================"
echo "📊 SYNTHÈSE DU BENCHMARK"
echo "============================================================"
echo ""
echo "Critères d'évaluation :"
echo "  🚀 Vitesse      : Temps de réponse (ms)"
echo "  💰 Coût         : Prix par requête"
echo "  📝 Qualité      : Pertinence et précision"
echo "  🌍 Langue       : Support du français"
echo ""
echo "Recommandations selon l'usage :"
echo ""
echo "  Mode RAPIDE (0€) :"
echo "    1️⃣  Ollama    : Bon pour usage intensif, 100% gratuit"
echo "    2️⃣  Groq      : Très rapide, excellent rapport qualité/vitesse"
echo "    3️⃣  Gemini    : Bon équilibre, gratuit"
echo ""
echo "  Mode PREMIUM (payant) :"
echo "    1️⃣  DeepSeek  : Meilleur rapport qualité/prix (0.001€)"
echo "    2️⃣  Gemini    : Alternative gratuite de bonne qualité"
echo ""
echo "💡 Configuration actuelle de l'app :"
echo "    • Mode Rapide : Ollama (par défaut)"
echo "    • Mode Premium : Gemini → Groq → DeepSeek (cascade)"
echo ""

ENDSSH

echo ""
echo "✅ Benchmark terminé !"
echo ""
echo "📌 Note : OpenAI n'est pas inclus car configuré uniquement pour embeddings"
