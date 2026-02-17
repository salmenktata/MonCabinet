#!/bin/bash
# ============================================================================
# SCRIPT DÉPLOIEMENT UNIFIÉ - QADHYA
# ============================================================================
# Script unique réutilisable pour déploiement dev local ET production
#
# Usage:
#   ./scripts/deploy.sh                    # Auto-detect env, Docker deploy
#   ./scripts/deploy.sh --env=prod        # Production explicit
#   ./scripts/deploy.sh --env=dev         # Dev local explicit
#   ./scripts/deploy.sh --rollback        # Rollback version précédente
#   ./scripts/deploy.sh --dry-run         # Simulation sans modifications
#   ./scripts/deploy.sh --skip-build      # Skip build Next.js/Docker
#   ./scripts/deploy.sh --force           # Force deploy sans confirmations
#   ./scripts/deploy.sh --verbose         # Logs détaillés (DEBUG=true)
#
# Exemples:
#   # Dev local avec rebuild
#   ./scripts/deploy.sh --env=dev
#
#   # Production sans rebuild (utilise image GHCR)
#   ./scripts/deploy.sh --env=prod --skip-build
#
#   # Rollback production
#   ./scripts/deploy.sh --env=prod --rollback
#
#   # Dry-run simulation
#   ./scripts/deploy.sh --dry-run --verbose
#
# ============================================================================

set -euo pipefail

# ----------------------------------------------------------------------------
# Setup - Source libraries
# ----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/deploy-config.sh"
source "${SCRIPT_DIR}/lib/deploy-functions.sh"

# ----------------------------------------------------------------------------
# Variables Globales
# ----------------------------------------------------------------------------

# Valeurs par défaut
DEPLOY_ENV="prod"           # prod | dev
SKIP_BUILD=false
SKIP_VALIDATION=false
SKIP_BACKUP=false
DRY_RUN=false
FORCE=false
ROLLBACK=false
DEBUG=false

# État déploiement
DEPLOYMENT_SUCCESS=false
DEPLOYMENT_START_TIME=""

# ----------------------------------------------------------------------------
# Section 1: Configuration & Parsing Arguments
# ----------------------------------------------------------------------------

parse_arguments() {
    log_section "PARSING ARGUMENTS"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --env=*)
                DEPLOY_ENV="${1#*=}"
                log_info "Environnement: $DEPLOY_ENV"
                ;;
            --skip-build)
                SKIP_BUILD=true
                log_info "Skip build activé"
                ;;
            --skip-validation)
                SKIP_VALIDATION=true
                log_warning "Skip validation activé (non recommandé)"
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                log_warning "Skip backup activé (non recommandé)"
                ;;
            --dry-run)
                DRY_RUN=true
                log_warning "Mode DRY-RUN activé (simulation uniquement)"
                ;;
            --force)
                FORCE=true
                log_warning "Mode FORCE activé"
                ;;
            --rollback)
                ROLLBACK=true
                log_warning "Mode ROLLBACK activé"
                ;;
            --verbose|-v)
                DEBUG=true
                export DEBUG=true
                log_info "Mode VERBOSE activé"
                ;;
            --help|-h)
                print_help
                exit 0
                ;;
            *)
                log_error "Argument inconnu: $1"
                print_help
                exit 1
                ;;
        esac
        shift
    done

    # Validation environnement
    if [[ ! "$DEPLOY_ENV" =~ ^(prod|dev)$ ]]; then
        log_error "Environnement invalide: $DEPLOY_ENV (attendu: prod | dev)"
        exit 1
    fi

    log_success "Arguments parsés avec succès"
}

print_help() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --env=ENV           Environnement cible (prod | dev) [défaut: prod]
  --skip-build        Skip build Next.js/Docker
  --skip-validation   Skip validation config (non recommandé)
  --skip-backup       Skip backup container (non recommandé)
  --dry-run           Simulation sans modifications
  --force             Force déploiement sans confirmations
  --rollback          Rollback version précédente
  --verbose, -v       Logs détaillés (DEBUG)
  --help, -h          Afficher cette aide

Exemples:
  $0                       # Déploiement production (défaut)
  $0 --env=dev            # Déploiement dev local
  $0 --rollback           # Rollback production
  $0 --dry-run --verbose  # Simulation avec logs détaillés

Documentation: docs/DEPLOYMENT.md
EOF
}

validate_environment_selection() {
    log_info "Validation sélection environnement..."

    # Vérifier .env existe
    local env_file=".env"
    if [ "$DEPLOY_ENV" = "prod" ]; then
        # En prod, l'env principal est dans /opt/moncabinet/.env
        # (contient DB_NAME, DB_USER, DB_PASSWORD, NEXTAUTH_SECRET, etc.)
        env_file="/opt/moncabinet/.env"
    fi

    if [ ! -f "$env_file" ]; then
        log_error "Fichier environnement introuvable: $env_file"
        log_info "Créer depuis template: cp .env.template $env_file"
        exit 1
    fi

    log_success "Environnement validé: $DEPLOY_ENV ($env_file)"
}

