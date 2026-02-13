#!/bin/bash
# Script: Refresh Materialized View Metadata (Cron Quotidien)
# Date: 2026-02-14
# Cron: 0 3 * * * /opt/qadhya/scripts/cron-refresh-mv-metadata.sh >> /var/log/qadhya/mv-refresh.log 2>&1
# Description: Rafraîchit mv_kb_metadata_enriched quotidiennement pour maintenir fraîcheur <24h

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

LOG_FILE="${LOG_FILE:-/var/log/qadhya/mv-refresh.log}"
PSQL_CMD="docker exec qadhya-postgres psql -U moncabinet -d qadhya"

# Couleurs (si terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# =============================================================================
# HELPERS
# =============================================================================

log() {
  echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_info() {
  log "${BLUE}[INFO]${NC} $1"
}

log_success() {
  log "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
  log "${RED}[ERROR]${NC} $1"
}

log_warning() {
  log "${YELLOW}[WARNING]${NC} $1"
}

# =============================================================================
# MAIN
# =============================================================================

log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "REFRESH MATERIALIZED VIEW METADATA (Cron Quotidien)"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier si container PostgreSQL est up
if ! docker ps | grep -q qadhya-postgres; then
  log_error "Container qadhya-postgres n'est pas démarré"
  exit 1
fi

# Vérifier si MV existe
MV_EXISTS=$(${PSQL_CMD} -t -c "SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'mv_kb_metadata_enriched'" | xargs)

if [[ "$MV_EXISTS" == "0" ]]; then
  log_error "Materialized View mv_kb_metadata_enriched n'existe pas"
  log_warning "Exécutez: bash /opt/qadhya/scripts/apply-phase1-migrations.sh --prod"
  exit 1
fi

# Récupérer stats AVANT refresh
log_info "Récupération statistiques pré-refresh..."

BEFORE_COUNT=$(${PSQL_CMD} -t -c "SELECT COUNT(*) FROM mv_kb_metadata_enriched" | xargs)
BEFORE_SIZE=$(${PSQL_CMD} -t -c "SELECT pg_size_pretty(pg_total_relation_size('mv_kb_metadata_enriched'))" | xargs)
LAST_REFRESH=$(${PSQL_CMD} -t -c "SELECT TO_CHAR(last_refresh, 'YYYY-MM-DD HH24:MI:SS') FROM pg_stat_user_tables JOIN pg_matviews ON tablename = matviewname WHERE tablename = 'mv_kb_metadata_enriched'" | xargs)

log_info "État avant refresh:"
log_info "  - Entrées: $BEFORE_COUNT"
log_info "  - Taille: $BEFORE_SIZE"
log_info "  - Dernière refresh: ${LAST_REFRESH:-Jamais}"

# REFRESH CONCURRENTLY (pas de lock)
log_info "Lancement REFRESH MATERIALIZED VIEW CONCURRENTLY..."

START_TIME=$(date +%s)

if ${PSQL_CMD} -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;"; then
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  log_success "Refresh terminé en ${DURATION}s"

  # Récupérer stats APRÈS refresh
  AFTER_COUNT=$(${PSQL_CMD} -t -c "SELECT COUNT(*) FROM mv_kb_metadata_enriched" | xargs)
  AFTER_SIZE=$(${PSQL_CMD} -t -c "SELECT pg_size_pretty(pg_total_relation_size('mv_kb_metadata_enriched'))" | xargs)

  log_info "État après refresh:"
  log_info "  - Entrées: $AFTER_COUNT (delta: $((AFTER_COUNT - BEFORE_COUNT)))"
  log_info "  - Taille: $AFTER_SIZE"

  # ANALYZE pour mettre à jour statistiques query planner
  log_info "Lancement ANALYZE pour mise à jour statistiques..."

  if ${PSQL_CMD} -c "ANALYZE mv_kb_metadata_enriched;"; then
    log_success "ANALYZE terminé"
  else
    log_warning "ANALYZE échoué (non critique)"
  fi

  # Vérifier santé post-refresh
  log_info "Vérification santé post-refresh..."

  STALENESS=$(${PSQL_CMD} -t -c "SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 60, 1) FROM pg_stat_user_tables JOIN pg_matviews ON tablename = matviewname WHERE tablename = 'mv_kb_metadata_enriched'" | xargs)

  log_info "  - Staleness: ${STALENESS}min"

  if (( $(echo "$STALENESS < 5" | bc -l) )); then
    log_success "Staleness <5min → Refresh réussi ✅"
  else
    log_warning "Staleness ${STALENESS}min > 5min → Possible problème"
  fi

  log_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_success "REFRESH MATERIALIZED VIEW TERMINÉ AVEC SUCCÈS (${DURATION}s)"
  log_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  exit 0
else
  log_error "REFRESH MATERIALIZED VIEW ÉCHOUÉ"

  # Diagnostics en cas d'échec
  log_warning "Diagnostics:"

  # Vérifier si unique index existe
  UNIQUE_INDEX=$(${PSQL_CMD} -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'mv_kb_metadata_enriched' AND indexdef LIKE '%UNIQUE%'" | xargs)

  if [[ "$UNIQUE_INDEX" == "0" ]]; then
    log_error "  - Index UNIQUE manquant sur MV (requis pour REFRESH CONCURRENTLY)"
    log_info "  - Créez-le: CREATE UNIQUE INDEX idx_mv_kb_metadata_id ON mv_kb_metadata_enriched (id);"
  fi

  # Vérifier verrous actifs
  LOCKS=$(${PSQL_CMD} -t -c "SELECT COUNT(*) FROM pg_locks WHERE relation = 'mv_kb_metadata_enriched'::regclass" | xargs)

  if [[ "$LOCKS" != "0" ]]; then
    log_warning "  - $LOCKS verrous actifs sur MV (possible contention)"
  fi

  exit 1
fi
