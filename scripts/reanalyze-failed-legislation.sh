#!/bin/bash
# Réanalyser les 266 documents legislation qui ont échoué avec Gemini

CRON_SECRET=$(ssh root@84.247.165.187 "grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2")

echo "🔄 Réanalyse des documents legislation échoués (score=50) avec OpenAI"
echo "Estimation : 266 documents × 5s = ~22 minutes"
echo ""

# Appeler l'API batch avec filtre legislation + score=50
RESPONSE=$(ssh root@84.247.165.187 "curl -s -X POST 'https://qadhya.tn/api/admin/kb/analyze-quality' \
  -H 'Content-Type: application/json' \
  -H 'X-Cron-Secret: $CRON_SECRET' \
  -d '{
    \"batch\": true,
    \"limit\": 266,
    \"filterCategory\": \"legislation\",
    \"filterQualityScore\": 50,
    \"force\": true
  }'")

echo "$RESPONSE" | jq -r '
  "Résultats:",
  "  ✅ Réussis: \(.succeeded)",
  "  ❌ Échecs: \(.failed)",
  "  📊 Total: \(.analyzed)",
  "  ⏱️  Temps moyen: \((.results | map(.processingTimeMs) | add / length) / 1000)s/doc"
'
