#!/bin/bash
# Test simple de l'API chat depuis le serveur (pas besoin d'auth pour les logs)

ssh root@84.247.165.187 'bash -s' << 'EOF'
  echo "🔍 Test API Chat - الدفاع الشرعي"
  echo "================================"
  echo ""

  # Suivre les logs en arrière-plan
  docker logs -f --since 1s qadhya-nextjs 2>&1 > /tmp/chat-logs.txt &
  LOGS_PID=$!

  sleep 2

  # Envoyer une requête test via internal API (localhost)
  # Note: Cela va échouer côté auth mais générera les logs de recherche qu'on veut voir
  echo "📡 Envoi requête..."
  curl -s -X POST http://localhost:7002/api/chat \
    -H "Content-Type: application/json" \
    -d '{"question": "الدفاع الشرعي"}' \
    > /dev/null

  sleep 3

  # Arrêter logs
  kill $LOGS_PID 2>/dev/null || true

  echo ""
  echo "📊 Logs pertinents:"
  grep -E "(RAG|KB Hybrid|Search|Provider|embedding|sources|Aucune source)" /tmp/chat-logs.txt | tail -20

  rm -f /tmp/chat-logs.txt

  echo ""
  echo "✅ Test terminé"
EOF
