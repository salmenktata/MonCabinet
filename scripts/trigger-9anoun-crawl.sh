#!/bin/bash

# Script pour déclencher le crawl 9anoun.tn en production
# Usage : ./scripts/trigger-9anoun-crawl.sh

set -e

SOURCE_ID="4319d2d1-569c-4107-8f52-d71e2a2e9fe9"
VPS_HOST="root@84.247.165.187"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   🚀 DÉCLENCHEMENT CRAWL 9ANOUN.TN                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Déclencher le crawl via insertion d'un job dans crawl_queue
echo "📝 Insertion du job de crawl dans la queue..."
ssh $VPS_HOST "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"
INSERT INTO crawl_queue (web_source_id, status, priority, created_at)
VALUES ('$SOURCE_ID', 'pending', 1, NOW())
ON CONFLICT DO NOTHING
RETURNING id, web_source_id, status, priority;
\""

echo ""
echo "✅ Job de crawl ajouté à la queue !"
echo ""
echo "📊 MONITORING :"
echo "   Dashboard : https://qadhya.tn/super-admin/web-sources/$SOURCE_ID"
echo ""
echo "   Logs en temps réel :"
echo "   ssh $VPS_HOST 'docker logs -f qadhya-nextjs | grep -E \"Crawler|Progression\"'"
echo ""
echo "⏱️  DURÉE ATTENDUE : 20-30 minutes"
echo "📈 MÉTRIQUES ATTENDUES :"
echo "   - Phase 1 : 61 pages d'accueil en ~15 min"
echo "   - Phase 2 : 5K-15K documents en ~2-6 min"
echo "   - Throughput : 40+ pages/min"
echo ""