# ----------------------------------------------------------------------------
# Section 2: Pre-Flight Checks
# ----------------------------------------------------------------------------

pre_flight_checks() {
    log_section "PRE-FLIGHT CHECKS"

    # 1. Acquérir verrou déploiement
    if [ "$DRY_RUN" = false ]; then
        acquire_deployment_lock || {
            log_error "Impossible d'acquérir le verrou"
            log_info "Un autre déploiement est peut-être en cours"
            exit 1
        }
    else
        log_warning "DRY-RUN: Skip acquisition verrou"
    fi

    # 2. Validation configuration
    if [ "$SKIP_VALIDATION" = false ]; then
        local env_file=".env"
        [ "$DEPLOY_ENV" = "prod" ] && env_file="/opt/moncabinet/.env"

        validate_environment_config "$env_file" || {
            log_error "Configuration environnement invalide"
            exit 1
        }

        validate_rag_config "$env_file" || {
            log_error "Configuration RAG invalide"
            exit 1
        }
    else
        log_warning "Skip validation configuration"
    fi

    # 3. Vérifier Docker disponible
    if ! command -v docker &> /dev/null; then
        log_error "Docker non installé ou non disponible"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon non accessible"
        exit 1
    fi

    log_success "Docker disponible (version: $(docker --version | cut -d' ' -f3))"

    # 4. Vérifier Git repository (optionnel)
    if git rev-parse --git-dir &> /dev/null; then
        local git_branch=$(git branch --show-current)
        local git_sha=$(git rev-parse --short HEAD)
        log_info "Git: branche=$git_branch, SHA=$git_sha"

        # Warning si pas sur main en prod
        if [ "$DEPLOY_ENV" = "prod" ] && [ "$git_branch" != "main" ]; then
            log_warning "Déploiement production depuis branche '$git_branch' (attendu: main)"

            if [ "$FORCE" = false ]; then
                read -p "Continuer quand même? (y/N) " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    log_info "Déploiement annulé par utilisateur"
                    exit 0
                fi
            fi
        fi
    fi

    # 5. Vérifier connexion VPS (prod uniquement)
    if [ "$DEPLOY_ENV" = "prod" ]; then
        log_info "Test connexion VPS: $VPS_HOST..."

        if ssh $VPS_SSH_OPTS "$VPS_USER@$VPS_HOST" "echo 'OK'" &> /dev/null; then
            log_success "Connexion VPS OK"
        else
            log_error "Impossible de se connecter au VPS"
            exit 1
        fi
    fi

    log_success "Pre-flight checks réussis"
}

# ----------------------------------------------------------------------------
# Section 3: Backup
# ----------------------------------------------------------------------------

backup_current_state() {
    if [ "$SKIP_BACKUP" = true ]; then
        log_warning "Skip backup (--skip-backup activé)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Skip backup"
        return 0
    fi

    log_section "BACKUP ÉTAT ACTUEL"

    if [ "$DEPLOY_ENV" = "prod" ]; then
        backup_container_prod || {
            log_error "Échec backup production"

            if [ "$FORCE" = false ]; then
                log_error "Arrêt déploiement (utiliser --force pour continuer)"
                exit 1
            else
                log_warning "Force mode: Continue malgré échec backup"
            fi
        }
    else
        backup_container_local || {
            log_warning "Échec backup local (continue)"
        }
    fi

    log_success "Backup terminé"
}

# ----------------------------------------------------------------------------
# Section 4: Deployment
# ----------------------------------------------------------------------------

execute_deployment() {
    log_section "DÉPLOIEMENT $DEPLOY_ENV"

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Simulation déploiement"
        log_info "  - Build image Docker"
        log_info "  - Push GHCR (si prod)"
        log_info "  - Docker compose up"
        log_info "  - Health check"
        log_success "DRY-RUN: Déploiement simulé avec succès"
        return 0
    fi

    # Déploiement Docker (uniquement)
    execute_docker_deployment
}

