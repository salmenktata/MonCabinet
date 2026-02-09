# Guide Monitoring Phase 1 - Quick Wins Performance

**Objectif** : Collecter métriques pendant 7 jours (10-17 Feb 2026) pour valider gains Phase 1

---

## 🎯 Métriques Clés à Surveiller

### 1️⃣ Latency RAG Search (P50/P95)

**Objectif** : P50 <2s, P95 <5s (actuellement ~4-6s et ~10-15s)

**Commandes** :

```bash
# 1. Extraire latencies depuis logs (dernières 24h)
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h | grep "RAG Search.*Latency"' > rag_latencies.log

# 2. Parser latencies en millisecondes
cat rag_latencies.log | grep -oP 'Latency: \K[0-9]+' > latencies.txt

# 3. Calculer statistiques
cat latencies.txt | awk '
BEGIN {
  count = 0
  sum = 0
}
{
  latencies[count] = $1
  sum += $1
  count++
}
END {
  # Moyenne
  avg = sum / count
  print "Moyenne: " avg "ms (" avg/1000 "s)"

  # Trier pour percentiles
  asort(latencies)

  # P50 (médiane)
  p50_idx = int(count * 0.5)
  print "P50: " latencies[p50_idx] "ms (" latencies[p50_idx]/1000 "s)"

  # P95
  p95_idx = int(count * 0.95)
  print "P95: " latencies[p95_idx] "ms (" latencies[p95_idx]/1000 "s)"

  # Min/Max
  print "Min: " latencies[1] "ms"
  print "Max: " latencies[count] "ms"

  # Total queries
  print "Total queries: " count
}'
```

**Fréquence** : 1×/jour

**Alerte** : Si P95 >8s pendant 3 jours consécutifs → investigation

---

### 2️⃣ Throughput Indexation

**Objectif** : >30 docs/heure (actuellement ~12)

**Commandes** :

```bash
# 1. Tunnel SSH vers DB prod
ssh -f -N -L 5434:localhost:5432 root@84.247.165.187

# 2. Compter documents indexés dans période
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  DATE(updated_at) AS jour,
  COUNT(*) AS docs_indexes,
  COUNT(*) / 24.0 AS docs_par_heure
FROM knowledge_base
WHERE is_indexed = true
  AND updated_at >= '2026-02-10'
  AND updated_at <= '2026-02-17'
GROUP BY DATE(updated_at)
ORDER BY jour;
EOF

# 3. Durée moyenne indexation (depuis logs)
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 168h | grep "Indexing completed"' | \
  awk '{
    # Extraire temps (format: "XXXXms")
    match($0, /([0-9]+)ms/, arr)
    if (arr[1] != "") {
      sum += arr[1]
      count++
    }
  }
  END {
    if (count > 0) {
      print "Durée moyenne indexation: " sum/count "ms (" sum/count/1000 "s)"
      print "Total docs indexés: " count
      print "Throughput estimé: " count/168 " docs/heure (sur 7 jours)"
    }
  }'

# 4. Jobs d'indexation (succès vs échecs)
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 168h' | \
  grep -E "Indexing (completed|failed)" | \
  awk '{
    if ($0 ~ /completed/) success++
    if ($0 ~ /failed/) failed++
  }
  END {
    total = success + failed
    print "Jobs complétés: " success
    print "Jobs échoués: " failed
    print "Taux succès: " (success/total*100) "%"
  }'
```

**Fréquence** : 1×/jour

**Alerte** : Si throughput <15 docs/heure pendant 3 jours → investigation

---

### 3️⃣ Cache Hit Rate

**Objectif** : >20% (actuellement ~5%)

**Commandes** :

```bash
# 1. Redis stats globales
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO stats' | grep -E "keyspace_hits|keyspace_misses"

# Exemple output:
# keyspace_hits:12543
# keyspace_misses:2341

# Calculer hit rate:
# Hit rate = keyspace_hits / (keyspace_hits + keyspace_misses) * 100
# = 12543 / (12543 + 2341) * 100 = 84.3%

# 2. Comptage entrées search cache
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli KEYS "search:*"' | wc -l

# 3. Distribution TTL cache
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli --scan --pattern "search:*"' | \
  while read key; do
    ttl=$(ssh root@84.247.165.187 "docker exec moncabinet-redis redis-cli TTL '$key'")
    echo "$ttl"
  done | \
  awk '{
    sum += $1
    count++
  }
  END {
    print "TTL moyen: " sum/count "s (" sum/count/60 " min)"
    print "Entrées totales: " count
  }'

# 4. Top queries cachées (si logs disponibles)
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 168h | grep "SearchCache.*HIT"' | \
  head -20
```

**Fréquence** : 1×/jour

**Alerte** : Si hit rate <10% pendant 3 jours → ajuster threshold à 0.70

---

### 4️⃣ Index DB Usage

**Objectif** : >100 scans/jour par index

**Commandes** :

