#!/bin/bash
# Script: Monitoring Santé Phase 1 PostgreSQL Optimizations
# Date: 2026-02-14
# Usage:
#   Local:  bash scripts/monitor-phase1-health.sh
#   Prod:   bash scripts/monitor-phase1-health.sh --prod
#   Watch:  watch -n 60 bash scripts/monitor-phase1-health.sh --prod

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

# Mode
MODE="local"
if [[ "$1" == "--prod" ]]; then
  MODE="prod"
fi

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =============================================================================
# HELPERS
# =============================================================================

log_header() {
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_metric() {
  local label="$1"
  local value="$2"
  local status="$3"
  printf "  %-35s %20s  %s\n" "$label:" "$value" "$status"
}

get_status_icon() {
  local current=$1
  local target=$2
  local comparison=$3  # "lt" (less than) ou "gt" (greater than)

  if [[ "$comparison" == "lt" ]]; then
    if (( $(echo "$current < $target" | bc -l) )); then
      echo "🟢"
    elif (( $(echo "$current < $target * 1.2" | bc -l) )); then
      echo "🟡"
    else
      echo "🔴"
    fi
  else
    if (( $(echo "$current > $target" | bc -l) )); then
      echo "🟢"
    elif (( $(echo "$current > $target * 0.8" | bc -l) )); then
      echo "🟡"
    else
      echo "🔴"
    fi
  fi
}

# =============================================================================
# DÉTECTION ENVIRONNEMENT
# =============================================================================

if [[ "$MODE" == "prod" ]]; then
  PSQL_CMD='ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c'
  PSQL_SUFFIX='"'
else
  # Charger .env.local
  if [[ -f ".env.local" ]]; then
    source .env.local
  fi

  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5433}"
  DB_NAME="${DB_NAME:-avocat_dev}"
  DB_USER="${DB_USER:-postgres}"

  PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c"
  PSQL_SUFFIX=""
fi

# =============================================================================
# HEADER
# =============================================================================

clear
echo ""
log_header "🔍 MONITORING PHASE 1 POSTGRESQL OPTIMIZATIONS"
echo ""
echo -e "${BLUE}Mode:${NC} $MODE"
echo -e "${BLUE}Date:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# =============================================================================
# SECTION 1: MATERIALIZED VIEW
# =============================================================================

log_header "📊 MATERIALIZED VIEW METADATA"

# Vérifier si MV existe
MV_EXISTS=$(eval "$PSQL_CMD \"SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'mv_kb_metadata_enriched'\" $PSQL_SUFFIX" | xargs)

if [[ "$MV_EXISTS" == "0" ]]; then
  log_metric "Status" "NON CRÉÉE" "🔴"
  echo ""
  echo -e "${RED}⚠️  Materialized View non créée. Exécutez:${NC}"
  echo -e "${YELLOW}   bash scripts/apply-phase1-migrations.sh${NC}"
  exit 1
fi

# Nombre d'entrées MV
MV_COUNT=$(eval "$PSQL_CMD \"SELECT COUNT(*) FROM mv_kb_metadata_enriched\" $PSQL_SUFFIX" | xargs)
log_metric "Entrées" "$MV_COUNT" "ℹ️"

# Taille MV
MV_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_total_relation_size('mv_kb_metadata_enriched'))\" $PSQL_SUFFIX" | xargs)
log_metric "Taille" "$MV_SIZE" "ℹ️"

# Staleness (fraîcheur)
MV_STALENESS=$(eval "$PSQL_CMD \"SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 3600, 1) FROM pg_stat_user_tables JOIN pg_matviews ON tablename = matviewname WHERE tablename = 'mv_kb_metadata_enriched'\" $PSQL_SUFFIX" | xargs)

if [[ -z "$MV_STALENESS" ]] || [[ "$MV_STALENESS" == "" ]]; then
  MV_STALENESS_STATUS="🔴"
  MV_STALENESS="Jamais refresh"
else
  MV_STALENESS_DISPLAY="${MV_STALENESS}h"
  MV_STALENESS_STATUS=$(get_status_icon "$MV_STALENESS" 24 "lt")
fi

log_metric "Staleness (fraîcheur)" "${MV_STALENESS_DISPLAY:-N/A}" "$MV_STALENESS_STATUS"

