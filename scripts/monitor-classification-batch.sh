#!/bin/bash
# Script de monitoring Classification Batch en temps réel
# Usage: bash scripts/monitor-classification-batch.sh

set -e

VPS_HOST="${VPS_HOST:-84.247.165.187}"
VPS_USER="${VPS_USER:-root}"
VPS_PASSWORD="${VPS_PASSWORD:-IeRfA8Z46gsYSNh7}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          MONITORING CLASSIFICATION BATCH                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 1. État initial
echo "▓▓▓ ÉTAT INITIAL ▓▓▓"
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'EOSSH'
echo "Pages disponibles pour classification:"
docker exec 275ce01791bf_qadhya-postgres psql -U moncabinet -d qadhya -t -c "
  SELECT COUNT(*)
  FROM web_pages wp
  LEFT JOIN legal_classifications lc ON wp.id = lc.web_page_id
  WHERE wp.status IN ('crawled', 'indexed')
    AND wp.extracted_text IS NOT NULL
    AND LENGTH(wp.extracted_text) >= 100
    AND lc.id IS NULL;
"

echo ""
echo "Jobs classify_pages existants:"
docker exec 275ce01791bf_qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT id, status, started_at,
         (metadata->>'limit')::int as limit,
         (metadata->'progress'->>'processed')::int as processed
  FROM indexing_jobs
  WHERE job_type = 'classify_pages'
  ORDER BY started_at DESC
  LIMIT 5;
"
EOSSH

echo ""
echo "▓▓▓ INSTRUCTIONS ▓▓▓"
echo "1. Ouvrez https://qadhya.tn/super-admin/classification dans votre navigateur"
echo "2. Allez sur l'onglet 'Batch'"
echo "3. Définissez limit = 5 pages"
echo "4. Cliquez sur 'Lancer la classification'"
echo ""
echo "Appuyez sur ENTRÉE quand vous avez cliqué sur le bouton..."
read -r

echo ""
echo "▓▓▓ MONITORING EN TEMPS RÉEL ▓▓▓"
echo "Surveillance des logs (CTRL+C pour arrêter)..."
echo ""

# 2. Monitoring logs en temps réel
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "docker logs -f --tail 50 qadhya-nextjs 2>&1 | grep --line-buffered -i 'ClassifyAPI\|classify-pages\|error\|success'"

EOSSH