```bash
# 1. Stats index usage
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS total_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_kb_structured_metadata_knowledge_base_id',
  'idx_kb_legal_relations_source_target',
  'idx_knowledge_base_category_language'
)
ORDER BY idx_scan DESC;
EOF

# 2. Évolution scans (comparaison jour J vs J-1)
# Note: Exécuter cette requête 2 jours consécutifs et comparer

# 3. Ratio cache PostgreSQL
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  sum(blks_hit)::FLOAT / nullif(sum(blks_hit) + sum(blks_read), 0) AS cache_hit_ratio,
  sum(blks_hit) AS cache_hits,
  sum(blks_read) AS disk_reads
FROM pg_stat_database
WHERE datname = 'moncabinet';
EOF
# Objectif: cache_hit_ratio > 0.95 (95%)

# 4. Queries lentes (si activé)
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  query,
  calls,
  total_exec_time / 1000 AS total_time_sec,
  mean_exec_time / 1000 AS avg_time_sec,
  max_exec_time / 1000 AS max_time_sec
FROM pg_stat_statements
WHERE query LIKE '%kb_%'
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF
```

**Fréquence** : 1×/jour

**Alerte** : Si idx_scan <50/jour après 3 jours → index non utilisé

---

## 🔍 Monitoring Santé Système

### Ollama (CPU/RAM)

```bash
# 1. Stats CPU/RAM temps réel
ssh root@84.247.165.187 'journalctl -u ollama -f'

# 2. Historique CPU (dernières 24h)
ssh root@84.247.165.187 'journalctl -u ollama --since "24 hours ago" | grep -i cpu'

# 3. Crashes Ollama
ssh root@84.247.165.187 'journalctl -u ollama --since "7 days ago" | grep -iE "crash|panic|fatal"'

# 4. Uptime Ollama
ssh root@84.247.165.187 'systemctl status ollama | grep Active'

# 5. Modèles chargés
ssh root@84.247.165.187 'curl -s http://localhost:11434/api/ps'
```

**Alerte** : Si CPU >400% constant >1h → réduire concurrency

---

### PostgreSQL

```bash
# 1. Connexions actives
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  count(*) AS active_connections,
  max_conn,
  max_conn - count(*) AS available_connections
FROM pg_stat_activity, (SELECT setting::int AS max_conn FROM pg_settings WHERE name='max_connections') AS s
GROUP BY max_conn;
EOF

# 2. Dernière VACUUM/ANALYZE
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  schemaname,
  relname,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname LIKE 'kb_%' OR relname = 'knowledge_base'
ORDER BY last_analyze DESC;
EOF

# 3. Taille DB et tables
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public' AND (tablename LIKE 'kb_%' OR tablename = 'knowledge_base')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
EOF

# 4. Fragmentation (dead tuples)
psql -h localhost -p 5434 -U moncabinet -d moncabinet << 'EOF'
SELECT
  schemaname,
  tablename,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup::FLOAT / nullif(n_live_tup, 0) * 100, 2) AS dead_ratio_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY dead_ratio_percent DESC NULLS LAST
LIMIT 10;
EOF
# Si dead_ratio > 20% → VACUUM recommandé
```

**Alerte** : Si cache_hit_ratio <0.90 → augmenter shared_buffers

---

### Redis

```bash
# 1. Memory usage
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO memory' | grep -E "used_memory_human|used_memory_peak_human|maxmemory"

# 2. Connected clients
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO clients' | grep connected_clients

# 3. Evicted keys (mémoire saturée)
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO stats' | grep evicted_keys

# 4. Uptime
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO server' | grep uptime_in_days
```

**Alerte** : Si evicted_keys >0 → augmenter maxmemory Redis

---

### Container NextJS

```bash
# 1. Santé container
ssh root@84.247.165.187 'docker ps --filter name=moncabinet-nextjs --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# 2. Logs erreurs (dernières 24h)
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h | grep -iE "error|exception|failed"' | head -50

# 3. Memory usage container
ssh root@84.247.165.187 'docker stats moncabinet-nextjs --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"'

# 4. Restart count
ssh root@84.247.165.187 'docker inspect moncabinet-nextjs | jq ".[0].RestartCount"'
```

**Alerte** : Si RestartCount >3 en 24h → investigation urgente

---

## 📊 Dashboard Quotidien

### Script automatisé (copier-coller)

