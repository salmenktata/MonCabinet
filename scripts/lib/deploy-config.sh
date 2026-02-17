#!/bin/bash
# ============================================================================
# CONFIGURATION CENTRALISÉE DÉPLOIEMENT
# ============================================================================
# Configuration unique pour tous les scripts de déploiement
# Utilisé par: deploy.sh, deploy-functions.sh, workflow GHA
#
# Usage:
#   source scripts/lib/deploy-config.sh
# ============================================================================

set -euo pipefail

# ----------------------------------------------------------------------------
# Paths & Directories
# ----------------------------------------------------------------------------

# VPS Production
export DEPLOY_DIR_PROD="/opt/qadhya"
export DEPLOY_USER_PROD="root"
export DEPLOY_HOST_PROD="84.247.165.187"

# Dev Local
export DEPLOY_DIR_DEV="$(pwd)"

# Backup
export BACKUP_DIR_PROD="/opt/backups/qadhya"
export BACKUP_DIR_DEV="./backups"

# Logs
export LOG_DIR_PROD="/var/log/qadhya"
export LOG_DIR_DEV="./logs"

# ----------------------------------------------------------------------------
# Docker Configuration
# ----------------------------------------------------------------------------

# Docker Registry (GitHub Container Registry)
export DOCKER_REGISTRY="ghcr.io"
export DOCKER_IMAGE_NAME="salmenktata/avocat"
export DOCKER_IMAGE_TAG="${DOCKER_IMAGE_TAG:-latest}"
export DOCKER_IMAGE_FULL="${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"

# Docker Compose
export COMPOSE_PROJECT_NAME="qadhya"
export COMPOSE_FILE="docker-compose.yml"

# Container names
export CONTAINER_NEXTJS="qadhya-nextjs"
export CONTAINER_POSTGRES="qadhya-postgres"
export CONTAINER_REDIS="qadhya-redis"
export CONTAINER_MINIO="qadhya-minio"

# ----------------------------------------------------------------------------
# Health Check Configuration
# ----------------------------------------------------------------------------

# URLs
export HEALTH_CHECK_URL_PROD="https://qadhya.tn/api/health"
export HEALTH_CHECK_URL_DEV="http://localhost:3000/api/health"

# Timing (secondes)
export HEALTH_CHECK_RETRIES=3
export HEALTH_CHECK_DELAY=15
export HEALTH_CHECK_INITIAL_WAIT=30
export HEALTH_CHECK_TIMEOUT=10

# Validation JSON stricte
export HEALTH_CHECK_EXPECTED_STATUS="healthy"

# ----------------------------------------------------------------------------
# Lock Configuration
# ----------------------------------------------------------------------------

# Lock file (protection concurrence déploiements)
export LOCK_FILE="/var/lock/qadhya-deploy.lock"
export LOCK_INFO_FILE="/var/lock/qadhya-deploy.info"
export LOCK_TIMEOUT=1800  # 30 minutes

# ----------------------------------------------------------------------------
# Build Configuration
# ----------------------------------------------------------------------------

# Next.js build
export BUILD_DIR=".next"
export BUILD_STANDALONE_DIR=".next/standalone"
export BUILD_STATIC_DIR=".next/static"

# Build args
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"

# ----------------------------------------------------------------------------
# Deployment Tiers (Legacy - conservé pour compatibilité)
# ----------------------------------------------------------------------------

# Note: Tier 1 Lightning désactivé dans nouveau système simplifié
# Seulement Docker (Tier 2) utilisé
export DEPLOY_TIER="${DEPLOY_TIER:-docker}"

# ----------------------------------------------------------------------------
# VPS SSH Configuration
# ----------------------------------------------------------------------------

export VPS_HOST="${DEPLOY_HOST_PROD}"
export VPS_USER="${DEPLOY_USER_PROD}"
export VPS_SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

# ----------------------------------------------------------------------------
# Rollback Configuration
# ----------------------------------------------------------------------------

# Nombre de backups à conserver
export ROLLBACK_KEEP_BACKUPS=5

# Répertoire backups temporaires
export ROLLBACK_BACKUP_DIR="${BACKUP_DIR_PROD}/rollback"

# ----------------------------------------------------------------------------
# Validation Configuration
# ----------------------------------------------------------------------------

# Variables critiques requises (minimum)
export REQUIRED_ENV_VARS=(
    "DB_NAME"
    "DB_USER"
    "DB_PASSWORD"
    "NEXTAUTH_SECRET"
    "MINIO_ROOT_USER"
    "MINIO_ROOT_PASSWORD"
    "CRON_SECRET"
)

# Variables RAG critiques
export REQUIRED_RAG_VARS=(
    "RAG_ENABLED"
    "OLLAMA_ENABLED"
)

# ----------------------------------------------------------------------------
# Helpers - Export Functions
# ----------------------------------------------------------------------------

# Fonction pour obtenir le deploy dir selon environnement
get_deploy_dir() {
    local env="${1:-prod}"
    if [ "$env" = "prod" ]; then
        echo "$DEPLOY_DIR_PROD"
    else
        echo "$DEPLOY_DIR_DEV"
    fi
}

# Fonction pour obtenir health check URL selon environnement
get_health_check_url() {
    local env="${1:-prod}"
    if [ "$env" = "prod" ]; then
        echo "$HEALTH_CHECK_URL_PROD"
    else
        echo "$HEALTH_CHECK_URL_DEV"
    fi
}

# Fonction pour obtenir backup dir selon environnement
get_backup_dir() {
    local env="${1:-prod}"
    if [ "$env" = "prod" ]; then
        echo "$BACKUP_DIR_PROD"
    else
        echo "$BACKUP_DIR_DEV"
    fi
}

# Export des fonctions
export -f get_deploy_dir
export -f get_health_check_url
export -f get_backup_dir

# ----------------------------------------------------------------------------
# Validation Configuration (auto-check)
# ----------------------------------------------------------------------------

# Vérifier que les variables critiques sont définies
validate_deploy_config() {
    local missing_vars=()

    # Vérifier paths
    if [ -z "${DEPLOY_DIR_PROD:-}" ]; then
        missing_vars+=("DEPLOY_DIR_PROD")
    fi

    # Vérifier Docker
    if [ -z "${DOCKER_REGISTRY:-}" ]; then
        missing_vars+=("DOCKER_REGISTRY")
    fi

    # Rapport erreurs
    if [ ${#missing_vars[@]} -gt 0 ]; then
        echo "❌ Configuration déploiement invalide - Variables manquantes:"
        printf '  - %s\n' "${missing_vars[@]}"
        return 1
    fi

    return 0
}

# Auto-validation au sourcing (optionnel, commenté pour éviter side-effects)
# validate_deploy_config

# ----------------------------------------------------------------------------
# Info
# ----------------------------------------------------------------------------

# Afficher configuration (debug)
print_deploy_config() {
    echo "📋 Configuration Déploiement:"
    echo "  DEPLOY_DIR_PROD: $DEPLOY_DIR_PROD"
    echo "  DOCKER_IMAGE: $DOCKER_IMAGE_FULL"
    echo "  HEALTH_CHECK_URL: $HEALTH_CHECK_URL_PROD"
    echo "  LOCK_FILE: $LOCK_FILE"
    echo "  VPS_HOST: $VPS_HOST"
}

export -f print_deploy_config
