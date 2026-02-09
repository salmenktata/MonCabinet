#!/bin/bash

###############################################################################
# Script de déploiement Phase 1 Quick Wins en Production
#
# Ce script automatise :
# 1. Tunnel SSH vers DB production
# 2. Application migration SQL (3 index DB)
# 3. Validation index créés
# 4. Instructions configuration env vars
# 5. Redémarrage container NextJS
#
# Usage: ./scripts/deploy-phase1-production.sh
#
# Prérequis:
# - Accès SSH au VPS (root@84.247.165.187)
# - PostgreSQL client installé (psql)
# - Fichier migrations/20260210_phase1_indexes.sql présent
###############################################################################

set -e  # Exit on error

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="84.247.165.187"
VPS_USER="root"
SSH_TUNNEL_PORT=5434
DB_USER="moncabinet"
DB_NAME="moncabinet"
MIGRATION_FILE="migrations/20260210_phase1_indexes.sql"

###############################################################################
# Fonctions utilitaires
###############################################################################

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

check_ssh_connection() {
    log_info "Vérification connexion SSH au VPS..."
    if ssh -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'SSH OK'" > /dev/null 2>&1; then
        log_success "Connexion SSH OK"
        return 0
    else
        log_error "Impossible de se connecter au VPS"
        return 1
    fi
}