# Dernière refresh
LAST_REFRESH=$(eval "$PSQL_CMD \"SELECT TO_CHAR(last_refresh, 'YYYY-MM-DD HH24:MI:SS') FROM pg_stat_user_tables JOIN pg_matviews ON tablename = matviewname WHERE tablename = 'mv_kb_metadata_enriched'\" $PSQL_SUFFIX" | xargs)
log_metric "Dernière refresh" "${LAST_REFRESH:-Jamais}" "ℹ️"

echo ""

# =============================================================================
# SECTION 2: INDEXES PARTIELS
# =============================================================================

log_header "📑 INDEXES PARTIELS PAR LANGUE"

# Compter indexes partiels créés
INDEXES_AR=$(eval "$PSQL_CMD \"SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_kb_chunks_%_ar'\" $PSQL_SUFFIX" | xargs)
INDEXES_FR=$(eval "$PSQL_CMD \"SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_kb_chunks_%_fr'\" $PSQL_SUFFIX" | xargs)

log_metric "Indexes partiels arabe" "$INDEXES_AR" "$([ $INDEXES_AR -ge 3 ] && echo '🟢' || echo '🔴')"
log_metric "Indexes partiels français" "$INDEXES_FR" "$([ $INDEXES_FR -ge 3 ] && echo '🟢' || echo '🔴')"

# Taille indexes BM25
INDEX_AR_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_relation_size('idx_kb_chunks_tsvector_ar'))\" $PSQL_SUFFIX" 2>/dev/null | xargs || echo "N/A")
INDEX_FR_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_relation_size('idx_kb_chunks_tsvector_fr'))\" $PSQL_SUFFIX" 2>/dev/null | xargs || echo "N/A")

log_metric "Taille index BM25 arabe" "$INDEX_AR_SIZE" "ℹ️"
log_metric "Taille index BM25 français" "$INDEX_FR_SIZE" "ℹ️"

# Utilisation indexes (scans count)
INDEX_AR_SCANS=$(eval "$PSQL_CMD \"SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'idx_kb_chunks_tsvector_ar'\" $PSQL_SUFFIX" 2>/dev/null | xargs || echo "0")
INDEX_FR_SCANS=$(eval "$PSQL_CMD \"SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'idx_kb_chunks_tsvector_fr'\" $PSQL_SUFFIX" 2>/dev/null | xargs || echo "0")

log_metric "Scans index arabe" "$INDEX_AR_SCANS" "$([ $INDEX_AR_SCANS -gt 100 ] && echo '🟢' || echo '🟡')"
log_metric "Scans index français" "$INDEX_FR_SCANS" "$([ $INDEX_FR_SCANS -gt 50 ] && echo '🟢' || echo '🟡')"

echo ""

# =============================================================================
# SECTION 3: AUTOVACUUM & BLOAT
# =============================================================================

log_header "🧹 AUTOVACUUM & BLOAT"

# Dead tuples knowledge_base_chunks
DEAD_TUPLES=$(eval "$PSQL_CMD \"SELECT ROUND(100.0 * n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0), 1) FROM pg_stat_user_tables WHERE tablename = 'knowledge_base_chunks'\" $PSQL_SUFFIX" | xargs)
DEAD_TUPLES_STATUS=$(get_status_icon "${DEAD_TUPLES:-0}" 5 "lt")

log_metric "Dead tuples chunks (%)" "${DEAD_TUPLES:-0}%" "$DEAD_TUPLES_STATUS"

# Dead tuples knowledge_base
DEAD_TUPLES_KB=$(eval "$PSQL_CMD \"SELECT ROUND(100.0 * n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0), 1) FROM pg_stat_user_tables WHERE tablename = 'knowledge_base'\" $PSQL_SUFFIX" | xargs)
DEAD_TUPLES_KB_STATUS=$(get_status_icon "${DEAD_TUPLES_KB:-0}" 5 "lt")

log_metric "Dead tuples KB (%)" "${DEAD_TUPLES_KB:-0}%" "$DEAD_TUPLES_KB_STATUS"

# Dernier autovacuum chunks
LAST_AUTOVACUUM_CHUNKS=$(eval "$PSQL_CMD \"SELECT TO_CHAR(last_autovacuum, 'YYYY-MM-DD HH24:MI:SS') FROM pg_stat_user_tables WHERE tablename = 'knowledge_base_chunks'\" $PSQL_SUFFIX" | xargs)
log_metric "Dernier autovacuum chunks" "${LAST_AUTOVACUUM_CHUNKS:-Jamais}" "ℹ️"

