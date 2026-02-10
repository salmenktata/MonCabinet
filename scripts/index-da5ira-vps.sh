#!/bin/bash

# Script à copier et exécuter DIRECTEMENT sur le VPS
# Ce script déclenche l'indexation manuelle de da5ira.com

SOURCE_ID="a7fc89a8-8f4f-4aaa-ae5e-cc87c2547bbf"

echo "=== INDEXATION MANUELLE DA5IRA.COM ==="
echo ""

# 1. État initial via SQL direct
echo "1. État initial:"
docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c "
SELECT
  'Pages à indexer: ' || COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100),
  'Déjà indexées: ' || COUNT(*) FILTER (WHERE is_indexed = true)
FROM web_pages
WHERE web_source_id = '$SOURCE_ID'
"
echo ""

# 2. Créer directement un job d'indexation dans la DB
echo "2. Création du job d'indexation dans la base de données..."

JOB_ID=$(docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -A -c "
INSERT INTO indexing_jobs (
  id,
  job_type,
  target_id,
  status,
  priority,
  attempts,
  max_attempts,
  metadata,
  created_at
) VALUES (
  gen_random_uuid(),
  'web_source_indexing',
  '$SOURCE_ID',
  'pending',
  10,
  0,
  3,
  '{\"source_name\": \"da5ira\", \"triggered_by\": \"manual_vps_script\"}'::jsonb,
  NOW()
)
RETURNING id;
")

if [ -z "$JOB_ID" ]; then
  echo "   ❌ Erreur création job"
  exit 1
fi

echo "   ✅ Job créé: $JOB_ID"
echo "   Priorité: 10 (élevée)"
echo ""

# 3. Vérifier que le cron worker est actif
echo "3. Vérification worker d'indexation..."
WORKER_STATUS=$(docker ps --filter "name=qadhya-nextjs" --format "{{.Status}}" | head -1)

if [[ $WORKER_STATUS == *"healthy"* ]] || [[ $WORKER_STATUS == *"Up"* ]]; then
  echo "   ✅ Container Next.js actif: $WORKER_STATUS"
else
  echo "   ⚠️  Container status: $WORKER_STATUS"
fi
echo ""

# 4. Instructions monitoring
echo "4. Monitoring de la progression:"
echo ""
echo "   Le worker d'indexation traitera le job automatiquement."
echo "   Pour surveiller en temps réel, exécutez sur le VPS:"
echo ""
echo "   watch -n 10 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"SELECT COUNT(*) FILTER (WHERE is_indexed = true) as indexed, COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', '\"'\"'unchanged'\"'\"') AND word_count >= 100) as restant FROM web_pages WHERE web_source_id = '\"'\"'$SOURCE_ID'\"'\"'\"'"
echo ""
echo "   Ou consultez les logs du worker:"
echo ""
echo "   docker logs -f qadhya-nextjs --tail 100 | grep -i index"
echo ""
echo "   Durée estimée: 15-25 minutes avec Ollama (202 pages × 5-7s/page)"
