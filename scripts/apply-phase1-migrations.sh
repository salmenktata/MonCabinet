#!/bin/bash
# Script: Application Migrations Phase 1 PostgreSQL Optimizations
# Date: 2026-02-14
# Usage:
#   Local:  bash scripts/apply-phase1-migrations.sh
#   Prod:   bash scripts/apply-phase1-migrations.sh --prod

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/migrations"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Mode
MODE="local"
if [[ "$1" == "--prod" ]]; then
  MODE="prod"
fi

# =============================================================================
# HELPERS
# =============================================================================

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

confirm() {
  read -p "$(echo -e ${YELLOW}$1${NC}) (y/N): " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]]
}

# =============================================================================
# DÉTECTION ENVIRONNEMENT
# =============================================================================

if [[ "$MODE" == "prod" ]]; then
  log_info "Mode PRODUCTION détecté"
  PSQL_CMD="ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya'"

  log_warning "ATTENTION: Vous êtes sur le point d'appliquer des migrations EN PRODUCTION"
  log_warning "Les migrations suivantes seront appliquées:"
  echo "  1. mv_kb_metadata_enriched (Materialized View)"
  echo "  2. partial_indexes_language (Indexes partiels AR/FR)"
  echo "  3. optimize_autovacuum (Tuning VACUUM)"
  echo ""

  if ! confirm "Continuer avec l'application sur PRODUCTION ?"; then
    log_info "Annulé par l'utilisateur"
    exit 0
  fi
else
  log_info "Mode LOCAL détecté"

  # Détecter variables .env.local
  if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
    source "$PROJECT_ROOT/.env.local"
  fi

  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5433}"
  DB_NAME="${DB_NAME:-avocat_dev}"
  DB_USER="${DB_USER:-postgres}"

  PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
fi

# =============================================================================
# VALIDATION PRÉ-MIGRATION
# =============================================================================

log_info "Validation pré-migration..."

# Test connexion
if [[ "$MODE" == "prod" ]]; then
  if ! ssh root@84.247.165.187 'docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT 1"' &>/dev/null; then
    log_error "Impossible de se connecter à la base de données PRODUCTION"
    exit 1
  fi
else
  if ! eval "$PSQL_CMD -c 'SELECT 1'" &>/dev/null; then
    log_error "Impossible de se connecter à la base de données locale"
    log_info "Vérifiez que PostgreSQL est démarré et que les variables .env.local sont correctes"
    exit 1
  fi
fi

log_success "Connexion base de données OK"

# =============================================================================
# BACKUP BASE DE DONNÉES (PROD uniquement)
# =============================================================================

if [[ "$MODE" == "prod" ]]; then
  log_info "Création backup base de données avant migrations..."

  BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="/opt/backups/moncabinet/qadhya_pre_phase1_${BACKUP_DATE}.sql"

  if ssh root@84.247.165.187 "docker exec qadhya-postgres pg_dump -U moncabinet -d qadhya -F c -f /tmp/backup.dump && cp /tmp/backup.dump $BACKUP_FILE"; then
    log_success "Backup créé: $BACKUP_FILE"
  else
    log_warning "Backup échoué, mais migration peut continuer (RISQUE)"
    if ! confirm "Continuer sans backup ?"; then
      exit 1
    fi
  fi
fi

# =============================================================================
# MIGRATION 1: Materialized View Metadata
# =============================================================================

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "MIGRATION 1: Materialized View Metadata Enriched"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MIGRATION_FILE="$MIGRATIONS_DIR/20260214_mv_kb_metadata_enriched.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  log_error "Fichier migration introuvable: $MIGRATION_FILE"
  exit 1
fi

log_info "Fichier: $(basename $MIGRATION_FILE)"
log_info "Durée estimée: 10-30s (selon taille KB)"

if [[ "$MODE" == "prod" ]]; then
  if ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya" < "$MIGRATION_FILE"; then
    log_success "Migration 1 appliquée avec succès"
  else
    log_error "Échec migration 1"
    exit 1
  fi
else
  if eval "$PSQL_CMD -f '$MIGRATION_FILE'"; then
    log_success "Migration 1 appliquée avec succès"
  else
    log_error "Échec migration 1"
    exit 1
  fi
fi

# Vérification MV créée
log_info "Vérification Materialized View..."
if [[ "$MODE" == "prod" ]]; then
  MV_COUNT=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"SELECT COUNT(*) FROM mv_kb_metadata_enriched\"" | xargs)
else
  MV_COUNT=$(eval "$PSQL_CMD -t -c 'SELECT COUNT(*) FROM mv_kb_metadata_enriched'" | xargs)
fi

log_success "Materialized View contient $MV_COUNT entrées"

# =============================================================================
# MIGRATION 2: Indexes Partiels Langue
# =============================================================================

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "MIGRATION 2: Indexes Partiels par Langue"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MIGRATION_FILE="$MIGRATIONS_DIR/20260214_partial_indexes_language.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  log_error "Fichier migration introuvable: $MIGRATION_FILE"
  exit 1
fi

log_info "Fichier: $(basename $MIGRATION_FILE)"
log_info "Durée estimée: 2-5min (CONCURRENTLY, pas de lock)"

