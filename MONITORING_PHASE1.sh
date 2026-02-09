#!/bin/bash

###############################################################################
# MONITORING PHASE 1 - COMMANDES QUOTIDIENNES
#
# Usage: ./MONITORING_PHASE1.sh [date]
# Exemple: ./MONITORING_PHASE1.sh 2026-02-10
#
# Ce script collecte les métriques quotidiennes pour Phase 1 Quick Wins
###############################################################################

DATE=${1:-$(date +%Y-%m-%d)}
OUTPUT_FILE="metrics-phase1-${DATE}.log"

echo "=========================================="
echo "📊 MÉTRIQUES PHASE 1 - ${DATE}"
echo "=========================================="
echo ""

# 1. RAG Search Latency (P50/P95)
echo "1️⃣ RAG Search Latency (dernières 24h)"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h 2>&1 | grep "RAG Search.*Latency"' | \
  grep -oP 'Latency: \K[0-9]+' | \
  awk '{
    latencies[NR]=$1
    sum+=$1
  }
  END {
    if (NR == 0) {
      print "Aucune query RAG trouvée"
    } else {
      asort(latencies)
      count = NR
      print "Total queries: " count
      print "Moyenne: " sum/count " ms (" sum/count/1000 " s)"
      print "P50: " latencies[int(count*0.5)] " ms"
      print "P95: " latencies[int(count*0.95)] " ms"
      print "Min: " latencies[1] " ms"
      print "Max: " latencies[count] " ms"

      # Objectifs
      p50 = latencies[int(count*0.5)]
      p95 = latencies[int(count*0.95)]

      if (p50 < 2000) print "✅ P50 OBJECTIF ATTEINT (<2s)"
      else print "⚠️  P50 au-dessus objectif (>2s)"

      if (p95 < 5000) print "✅ P95 OBJECTIF ATTEINT (<5s)"
      else print "⚠️  P95 au-dessus objectif (>5s)"
    }
  }'
echo ""

# 2. Throughput Indexation
echo "2️⃣ Throughput Indexation (dernières 24h)"
echo "--------------------------------------"
DOCS_INDEXED=$(ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h 2>&1 | grep "Indexing completed"' | wc -l | tr -d ' ')
DOCS_PER_HOUR=$(echo "scale=2; $DOCS_INDEXED / 24" | bc)

echo "Documents indexés: ${DOCS_INDEXED}"
echo "Throughput: ${DOCS_PER_HOUR} docs/heure"

if (( $(echo "$DOCS_PER_HOUR > 30" | bc -l) )); then
  echo "✅ OBJECTIF ATTEINT (>30 docs/h)"
else
  echo "⚠️  En dessous objectif (<30 docs/h)"
fi
echo ""

# 3. Cache Hit Rate
echo "3️⃣ Cache Hit Rate (Redis)"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO stats 2>/dev/null' | \
  grep -E "keyspace_hits|keyspace_misses" | \
  awk -F: '
    /keyspace_hits/ {hits=$2}
    /keyspace_misses/ {misses=$2}
    END {
      total = hits + misses
      if (total > 0) {
        rate = (hits / total) * 100
        print "Hits: " hits
        print "Misses: " misses
        print "Total: " total
        print "Hit rate: " rate "%"

        if (rate > 20) print "✅ OBJECTIF ATTEINT (>20%)"
        else print "⚠️  En dessous objectif (<20%)"
      } else {
        print "Pas de données cache disponibles"
      }
    }
  '
echo ""

# 4. Entrées Cache Search
echo "4️⃣ Cache Search (Entrées)"
echo "--------------------------------------"
CACHE_ENTRIES=$(ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli KEYS "search:*" 2>/dev/null | wc -l' | tr -d ' ')
echo "Entrées cache search: ${CACHE_ENTRIES}"
echo ""

# 5. API Santé
echo "5️⃣ API Santé"
echo "--------------------------------------"
curl -s https://qadhya.tn/api/health | jq -r '
  "Status: \(.status)",
  "Response time: \(.responseTime)",
  "Database: \(.services.database)",
  "Storage: \(.services.storage)",
  "API: \(.services.api)"
' 2>/dev/null || echo "❌ Erreur accès API"
echo ""

# 6. Containers Status
echo "6️⃣ Containers Status"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker ps --filter name=moncabinet --format "table {{.Names}}\t{{.Status}}"'
echo ""

# 7. Ollama Status
echo "7️⃣ Ollama Status (dernière heure)"
echo "--------------------------------------"
ssh root@84.247.165.187 'systemctl status ollama --no-pager | grep -E "Active|Memory"' 2>/dev/null || echo "Ollama status non disponible"
echo ""

# 8. Variables Env (Validation)
echo "8️⃣ Variables Environnement Phase 1"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker exec moncabinet-nextjs printenv 2>/dev/null | grep -E "OLLAMA_EMBEDDING_CONCURRENCY|SEARCH_CACHE_THRESHOLD"'
echo ""

# 9. Erreurs récentes
echo "9️⃣ Erreurs Récentes (dernières 24h, top 10)"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h 2>&1 | grep -iE "error|exception|failed" | tail -10'
echo ""

# Résumé
echo "=========================================="
echo "✅ Collecte terminée - ${DATE}"
echo "=========================================="
echo ""
echo "💾 Sauvegarde: ${OUTPUT_FILE}"
echo ""
echo "📊 Prochaines étapes:"
echo "  1. Copier ces métriques dans fichier daily"
echo "  2. Comparer avec baseline (jour 1)"
echo "  3. Le 17 février, remplir: docs/PHASE1_WEEKLY_REPORT_TEMPLATE.md"
echo ""

# Sauvegarder dans fichier
{
  echo "=========================================="
  echo "📊 MÉTRIQUES PHASE 1 - ${DATE}"
  echo "=========================================="
  echo ""
  echo "Collecté le: $(date)"
  echo ""
  # ... (répéter les commandes ci-dessus sans les couleurs/emojis)
} > "$OUTPUT_FILE" 2>&1

echo "✨ Fichier sauvegardé: ${OUTPUT_FILE}"
