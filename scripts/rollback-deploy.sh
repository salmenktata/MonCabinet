#!/bin/bash
# =============================================================================
# Script de Rollback - Déploiement Production
# =============================================================================
# Restaure la version précédente de l'application en cas d'échec de déploiement.
#
# Fonctionnement :
#   1. Lit l'image tag sauvegardée dans .last-image-tag
#   2. Redéploie cette image via docker-compose
#   3. Vérifie le health check de l'application (3 tentatives)
#   4. Nettoie les ressources orphelines
#
# Exit codes :
#   0 - Rollback réussi, application healthy
#   1 - Erreur : fichier .last-image-tag manquant
#   2 - Erreur : échec de redéploiement
#   3 - Erreur : health check failed après rollback
#
# Usage : bash scripts/rollback-deploy.sh
# IMPORTANT : Ce script doit être exécuté depuis /opt/moncabinet sur le VPS
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_DIR="/opt/moncabinet"
LAST_IMAGE_FILE=".last-image-tag"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_CHECK_URL="https://qadhya.tn/api/health"
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_DELAY=10

# =============================================================================
# FONCTIONS
# =============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
  log_info "Vérification des prérequis..."

  # Vérifier que nous sommes dans le bon répertoire
  if [ ! -d "$DEPLOY_DIR" ]; then
    log_error "Répertoire $DEPLOY_DIR non trouvé"
    exit 2
  fi

  cd "$DEPLOY_DIR"

  # Vérifier que le fichier de backup existe
  if [ ! -f "$LAST_IMAGE_FILE" ]; then
    log_error "Fichier $LAST_IMAGE_FILE non trouvé - impossible de rollback"
    log_warning "Aucune version précédente sauvegardée"
    exit 1
  fi

  # Vérifier que docker-compose est disponible
  if ! command -v docker-compose &> /dev/null; then
    log_error "docker-compose n'est pas installé"
    exit 2
  fi

  log_success "Prérequis vérifiés"
}

read_last_image() {
  LAST_IMAGE=$(cat "$LAST_IMAGE_FILE")

  if [ -z "$LAST_IMAGE" ]; then
    log_error "Fichier $LAST_IMAGE_FILE vide"
    exit 1
  fi

  log_info "Image précédente à restaurer : $LAST_IMAGE"
}

execute_rollback() {
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "🔄 Début du rollback vers $LAST_IMAGE"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Sauvegarder l'image actuelle avant rollback (au cas où)
  log_info "Sauvegarde de l'image actuelle..."
  docker inspect moncabinet-nextjs --format='{{.Config.Image}}' > .rollback-backup-image 2>/dev/null || true

  # Pull de l'image précédente
  log_info "Pull de l'image précédente..."
  if ! docker pull "$LAST_IMAGE"; then
    log_error "Échec du pull de l'image $LAST_IMAGE"
    exit 2
  fi

  # Mettre à jour docker-compose.prod.yml
  log_info "Mise à jour de $COMPOSE_FILE..."
  sed -i.bak "s|image: .*moncabinet:.*|image: $LAST_IMAGE|g" "$COMPOSE_FILE"

  # Redéployer les containers
  log_info "Redéploiement des containers..."
  if ! docker-compose -f "$COMPOSE_FILE" up -d; then
    log_error "Échec du redéploiement"

    # Restaurer le backup de docker-compose.yml
    if [ -f "$COMPOSE_FILE.bak" ]; then
      log_warning "Restauration de $COMPOSE_FILE.bak"
      mv "$COMPOSE_FILE.bak" "$COMPOSE_FILE"
    fi

    exit 2
  fi

  # Attendre que les containers démarrent
  log_info "Attente du démarrage des containers (5s)..."
  sleep 5

  log_success "Rollback exécuté avec succès"
}

health_check() {
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "🏥 Vérification du health check"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    log_info "Tentative $i/$HEALTH_CHECK_RETRIES..."

    sleep $HEALTH_CHECK_DELAY

    RESPONSE=$(curl -sf "$HEALTH_CHECK_URL" 2>/dev/null || echo "FAILED")

    if echo "$RESPONSE" | grep -q '"status":"healthy"'; then
      log_success "✅ Health check réussi !"
      return 0
    fi

    log_warning "Health check échoué, nouvelle tentative..."
  done

  log_error "❌ Health check échoué après $HEALTH_CHECK_RETRIES tentatives"
  log_error "L'application ne répond pas correctement"

  # Afficher les logs du container
  log_info "Derniers logs du container :"
  docker logs --tail 50 moncabinet-nextjs || true

  return 1
}

cleanup() {
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "🧹 Nettoyage"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Nettoyer les containers orphelins
  log_info "Nettoyage des containers orphelins..."
  docker-compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

  # Nettoyer les images non utilisées (keep last 3)
  log_info "Nettoyage des images non utilisées..."
  docker image prune -af --filter "until=72h" 2>/dev/null || true

  # Supprimer le backup si rollback réussi
  if [ -f "$COMPOSE_FILE.bak" ]; then
    rm -f "$COMPOSE_FILE.bak"
  fi

  log_success "Nettoyage terminé"
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
echo -e "${RED}  ⏮️  ROLLBACK DÉPLOIEMENT PRODUCTION${NC}"
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Étape 1 : Vérifier les prérequis
check_prerequisites

# Étape 2 : Lire l'image précédente
read_last_image

# Étape 3 : Exécuter le rollback
execute_rollback

# Étape 4 : Vérifier le health check
if ! health_check; then
  log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_error "❌ ROLLBACK ÉCHOUÉ - APPLICATION NON HEALTHY"
  log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 3
fi

# Étape 5 : Nettoyage
cleanup

# Succès
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ ROLLBACK RÉUSSI${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Application restaurée à la version : $LAST_IMAGE${NC}"
echo -e "${GREEN}URL : https://qadhya.tn${NC}"
echo ""

exit 0