```bash
#!/bin/bash
# daily-metrics.sh - Collecte métriques quotidiennes Phase 1

echo "=========================================="
echo "📊 MÉTRIQUES QUOTIDIENNES - $(date +%Y-%m-%d)"
echo "=========================================="

# 1. RAG Latency
echo ""
echo "1️⃣ RAG Search Latency (dernières 24h)"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h | grep "RAG Search.*Latency"' | \
  grep -oP 'Latency: \K[0-9]+' | \
  awk '{
    latencies[NR] = $1
    sum += $1
  }
  END {
    asort(latencies)
    count = NR
    print "Total queries: " count
    print "Moyenne: " sum/count "ms (" sum/count/1000 "s)"
    print "P50: " latencies[int(count*0.5)] "ms"
    print "P95: " latencies[int(count*0.95)] "ms"
  }'

# 2. Throughput indexation
echo ""
echo "2️⃣ Throughput Indexation (dernières 24h)"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h | grep "Indexing completed"' | wc -l | \
  awk '{print "Documents indexés: " $1 " (" $1 " docs/jour, " $1/24 " docs/heure)"}'

# 3. Cache hit rate
echo ""
echo "3️⃣ Cache Hit Rate"
echo "--------------------------------------"
ssh root@84.247.165.187 'docker exec moncabinet-redis redis-cli INFO stats' | \
  grep -E "keyspace_hits|keyspace_misses" | \
  awk -F: '
    /keyspace_hits/ {hits=$2}
    /keyspace_misses/ {misses=$2}
    END {
      total = hits + misses
      rate = (hits / total) * 100
      print "Hits: " hits
      print "Misses: " misses
      print "Hit rate: " rate "%"
    }
  '

# 4. Index DB scans
echo ""
echo "4️⃣ Index DB Usage"
echo "--------------------------------------"
ssh -f -N -L 5434:localhost:5432 root@84.247.165.187 2>/dev/null
sleep 1
psql -h localhost -p 5434 -U moncabinet -d moncabinet -t -c "
  SELECT
    indexrelname || ': ' || idx_scan || ' scans'
  FROM pg_stat_user_indexes
  WHERE indexrelname LIKE 'idx_kb_%'
  ORDER BY idx_scan DESC
  LIMIT 10;
" | grep -v "^$"

# 5. Santé Ollama
echo ""
echo "5️⃣ Santé Ollama"
echo "--------------------------------------"
ssh root@84.247.165.187 'systemctl status ollama --no-pager | grep -E "Active|Memory"'

echo ""
echo "=========================================="
echo "✅ Collecte terminée - $(date +%H:%M)"
echo "=========================================="
```

**Usage** :
```bash
chmod +x daily-metrics.sh
./daily-metrics.sh > metrics-$(date +%Y-%m-%d).log
```

**Fréquence** : 1×/jour (matin 9h recommandé)

---

## 🚨 Alertes Automatiques (Optionnel)

### Script détection anomalies

```bash
#!/bin/bash
# check-anomalies.sh - Détecte anomalies et envoie alerte

ALERT_EMAIL="votre@email.com"
THRESHOLD_P95=8000  # 8s en ms

# Check P95 latency
p95=$(ssh root@84.247.165.187 'docker logs moncabinet-nextjs --since 24h | grep "RAG Search.*Latency"' | \
  grep -oP 'Latency: \K[0-9]+' | \
  sort -n | \
  awk '{all[NR]=$1} END {print all[int(NR*0.95)]}')

if [ "$p95" -gt "$THRESHOLD_P95" ]; then
  echo "⚠️ ALERTE: P95 latency trop élevé ($p95 ms > $THRESHOLD_P95 ms)" | \
    mail -s "[Qadhya] Alerte Performance RAG" $ALERT_EMAIL
fi

# Check Ollama crashes
crashes=$(ssh root@84.247.165.187 'journalctl -u ollama --since "24 hours ago" | grep -ic crash')

if [ "$crashes" -gt 0 ]; then
  echo "⚠️ ALERTE: Ollama a crashé $crashes fois en 24h" | \
    mail -s "[Qadhya] Alerte Ollama Crash" $ALERT_EMAIL
fi

# Check container restarts
restarts=$(ssh root@84.247.165.187 'docker inspect moncabinet-nextjs | jq ".[0].RestartCount"')

if [ "$restarts" -gt 3 ]; then
  echo "⚠️ ALERTE: Container NextJS redémarré $restarts fois" | \
    mail -s "[Qadhya] Alerte Container Restart" $ALERT_EMAIL
fi
```

**Cron** (exécuter toutes les 6h) :
```bash
0 */6 * * * /path/to/check-anomalies.sh
```

---

## 📝 Checklist Hebdomadaire

**Jour 1 (10 Feb)** :
- [ ] Déploiement Phase 1 en production
- [ ] Vérifier santé post-déploiement
- [ ] Baseline : Collecter métriques initiales

**Jours 2-6 (11-15 Feb)** :
- [ ] Exécuter `daily-metrics.sh` chaque matin
- [ ] Vérifier alertes anomalies
- [ ] Noter incidents dans rapport

**Jour 7 (17 Feb)** :
- [ ] Collecter métriques finales
- [ ] Calculer moyennes semaine
- [ ] Remplir template rapport (PHASE1_WEEKLY_REPORT_TEMPLATE.md)
- [ ] Décision : Pause / Ajustements / Debug

---

## 🔗 Références

- **Rapport template** : `docs/PHASE1_WEEKLY_REPORT_TEMPLATE.md`
- **Documentation Phase 1** : `docs/PHASE1_PRESENTATION.md`
- **Script déploiement** : `scripts/deploy-phase1-production.sh`
- **Script tests perf** : `scripts/test-phase1-performance.ts`

---

**Version** : 1.0
**Dernière mise à jour** : 10 février 2026