check_tunnel_exists() {
    if lsof -Pi :$SSH_TUNNEL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

create_ssh_tunnel() {
    log_info "Création tunnel SSH vers PostgreSQL prod (port $SSH_TUNNEL_PORT)..."

    # Vérifier si tunnel existe déjà
    if check_tunnel_exists; then
        log_warning "Tunnel SSH déjà actif sur port $SSH_TUNNEL_PORT"
        return 0
    fi

    # Créer tunnel en arrière-plan
    ssh -f -N -L "$SSH_TUNNEL_PORT:localhost:5432" "$VPS_USER@$VPS_HOST"

    # Attendre que le tunnel soit prêt
    sleep 2

    if check_tunnel_exists; then
        log_success "Tunnel SSH créé avec succès"
        return 0
    else
        log_error "Échec création tunnel SSH"
        return 1
    fi
}

close_ssh_tunnel() {
    log_info "Fermeture tunnel SSH..."

    if check_tunnel_exists; then
        # Tuer le processus du tunnel
        lsof -ti:$SSH_TUNNEL_PORT | xargs kill -9 2>/dev/null || true
        sleep 1
        log_success "Tunnel SSH fermé"
    else
        log_info "Aucun tunnel SSH actif"
    fi
}

apply_migration() {
    log_info "Application migration SQL : $MIGRATION_FILE"

    if [ ! -f "$MIGRATION_FILE" ]; then
        log_error "Fichier migration introuvable : $MIGRATION_FILE"
        return 1
    fi

    # Appliquer migration via tunnel
    if psql -h localhost -p $SSH_TUNNEL_PORT -U $DB_USER -d $DB_NAME -f "$MIGRATION_FILE" > /tmp/migration_output.log 2>&1; then
        log_success "Migration appliquée avec succès"

        # Afficher output
        echo ""
        log_info "Output migration :"
        cat /tmp/migration_output.log
        echo ""

        return 0
    else
        log_error "Échec application migration"
        cat /tmp/migration_output.log
        return 1
    fi
}

validate_indexes() {
    log_info "Validation index créés..."

    local query="SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes WHERE indexrelname IN ('idx_kb_structured_metadata_knowledge_base_id', 'idx_kb_legal_relations_source_target', 'idx_knowledge_base_category_language');"

    local result=$(psql -h localhost -p $SSH_TUNNEL_PORT -U $DB_USER -d $DB_NAME -t -c "$query" 2>/dev/null)

    if [ -z "$result" ]; then
        log_error "Aucun index trouvé (la migration a peut-être échoué)"
        return 1
    fi

    echo ""
    log_success "Index créés :"
    echo "$result"
    echo ""

    # Compter nombre d'index
    local count=$(echo "$result" | grep -c "idx_kb_" || true)

    if [ "$count" -eq 3 ]; then
        log_success "3 index validés ✅"
        return 0
    else
        log_warning "Seulement $count/3 index trouvés"
        return 1
    fi
}

configure_env_vars() {
    log_info "Configuration variables environnement production..."

    echo ""
    echo "=========================================="
    echo "VARIABLES ENV À CONFIGURER SUR LE VPS"
    echo "=========================================="
    echo ""
    echo "Méthode 1 : Via fichier .env.prod"
    echo "-----------------------------------"
    echo "ssh $VPS_USER@$VPS_HOST"
    echo "cd /opt/moncabinet"
    echo "nano .env.prod  # ou docker-compose.prod.yml"
    echo ""
    echo "Ajouter ces lignes :"
    echo "  OLLAMA_EMBEDDING_CONCURRENCY=2"
    echo "  SEARCH_CACHE_THRESHOLD=0.75"
    echo ""
    echo "Méthode 2 : Via Portainer (recommandé)"
    echo "---------------------------------------"
    echo "1. Ouvrir https://portainer.qadhya.tn"
    echo "2. Containers → moncabinet-nextjs → Duplicate/Edit"
    echo "3. Advanced → Env variables"
    echo "4. Ajouter :"
    echo "     OLLAMA_EMBEDDING_CONCURRENCY=2"
    echo "     SEARCH_CACHE_THRESHOLD=0.75"
    echo "5. Deploy container"
    echo ""
    echo "=========================================="
    echo ""
}

restart_container() {
    log_info "Redémarrage container NextJS production..."

    if ssh "$VPS_USER@$VPS_HOST" "cd /opt/moncabinet && docker compose restart nextjs" 2>/dev/null; then
        log_success "Container redémarré avec succès"

        # Attendre que le container soit prêt
        sleep 5

        # Vérifier santé
        log_info "Vérification santé container..."
        ssh "$VPS_USER@$VPS_HOST" "docker ps --filter name=moncabinet-nextjs --format '{{.Status}}'"

        return 0
    else
        log_error "Échec redémarrage container"
        return 1
    fi
}

show_monitoring_commands() {
    echo ""
    echo "=========================================="
    echo "COMMANDES MONITORING POST-DÉPLOIEMENT"
    echo "=========================================="
    echo ""
    echo "1. Logs temps réel NextJS :"
    echo "   ssh $VPS_USER@$VPS_HOST 'docker logs -f moncabinet-nextjs | grep \"LLM-Fallback\\|Batch Metadata\"'"
    echo ""
    echo "2. Métriques Ollama (CPU/RAM) :"
    echo "   ssh $VPS_USER@$VPS_HOST 'journalctl -u ollama -f'"
    echo ""
    echo "3. Cache Redis (hit rate) :"
    echo "   ssh $VPS_USER@$VPS_HOST 'docker exec -it moncabinet-redis redis-cli INFO stats | grep keyspace'"
    echo ""
    echo "4. Index DB usage (après 24h) :"
    echo "   psql -h localhost -p $SSH_TUNNEL_PORT -U $DB_USER -d $DB_NAME -c \\"
    echo "     \"SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes WHERE indexrelname LIKE 'idx_kb_%' ORDER BY idx_scan DESC LIMIT 10;\""
    echo ""
    echo "5. Santé API :"
    echo "   curl -s https://qadhya.tn/api/health | jq"
    echo ""
    echo "=========================================="
    echo ""
}

###############################################################################
# MAIN
###############################################################################

main() {
    echo ""
    echo "=========================================="
    echo "🚀 DÉPLOIEMENT PHASE 1 - PRODUCTION"
    echo "=========================================="
    echo ""

    # Étape 1 : Vérifier connexion SSH
    if ! check_ssh_connection; then
        log_error "Impossible de continuer sans connexion SSH"
        exit 1
    fi

    # Étape 2 : Créer tunnel SSH
    if ! create_ssh_tunnel; then
        log_error "Impossible de créer le tunnel SSH"
        exit 1
    fi

    # Trap pour fermer le tunnel à la fin
    trap close_ssh_tunnel EXIT

    # Étape 3 : Appliquer migration SQL
    if ! apply_migration; then
        log_error "Échec application migration"
        exit 1
    fi

    # Étape 4 : Valider index créés
    if ! validate_indexes; then
        log_warning "Validation partielle des index"
    fi

    # Étape 5 : Instructions env vars
    configure_env_vars

    # Pause pour laisser l'utilisateur configurer les env vars
    echo ""
    read -p "Avez-vous configuré les variables env ? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Variables env non configurées - skip redémarrage container"
        log_info "Vous pourrez redémarrer manuellement plus tard avec :"
        echo "  ssh $VPS_USER@$VPS_HOST 'cd /opt/moncabinet && docker compose restart nextjs'"
    else
        # Étape 6 : Redémarrer container
        if ! restart_container; then
            log_error "Échec redémarrage container"
            exit 1
        fi
    fi

    # Étape 7 : Afficher commandes monitoring
    show_monitoring_commands

    echo ""
    log_success "=========================================="
    log_success "✅ DÉPLOIEMENT PHASE 1 TERMINÉ"
    log_success "=========================================="
    echo ""
    log_info "Prochaines étapes :"
    echo "  1. Vérifier logs container (voir commandes ci-dessus)"
    echo "  2. Tester API : https://qadhya.tn/api/health"
    echo "  3. Mesurer gains pendant 1 semaine (10-17 Feb 2026)"
    echo "  4. Créer rapport hebdomadaire avec métriques"
    echo ""
    log_info "Documentation complète : docs/PHASE1_PRESENTATION.md"
    echo ""
}

# Exécuter main si script appelé directement
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