# Dernier autovacuum KB
LAST_AUTOVACUUM_KB=$(eval "$PSQL_CMD \"SELECT TO_CHAR(last_autovacuum, 'YYYY-MM-DD HH24:MI:SS') FROM pg_stat_user_tables WHERE tablename = 'knowledge_base'\" $PSQL_SUFFIX" | xargs)
log_metric "Dernier autovacuum KB" "${LAST_AUTOVACUUM_KB:-Jamais}" "ℹ️"

# Tuning autovacuum appliqué?
TUNED_CHUNKS=$(eval "$PSQL_CMD \"SELECT CASE WHEN reloptions IS NOT NULL THEN 'OUI' ELSE 'NON' END FROM pg_tables WHERE tablename = 'knowledge_base_chunks'\" $PSQL_SUFFIX" | xargs)
log_metric "Tuning autovacuum chunks" "$TUNED_CHUNKS" "$([ \"$TUNED_CHUNKS\" == \"OUI\" ] && echo '🟢' || echo '🔴')"

echo ""

# =============================================================================
# SECTION 4: CACHE HIT RATE
# =============================================================================

log_header "💾 CACHE HIT RATE"

# Cache hit rate global
CACHE_HIT=$(eval "$PSQL_CMD \"SELECT ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 1) FROM pg_stat_database WHERE datname = current_database()\" $PSQL_SUFFIX" | xargs)
CACHE_HIT_STATUS=$(get_status_icon "${CACHE_HIT:-0}" 70 "gt")

log_metric "Cache hit rate global" "${CACHE_HIT:-0}%" "$CACHE_HIT_STATUS"

# Cache hit rate tables KB
CACHE_HIT_KB=$(eval "$PSQL_CMD \"SELECT ROUND(100.0 * SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0), 1) FROM pg_statio_user_tables WHERE tablename LIKE 'knowledge_base%'\" $PSQL_SUFFIX" | xargs)
CACHE_HIT_KB_STATUS=$(get_status_icon "${CACHE_HIT_KB:-0}" 70 "gt")

log_metric "Cache hit rate tables KB" "${CACHE_HIT_KB:-0}%" "$CACHE_HIT_KB_STATUS"

# Cache hit rate indexes KB
CACHE_HIT_IDX=$(eval "$PSQL_CMD \"SELECT ROUND(100.0 * SUM(idx_blks_hit) / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0), 1) FROM pg_statio_user_indexes WHERE tablename LIKE 'knowledge_base%'\" $PSQL_SUFFIX" | xargs)
CACHE_HIT_IDX_STATUS=$(get_status_icon "${CACHE_HIT_IDX:-0}" 80 "gt")

log_metric "Cache hit rate indexes KB" "${CACHE_HIT_IDX:-0}%" "$CACHE_HIT_IDX_STATUS"

echo ""

# =============================================================================
# SECTION 5: TAILLE BASE DE DONNÉES
# =============================================================================

log_header "💽 TAILLE BASE DE DONNÉES"

# Taille totale DB
DB_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_database_size(current_database()))\" $PSQL_SUFFIX" | xargs)
log_metric "Taille totale DB" "$DB_SIZE" "ℹ️"

# Taille table knowledge_base
KB_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_total_relation_size('knowledge_base'))\" $PSQL_SUFFIX" | xargs)
log_metric "Taille knowledge_base" "$KB_SIZE" "ℹ️"

# Taille table knowledge_base_chunks
CHUNKS_SIZE=$(eval "$PSQL_CMD \"SELECT pg_size_pretty(pg_total_relation_size('knowledge_base_chunks'))\" $PSQL_SUFFIX" | xargs)
log_metric "Taille knowledge_base_chunks" "$CHUNKS_SIZE" "ℹ️"

# Nombre total de chunks
TOTAL_CHUNKS=$(eval "$PSQL_CMD \"SELECT COUNT(*) FROM knowledge_base_chunks\" $PSQL_SUFFIX" | xargs)
log_metric "Nombre total chunks" "$TOTAL_CHUNKS" "ℹ️"

echo ""

# =============================================================================
# SECTION 6: OBJECTIFS PHASE 1
# =============================================================================

log_header "🎯 OBJECTIFS PHASE 1"