execute_docker_deployment() {
    log_info "Déploiement via Docker Compose..."

    local deploy_dir=$(get_deploy_dir "$DEPLOY_ENV")
    log_info "Deploy dir: $deploy_dir"

    # Build image (si pas skip)
    if [ "$SKIP_BUILD" = false ]; then
        log_info "Build image Docker..."

        if [ "$DEPLOY_ENV" = "prod" ]; then
            # Production: Build + Push GHCR
            log_info "Build + Push image GHCR: $DOCKER_IMAGE_FULL"

            docker buildx build \
                --platform linux/amd64 \
                --build-arg BUILD_DATE="$BUILD_DATE" \
                --build-arg GIT_SHA="$GIT_SHA" \
                --tag "$DOCKER_IMAGE_FULL" \
                --push \
                .

            if [ $? -ne 0 ]; then
                log_error "Échec build/push Docker image"
                return 1
            fi

            log_success "Image Docker buildée et pushée"
        else
            # Dev: Build local
            log_info "Build image locale"

            docker compose build

            if [ $? -ne 0 ]; then
                log_error "Échec build Docker local"
                return 1
            fi

            log_success "Image Docker buildée localement"
        fi
    else
        log_warning "Skip build (--skip-build activé)"

        if [ "$DEPLOY_ENV" = "prod" ]; then
            log_info "Pull image GHCR: $DOCKER_IMAGE_FULL"
            docker pull "$DOCKER_IMAGE_FULL" || {
                log_error "Échec pull image GHCR"
                return 1
            }
        fi
    fi

    # Deploy via Docker Compose
    if [ "$DEPLOY_ENV" = "prod" ]; then
        # Production: SSH + docker compose up
        log_info "Déploiement sur VPS via SSH..."

        ssh $VPS_SSH_OPTS "$VPS_USER@$VPS_HOST" <<EOF
cd $deploy_dir
docker compose pull
docker compose up -d --force-recreate --no-deps nextjs
EOF

        if [ $? -ne 0 ]; then
            log_error "Échec déploiement VPS"
            return 1
        fi

        log_success "Déploiement VPS réussi"
    else
        # Dev local: docker compose up
        log_info "Déploiement local..."

        cd "$deploy_dir"
        docker compose up -d --force-recreate --no-deps nextjs

        if [ $? -ne 0 ]; then
            log_error "Échec déploiement local"
            return 1
        fi

        log_success "Déploiement local réussi"
    fi

    return 0
}

# ----------------------------------------------------------------------------
# Section 5: Health Check
# ----------------------------------------------------------------------------

post_deployment_health_check() {
    log_section "HEALTH CHECK POST-DÉPLOIEMENT"

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Skip health check"
        return 0
    fi

    local health_url=$(get_health_check_url "$DEPLOY_ENV")

    if health_check_with_retry "$health_url"; then
        log_success "Application opérationnelle"
        DEPLOYMENT_SUCCESS=true
        return 0
    else
        log_error "Health check échoué"
        return 1
    fi
}

# ----------------------------------------------------------------------------
# Section 6: Rollback
# ----------------------------------------------------------------------------

execute_rollback() {
    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Skip rollback"
        return 0
    fi

    log_warning "Déploiement échoué - Rollback automatique..."

    if rollback_to_previous_version "$DEPLOY_ENV"; then
        log_success "Rollback réussi"
        return 0
    else
        log_error "Rollback échoué - Intervention manuelle requise"
        return 1
    fi
}

# ----------------------------------------------------------------------------
# Section 7: Main Orchestration
# ----------------------------------------------------------------------------

main() {
    # Trap cleanup
    trap cleanup_on_exit EXIT
    trap cleanup_on_error ERR

    # Timestamp début
    DEPLOYMENT_START_TIME=$(date +%s)

    # Banner
    log_section "DÉPLOIEMENT QADHYA - SCRIPT UNIFIÉ"
    log_info "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log_info "User: ${USER:-unknown}"
    log_info "Host: $(hostname)"

    # 1. Parse arguments
    parse_arguments "$@"
    validate_environment_selection

    # 2. Mode rollback direct
    if [ "$ROLLBACK" = true ]; then
        log_section "MODE ROLLBACK MANUEL"
        rollback_to_previous_version "$DEPLOY_ENV"
        exit $?
    fi

    # 3. Pre-flight checks
    pre_flight_checks

    # 4. Backup
    backup_current_state

    # 5. Deployment
    if execute_deployment; then
        log_success "Déploiement réussi"
    else
        log_error "Déploiement échoué"

        # Rollback automatique si échec
        if [ "$FORCE" = false ]; then
            execute_rollback
        fi

        exit 1
    fi

    # 6. Health check
    if post_deployment_health_check; then
        DEPLOYMENT_SUCCESS=true
    else
        log_error "Health check échoué"

        # Rollback automatique
        if [ "$FORCE" = false ]; then
            execute_rollback
        fi

        exit 1
    fi

    # Rapport final
    local deployment_duration=$(($(date +%s) - DEPLOYMENT_START_TIME))
    log_section "DÉPLOIEMENT TERMINÉ"
    log_success "Durée: ${deployment_duration}s"
    log_success "Environnement: $DEPLOY_ENV"
    log_success "Status: SUCCESS ✅"

    if [ "$DEPLOY_ENV" = "prod" ]; then
        log_info "Application: https://qadhya.tn"
        log_info "Dashboard: https://qadhya.tn/super-admin/monitoring"
    else
        log_info "Application: http://localhost:3000"
    fi
}

# Exécuter
main "$@"