if [[ "$MODE" == "prod" ]]; then
  if ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya" < "$MIGRATION_FILE"; then
    log_success "Migration 2 appliquée avec succès"
  else
    log_error "Échec migration 2"
    exit 1
  fi
else
  if eval "$PSQL_CMD -f '$MIGRATION_FILE'"; then
    log_success "Migration 2 appliquée avec succès"
  else
    log_error "Échec migration 2"
    exit 1
  fi
fi

# Vérification indexes créés
log_info "Vérification indexes partiels..."
if [[ "$MODE" == "prod" ]]; then
  INDEXES=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_kb_chunks_%_ar' OR indexname LIKE 'idx_kb_chunks_%_fr'\"" | xargs)
else
  INDEXES=$(eval "$PSQL_CMD -t -c \"SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_kb_chunks_%_ar' OR indexname LIKE 'idx_kb_chunks_%_fr'\"" | xargs)
fi

log_success "$INDEXES indexes partiels créés"

# =============================================================================
# MIGRATION 3: Optimisation Autovacuum
# =============================================================================

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "MIGRATION 3: Optimisation Autovacuum"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MIGRATION_FILE="$MIGRATIONS_DIR/20260214_optimize_autovacuum.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  log_error "Fichier migration introuvable: $MIGRATION_FILE"
  exit 1
fi

log_info "Fichier: $(basename $MIGRATION_FILE)"
log_info "Durée estimée: 2-5min (VACUUM initial)"

if [[ "$MODE" == "prod" ]]; then
  if ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya" < "$MIGRATION_FILE"; then
    log_success "Migration 3 appliquée avec succès"
  else
    log_error "Échec migration 3"
    exit 1
  fi
else
  if eval "$PSQL_CMD -f '$MIGRATION_FILE'"; then
    log_success "Migration 3 appliquée avec succès"
  else
    log_error "Échec migration 3"
    exit 1
  fi
fi

# Vérification tuning appliqué
log_info "Vérification tuning autovacuum..."
if [[ "$MODE" == "prod" ]]; then
  TUNED_TABLES=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'knowledge_base%' AND reloptions IS NOT NULL\"" | xargs)
else
  TUNED_TABLES=$(eval "$PSQL_CMD -t -c \"SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'knowledge_base%' AND reloptions IS NOT NULL\"" | xargs)
fi

log_success "$TUNED_TABLES tables avec tuning autovacuum appliqué"

# =============================================================================
# ACTIVATION FEATURE FLAG
# =============================================================================

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "ACTIVATION FEATURE FLAGS"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$MODE" == "prod" ]]; then
  log_info "Ajout USE_KB_METADATA_MV=true dans .env.production.local"

  if ssh root@84.247.165.187 "grep -q 'USE_KB_METADATA_MV' /opt/qadhya/.env.production.local"; then
    log_warning "Variable déjà présente, mise à jour..."
    ssh root@84.247.165.187 "sed -i 's/USE_KB_METADATA_MV=.*/USE_KB_METADATA_MV=true/' /opt/qadhya/.env.production.local"
  else
    ssh root@84.247.165.187 "echo 'USE_KB_METADATA_MV=true' >> /opt/qadhya/.env.production.local"
  fi

  log_info "Redémarrage conteneur Next.js..."
  ssh root@84.247.165.187 "cd /opt/qadhya && docker-compose up -d --no-deps nextjs"

  log_success "Feature flag activé et application redémarrée"
else
  log_info "Ajout USE_KB_METADATA_MV=true dans .env.local"

  if grep -q "USE_KB_METADATA_MV" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
    log_warning "Variable déjà présente, mise à jour..."
    sed -i '' 's/USE_KB_METADATA_MV=.*/USE_KB_METADATA_MV=true/' "$PROJECT_ROOT/.env.local"
  else
    echo "USE_KB_METADATA_MV=true" >> "$PROJECT_ROOT/.env.local"
  fi

  log_success "Feature flag activé (redémarrage dev server requis)"
fi

# =============================================================================
# RAPPORT FINAL
# =============================================================================

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "MIGRATIONS PHASE 1 APPLIQUÉES AVEC SUCCÈS"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
log_success "✅ Migration 1: Materialized View ($MV_COUNT entrées)"
log_success "✅ Migration 2: Indexes Partiels ($INDEXES indexes)"
log_success "✅ Migration 3: Autovacuum Optimisé ($TUNED_TABLES tables)"
log_success "✅ Feature Flag: USE_KB_METADATA_MV=true"

echo ""
log_info "📊 Prochaines étapes:"
echo "  1. Exécuter benchmark: npx tsx scripts/benchmark-phase1-optimizations.ts"
echo "  2. Vérifier santé DB: bash scripts/monitor-phase1-health.sh"
echo "  3. Ajouter refresh MV au cron quotidien:"
echo "     psql -U moncabinet -d qadhya -c \"REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kb_metadata_enriched;\""

if [[ "$MODE" == "prod" ]]; then
  echo ""
  log_warning "PRODUCTION: Surveillez les logs pendant 10-15min"
  echo "  docker logs -f qadhya-nextjs"
fi

echo ""
log_success "🎉 Phase 1 PostgreSQL Optimizations déployée!"
