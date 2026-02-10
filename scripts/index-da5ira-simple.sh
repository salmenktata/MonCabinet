#!/bin/bash

# Script d'indexation manuelle da5ira.com en production
# Approche simple via SSH + docker exec

SOURCE_ID="a7fc89a8-8f4f-4aaa-ae5e-cc87c2547bbf"
VPS="root@84.247.165.187"

echo "=== INDEXATION MANUELLE DA5IRA.COM ==="
echo ""

# 1. État initial
echo "1. État initial:"
ssh $VPS "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"
SELECT
  COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as a_indexer,
  COUNT(*) FILTER (WHERE is_indexed = true) as deja_indexes
FROM web_pages
WHERE web_source_id = '$SOURCE_ID'
\"" | while read -r line; do
  echo "   $line"
done
echo ""

# 2. Déclencher indexation
echo "2. Déclenchement de l'indexation..."
echo "   Endpoint: POST /api/admin/web-sources/$SOURCE_ID/index"
echo ""

response=$(ssh $VPS "curl -s -X POST http://localhost:3000/api/admin/web-sources/$SOURCE_ID/index -H 'Content-Type: application/json' -w '\nHTTP_STATUS:%{http_code}'")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d':' -f2)
body=$(echo "$response" | grep -v "HTTP_STATUS")

if [ "$http_status" = "200" ] || [ "$http_status" = "202" ]; then
  echo "   ✅ Indexation déclenchée avec succès (HTTP $http_status)"
  echo "   Réponse: $body"
else
  echo "   ❌ Erreur HTTP $http_status"
  echo "   Réponse: $body"
  exit 1
fi
echo ""

# 3. Monitoring progression
echo "3. Monitoring de la progression (Ctrl+C pour arrêter):"
echo "   L'indexation continue en background même si vous arrêtez ce monitoring"
echo ""

# État initial
prev_indexed=$(ssh $VPS "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"SELECT COUNT(*) FROM web_pages WHERE web_source_id = '$SOURCE_ID' AND is_indexed = true\"")

iteration=0
max_iterations=40  # 40 * 30s = 20 minutes

while [ $iteration -lt $max_iterations ]; do
  sleep 30
  iteration=$((iteration + 1))

  # Requête état actuel
  result=$(ssh $VPS "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
SELECT
  COUNT(*) FILTER (WHERE is_indexed = true)::text || '|' ||
  COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100)::text
FROM web_pages
WHERE web_source_id = '$SOURCE_ID'
\"")

  indexed=$(echo $result | cut -d'|' -f1 | tr -d ' ')
  restant=$(echo $result | cut -d'|' -f2 | tr -d ' ')
  new=$((indexed - prev_indexed))
  total=$((indexed + restant))

  if [ $total -gt 0 ]; then
    progress=$(awk "BEGIN {printf \"%.1f\", ($indexed / $total) * 100}")
  else
    progress="0.0"
  fi

  timestamp=$(date +"%H:%M:%S")
  echo "   [$timestamp] Indexées: $indexed (+$new) | Restant: $restant | Progrès: $progress%"

  # Terminé ?
  if [ "$restant" = "0" ]; then
    echo ""
    echo "✅ INDEXATION TERMINÉE !"
    echo "   Total indexé: $indexed pages"
    exit 0
  fi

  prev_indexed=$indexed
done

# Timeout
echo ""
echo "⏱️  Timeout monitoring (20 minutes)"
echo "   État: $indexed indexées, $restant restantes"
echo "   L'indexation continue en background, vérifiez plus tard."
