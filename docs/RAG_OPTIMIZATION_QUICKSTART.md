# 🚀 Quick Start : Optimisation RAG Phase 1

Guide de démarrage rapide pour déployer les optimisations PostgreSQL Phase 1 en **10 minutes**.

---

## ⚡ Déploiement Express (Local)

```bash
# 1. Appliquer migrations (5-7min)
bash scripts/apply-phase1-migrations.sh

# 2. Vérifier santé
bash scripts/monitor-phase1-health.sh

# 3. Tester performance
npx tsx scripts/benchmark-phase1-optimizations.ts
```

**Résultat attendu :** Latence P50 : 2-3s → **1.5-2s** ✅

---

## 🌐 Déploiement Production

```bash
# 1. Backup DB (optionnel mais recommandé)
ssh root@84.247.165.187 'docker exec qadhya-postgres pg_dump -U moncabinet -d qadhya -F c -f /tmp/backup_pre_phase1.dump'

# 2. Appliquer migrations (5-10min)
bash scripts/apply-phase1-migrations.sh --prod

# 3. Vérifier santé
bash scripts/monitor-phase1-health.sh --prod

# 4. Configurer cron quotidien
scp scripts/cron-refresh-mv-metadata.sh root@84.247.165.187:/opt/qadhya/scripts/
ssh root@84.247.165.187 'chmod +x /opt/qadhya/scripts/cron-refresh-mv-metadata.sh'

# Ajouter à crontab (3h du matin)
ssh root@84.247.165.187 'crontab -l | { cat; echo "0 3 * * * /opt/qadhya/scripts/cron-refresh-mv-metadata.sh >> /var/log/qadhya/mv-refresh.log 2>&1"; } | crontab -'

# 5. Surveiller logs 10-15min
ssh root@84.247.165.187 'docker logs -f qadhya-nextjs'
```

---

## 📊 Commandes Monitoring Essentielles

### Santé Générale
```bash
# Local
bash scripts/monitor-phase1-health.sh

# Prod
bash scripts/monitor-phase1-health.sh --prod

# Watch mode (rafraîchir toutes les 60s)
watch -n 60 bash scripts/monitor-phase1-health.sh --prod
```

### Métriques Critiques (SQL Direct)

**Dead tuples (objectif <5%) :**
```sql
SELECT
  tablename,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) as dead_pct
FROM pg_stat_user_tables
WHERE tablename IN ('knowledge_base', 'knowledge_base_chunks');
```

**MV staleness (objectif <24h) :**
```sql
SELECT
  EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 3600 as staleness_hours
FROM pg_stat_user_tables
JOIN pg_matviews ON tablename = matviewname
WHERE tablename = 'mv_kb_metadata_enriched';
```

**Cache hit rate (objectif >70%) :**
```sql
SELECT
  ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 1) as cache_hit_pct
FROM pg_stat_database WHERE datname = current_database();
```

---

## 🛠️ Maintenance Quotidienne

### Refresh MV Manuel (si cron échoue)
```bash
# Local
psql -U postgres -d avocat_dev -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;"

# Prod
ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;"'
```

### VACUUM Manuel (si dead_tuples >10%)
```bash
# Local
psql -U postgres -d avocat_dev -c "VACUUM (ANALYZE, VERBOSE) knowledge_base_chunks;"

# Prod
ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "VACUUM (ANALYZE, VERBOSE) knowledge_base_chunks;"'
```

---

## 🔍 Troubleshooting Rapide

### Problème : MV non créée
**Symptôme :** `ERROR: relation "mv_kb_metadata_enriched" does not exist`

**Solution :**
```bash
# Appliquer migration 1 uniquement
psql -U postgres -d avocat_dev -f migrations/20260214_mv_kb_metadata_enriched.sql
```

---

### Problème : Indexes partiels non utilisés
**Symptôme :** `EXPLAIN` montre `Seq Scan` au lieu de `Index Scan`

**Solution :**
```sql
-- Mettre à jour statistiques query planner
ANALYZE knowledge_base_chunks;

-- Vérifier indexes créés
SELECT indexname FROM pg_indexes
WHERE tablename = 'knowledge_base_chunks'
  AND indexname LIKE '%_ar';
```

---

### Problème : Dead tuples reste >10%
**Symptôme :** Latence dégradée, bloat persistant

