#!/bin/bash
#
# Script de déploiement avec protection par verrou (flock)
# Garantit qu'un seul déploiement peut s'exécuter à la fois sur le VPS
#
# Usage:
#   ./deploy-with-lock.sh <commande_a_executer>
#
# Exemple:
#   ./deploy-with-lock.sh docker compose up -d nextjs
#   ./deploy-with-lock.sh bash scripts/lightning-deploy.sh
#

set -euo pipefail

# Configuration
LOCKFILE="/var/lock/qadhya-deploy.lock"
TIMEOUT=1800  # 30 minutes (en secondes)
LOCK_INFO_FILE="/var/lock/qadhya-deploy.info"

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Vérifier qu'une commande est fournie
if [ $# -eq 0 ]; then
    log_error "Usage: $0 <commande_a_executer>"
    log_error "Exemple: $0 docker compose up -d nextjs"
    exit 1
fi

# Créer le répertoire lock si nécessaire
mkdir -p "$(dirname "$LOCKFILE")"

log_info "Tentative d'acquisition du verrou de déploiement..."
log_info "Timeout: ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"

# Tenter d'acquérir le verrou avec timeout
exec 200>"$LOCKFILE"

if ! flock -w "$TIMEOUT" -x 200; then
    log_error "Impossible d'acquérir le verrou de déploiement (timeout ${TIMEOUT}s)"
    log_error "Un autre déploiement est en cours."

    # Afficher info sur le verrou actuel si disponible
    if [ -f "$LOCK_INFO_FILE" ]; then
        log_info "Informations sur le déploiement en cours:"
        cat "$LOCK_INFO_FILE"
    fi

    log_warning "Pour vérifier l'état du verrou: bash scripts/check-deploy-lock.sh"
    log_warning "Pour forcer la libération (DANGER): bash scripts/check-deploy-lock.sh --force-unlock"

    exit 1
fi

log_success "Verrou acquis avec succès"

# Enregistrer les informations du verrou
cat > "$LOCK_INFO_FILE" <<EOF
PID: $$
User: $(whoami)
Started: $(date '+%Y-%m-%d %H:%M:%S %Z')
Timestamp: $(date +%s)
Command: $@
Hostname: $(hostname)
EOF

log_info "Informations du verrou enregistrées dans $LOCK_INFO_FILE"

# Fonction de nettoyage appelée à la sortie
cleanup() {
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "Déploiement terminé avec succès"
    else
        log_error "Déploiement terminé avec erreur (code: $exit_code)"
    fi

    # Nettoyer le fichier d'info
    rm -f "$LOCK_INFO_FILE"

    log_info "Verrou libéré"

    # Le verrou flock se libère automatiquement
    exit $exit_code
}

trap cleanup EXIT

# Afficher la commande qui va être exécutée
log_info "Exécution de la commande: $@"
echo ""

# Exécuter la commande passée en argument
"$@"
EXIT_CODE=$?

# cleanup() sera appelé automatiquement via trap EXIT
exit $EXIT_CODE
