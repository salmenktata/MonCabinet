#!/bin/bash
#
# Script de vérification et diagnostic du verrou de déploiement
#
# Usage:
#   ./check-deploy-lock.sh                  # Afficher l'état du verrou
#   ./check-deploy-lock.sh --force-unlock   # Forcer la libération (DANGER)
#

set -euo pipefail

# Configuration
LOCKFILE="/var/lock/qadhya-deploy.lock"
LOCK_INFO_FILE="/var/lock/qadhya-deploy.info"

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonctions utilitaires
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

log_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Fonction pour forcer la libération du verrou
force_unlock() {
    log_header "FORCER LA LIBÉRATION DU VERROU (DANGER)"

    if [ ! -f "$LOCKFILE" ]; then
        log_success "Aucun verrou à libérer"
        exit 0
    fi

    log_warning "Cette opération peut causer des problèmes si un déploiement est en cours !"
    log_warning "Utilisez cette fonction UNIQUEMENT en cas de deadlock avéré."

    # Demander confirmation en mode interactif
    if [ -t 0 ]; then
        echo ""
        read -p "Êtes-vous sûr de vouloir forcer la libération ? (tapez 'yes' pour confirmer) : " confirmation

        if [ "$confirmation" != "yes" ]; then
            log_info "Opération annulée"
            exit 0
        fi
    fi

    # Sauvegarder les infos avant suppression
    if [ -f "$LOCK_INFO_FILE" ]; then
        log_info "Sauvegarde des informations du verrou forcé:"
        cat "$LOCK_INFO_FILE"
        echo ""
    fi

    # Supprimer le verrou
    rm -f "$LOCKFILE"
    rm -f "$LOCK_INFO_FILE"

    log_success "Verrou forcé et libéré"
    log_warning "Si un déploiement était en cours, il peut maintenant être dans un état incohérent"
    log_info "Vérifiez l'état de l'application: docker ps, docker logs qadhya-nextjs"

    exit 0
}

# Fonction pour vérifier si le verrou est pris
check_lock_status() {
    log_header "ÉTAT DU VERROU DE DÉPLOIEMENT"

    # Vérifier si le fichier de verrou existe
    if [ ! -f "$LOCKFILE" ]; then
        log_success "Aucun déploiement en cours (verrou libre)"
        return 0
    fi

    # Tenter d'acquérir le verrou sans attendre
    exec 200>"$LOCKFILE"
    if flock -n -x 200; then
        log_success "Verrou libre (fichier existe mais non verrouillé)"

        # Nettoyer les fichiers orphelins
        rm -f "$LOCKFILE"
        rm -f "$LOCK_INFO_FILE"

        log_info "Fichiers de verrou orphelins nettoyés"
        return 0
    fi

    # Le verrou est pris
    log_warning "Déploiement en cours détecté"
    echo ""

    # Afficher les informations du verrou si disponibles
    if [ -f "$LOCK_INFO_FILE" ]; then
        log_info "Informations du déploiement:"
        echo ""

        # Parser et afficher les infos de manière formatée
        while IFS=': ' read -r key value; do
            echo -e "  ${CYAN}${key}:${NC} ${value}"
        done < "$LOCK_INFO_FILE"

        echo ""

        # Calculer la durée
        if grep -q "Timestamp:" "$LOCK_INFO_FILE"; then
            lock_timestamp=$(grep "Timestamp:" "$LOCK_INFO_FILE" | cut -d' ' -f2)
            current_timestamp=$(date +%s)
            duration=$((current_timestamp - lock_timestamp))

            minutes=$((duration / 60))
            seconds=$((duration % 60))

            echo -e "  ${CYAN}Durée:${NC} ${minutes}m ${seconds}s"
            echo ""

            # Avertir si le déploiement dure trop longtemps
            if [ $duration -gt 1200 ]; then  # 20 minutes
                log_error "Le déploiement dure depuis plus de 20 minutes !"
                log_warning "Cela peut indiquer un problème (deadlock, process bloqué, etc.)"
                log_info "Considérez forcer la libération: $0 --force-unlock"
            elif [ $duration -gt 600 ]; then  # 10 minutes
                log_warning "Le déploiement dure depuis plus de 10 minutes"
                log_info "Vérifiez les logs: docker logs qadhya-nextjs"
            fi
        fi

        # Vérifier si le process est toujours actif
        if grep -q "PID:" "$LOCK_INFO_FILE"; then
            lock_pid=$(grep "PID:" "$LOCK_INFO_FILE" | awk '{print $2}')

            if ps -p "$lock_pid" > /dev/null 2>&1; then
                log_success "Process actif (PID $lock_pid)"

                # Afficher la commande en cours si possible
                if [ -f "/proc/$lock_pid/cmdline" ]; then
                    cmdline=$(tr '\0' ' ' < "/proc/$lock_pid/cmdline")
                    echo -e "  ${CYAN}Commande:${NC} ${cmdline}"
                fi
            else
                log_error "Process mort (PID $lock_pid n'existe plus)"
                log_warning "Verrou orphelin détecté - considérez forcer la libération"
                log_info "Commande: $0 --force-unlock"
            fi
        fi
    else
        log_warning "Fichier d'informations du verrou introuvable"
        log_info "Le verrou est pris mais sans métadonnées"
    fi

    return 1
}

# Fonction pour afficher l'aide
show_help() {
    cat <<EOF
Usage: $0 [OPTIONS]

Vérification et diagnostic du verrou de déploiement Qadhya.

OPTIONS:
    (aucune)         Afficher l'état du verrou
    --force-unlock   Forcer la libération du verrou (DANGER)
    --help           Afficher cette aide

EXEMPLES:
    # Vérifier l'état du verrou
    $0

    # Forcer la libération en cas de deadlock
    $0 --force-unlock

FICHIERS:
    $LOCKFILE       Fichier de verrou flock
    $LOCK_INFO_FILE Métadonnées du déploiement en cours

NOTES:
    - Le verrou se libère automatiquement quand le déploiement se termine
    - Utilisez --force-unlock UNIQUEMENT en cas de deadlock avéré
    - Timeout automatique du verrou: 30 minutes

EOF
}

# Parser les arguments
case "${1:-}" in
    --force-unlock)
        force_unlock
        ;;
    --help|-h)
        show_help
        exit 0
        ;;
    "")
        check_lock_status
        exit $?
        ;;
    *)
        log_error "Option inconnue: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
