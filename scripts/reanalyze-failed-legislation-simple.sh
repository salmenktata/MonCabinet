#!/bin/bash
# Réanalyser documents legislation courts en batch

CRON_SECRET=$(ssh root@84.247.165.187 "grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2")

echo "🔄 Réanalyse batch legislation courts (<500 chars) avec OpenAI"
echo ""

# Compter combien de docs legislation courts avec score=50
COUNT=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"
SELECT COUNT(*) 
FROM knowledge_base 
WHERE is_active = true 
  AND category = 'legislation'
  AND quality_score = 50
  AND LENGTH(full_text) < 500;
\"")

echo "Documents à réanalyser : $COUNT"
echo "Estimation : $COUNT × 5s = ~$((COUNT * 5 / 60)) minutes"
echo ""
read -p "Continuer? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

# Lancer batch analyse
ssh root@84.247.165.187 "curl -s -X POST 'https://qadhya.tn/api/admin/kb/analyze-quality' \
  -H 'Content-Type: application/json' \
  -H 'X-Cron-Secret: $CRON_SECRET' \
  -d '{
    \"batchSize\": $COUNT,
    \"category\": \"legislation\",
    \"skipAnalyzed\": false
  }'" | jq -r '
if .success then
  "✅ Analyse terminée:",
  "  Réussis: \(.succeeded)",
  "  Échecs: \(.failed)",
  "  Total: \(.analyzed)"
else
  "❌ Erreur: \(.message)"
end
'