# Calculer score
SCORE=0
TOTAL_OBJECTIVES=5

# 1. Dead tuples <5%
if (( $(echo "${DEAD_TUPLES:-100} < 5" | bc -l) )); then
  log_metric "Dead tuples <5%" "✅ ${DEAD_TUPLES}%" "🟢"
  ((SCORE++))
else
  log_metric "Dead tuples <5%" "❌ ${DEAD_TUPLES}%" "🔴"
fi

# 2. Cache hit >70%
if (( $(echo "${CACHE_HIT:-0} > 70" | bc -l) )); then
  log_metric "Cache hit >70%" "✅ ${CACHE_HIT}%" "🟢"
  ((SCORE++))
else
  log_metric "Cache hit >70%" "❌ ${CACHE_HIT}%" "🔴"
fi

# 3. MV staleness <24h
if [[ "$MV_STALENESS" =~ ^[0-9]+\.?[0-9]*$ ]] && (( $(echo "$MV_STALENESS < 24" | bc -l) )); then
  log_metric "MV staleness <24h" "✅ ${MV_STALENESS}h" "🟢"
  ((SCORE++))
else
  log_metric "MV staleness <24h" "❌ ${MV_STALENESS}" "🔴"
fi

# 4. Indexes partiels créés
if [[ $INDEXES_AR -ge 3 ]] && [[ $INDEXES_FR -ge 3 ]]; then
  log_metric "Indexes partiels créés" "✅ AR:$INDEXES_AR FR:$INDEXES_FR" "🟢"
  ((SCORE++))
else
  log_metric "Indexes partiels créés" "❌ AR:$INDEXES_AR FR:$INDEXES_FR" "🔴"
fi

# 5. Tuning autovacuum appliqué
if [[ "$TUNED_CHUNKS" == "OUI" ]]; then
  log_metric "Tuning autovacuum appliqué" "✅ OUI" "🟢"
  ((SCORE++))
else
  log_metric "Tuning autovacuum appliqué" "❌ NON" "🔴"
fi

echo ""
log_metric "🏆 SCORE PHASE 1" "$SCORE/$TOTAL_OBJECTIVES objectifs" "$([ $SCORE -ge 4 ] && echo '🟢' || echo '🟡')"

echo ""

# =============================================================================
# ACTIONS RECOMMANDÉES
# =============================================================================

if [[ $SCORE -lt $TOTAL_OBJECTIVES ]]; then
  log_header "⚠️  ACTIONS RECOMMANDÉES"

  if [[ "$MV_STALENESS" == "Jamais refresh" ]] || (( $(echo "$MV_STALENESS > 24" | bc -l 2>/dev/null || echo 1) )); then
    echo "  📊 Refresh Materialized View:"
    if [[ "$MODE" == "prod" ]]; then
      echo "     ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;\"'"
    else
      echo "     psql -U $DB_USER -d $DB_NAME -c 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;'"
    fi
    echo ""
  fi

  if (( $(echo "${DEAD_TUPLES:-100} > 5" | bc -l) )); then
    echo "  🧹 Lancer VACUUM manuel:"
    if [[ "$MODE" == "prod" ]]; then
      echo "     ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"VACUUM (ANALYZE) knowledge_base_chunks;\"'"
    else
      echo "     psql -U $DB_USER -d $DB_NAME -c 'VACUUM (ANALYZE) knowledge_base_chunks;'"
    fi
    echo ""
  fi

  if [[ "$TUNED_CHUNKS" != "OUI" ]]; then
    echo "  ⚙️  Appliquer tuning autovacuum:"
    echo "     bash scripts/apply-phase1-migrations.sh"
    echo ""
  fi
fi

# =============================================================================
# FOOTER
# =============================================================================

log_header "✅ MONITORING TERMINÉ"
echo ""

if [[ $SCORE -eq $TOTAL_OBJECTIVES ]]; then
  echo -e "${GREEN}🎉 EXCELLENT! Toutes les optimisations Phase 1 sont opérationnelles.${NC}"
elif [[ $SCORE -ge 3 ]]; then
  echo -e "${YELLOW}✅ BON. La plupart des optimisations sont actives. Voir actions recommandées.${NC}"
else
  echo -e "${RED}⚠️  ATTENTION. Plusieurs optimisations ne sont pas actives. Appliquer migrations.${NC}"
fi

echo ""