**Solution :**
```sql
-- VACUUM manuel agressif
VACUUM (ANALYZE, VERBOSE) knowledge_base_chunks;

-- Vérifier tuning appliqué
SELECT reloptions FROM pg_tables WHERE tablename = 'knowledge_base_chunks';
-- Doit contenir: autovacuum_vacuum_scale_factor=0.05
```

---

### Problème : Latence toujours >2s après Phase 1
**Symptôme :** P50 reste >1.5s malgré optimisations

**Action :**
1. Vérifier toutes optimisations actives : `bash scripts/monitor-phase1-health.sh --prod`
2. Attendre 24-48h pour indexes warmup cache
3. Si persistant, envisager **Phase 2 RediSearch** (voir doc complète)

---

## 📈 Benchmark Rapide

### Test Performance (10 requêtes)
```bash
npx tsx scripts/benchmark-phase1-optimizations.ts
```

### Benchmark Complet (100 requêtes)
```bash
BENCHMARK_ITERATIONS=10 npx tsx scripts/benchmark-phase1-optimizations.ts --verbose
```

**Résultat attendu :**
```
⚡ Performance Latence:
  P50: 1423ms 🟢 Excellent
  P95: 2789ms 🟢 Excellent

🏆 Score: 6/6 objectifs atteints
🎉 SUCCÈS TOTAL
```

---

## 🔄 Rollback Rapide

### Désactiver MV (garder indexes)
```bash
# .env
USE_KB_METADATA_MV=false

# Redémarrer app
docker-compose up -d --no-deps nextjs
```

### Rollback Complet
```sql
-- Supprimer toutes optimisations
DROP MATERIALIZED VIEW IF EXISTS mv_kb_metadata_enriched CASCADE;
DROP INDEX CONCURRENTLY IF EXISTS idx_kb_chunks_tsvector_ar;
DROP INDEX CONCURRENTLY IF EXISTS idx_kb_chunks_tsvector_fr;

ALTER TABLE knowledge_base_chunks RESET (autovacuum_vacuum_scale_factor);
```

---

## ✅ Checklist Validation

**Post-déploiement immédiat :**
- [ ] MV créée : `SELECT COUNT(*) FROM mv_kb_metadata_enriched;`
- [ ] Indexes partiels : `\di idx_kb_chunks_*_ar` (6 indexes attendus)
- [ ] Dead tuples <5% : `bash scripts/monitor-phase1-health.sh`
- [ ] Application redémarrée (prod)

**J+1 validation :**
- [ ] MV refreshed (staleness <24h)
- [ ] Latence P50 <1.5s (benchmark)
- [ ] Cache hit rate >70%
- [ ] Aucun log erreur

**J+7 validation :**
- [ ] Métriques stables 7 jours
- [ ] Cron refresh MV fonctionne
- [ ] Dead tuples reste <5%
- [ ] Supprimer indexes globaux (optionnel)

---

## 📚 Documentation Complète

**Pour plus de détails, voir :**
- [`docs/RAG_OPTIMIZATION_PHASE1.md`](./RAG_OPTIMIZATION_PHASE1.md) - Guide complet Phase 1
- [`docs/RAG_QUALITY_IMPROVEMENTS.md`](./RAG_QUALITY_IMPROVEMENTS.md) - Sprints 1-3 qualité
- Plan Phase 2 (RediSearch) - Dans transcript conversation

**Fichiers clés :**
```
migrations/20260214_*.sql              # Migrations SQL
scripts/apply-phase1-migrations.sh     # Installation
scripts/monitor-phase1-health.sh       # Monitoring
scripts/benchmark-phase1-optimizations.ts  # Tests
```

---

## 🆘 Support

**En cas de problème :**
1. Vérifier logs : `docker logs qadhya-nextjs`
2. Consulter monitoring : `bash scripts/monitor-phase1-health.sh --prod`
3. Rollback si critique : `USE_KB_METADATA_MV=false`
4. Vérifier backup DB disponible

**Métriques de référence (avant Phase 1) :**
- Latence P50 : 2-3s
- Latence P95 : 5-8s
- Dead tuples : 10-15%
- Cache hit : 60-70%

---

**Version :** 1.0.0
**Dernière mise à jour :** 2026-02-14
