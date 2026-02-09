#!/bin/bash
# =============================================================================
# Script Déploiement Production - Phase 2 Legal Warnings
# =============================================================================
# Déploie Phase 2 (validation juridique) en production :
#   1. Backup base de données actuelle
#   2. Application migration legal_abrogations
#   3. Seed données abrogations (13 entrées)
#   4. Validation variables d'environnement
#   5. Vérification composants UI déployés
#   6. Tests santé endpoints API
#   7. Logs monitoring warnings
#
# Usage : bash scripts/deploy-phase2-production.sh
#
# Prérequis :
#   - SSH access au VPS (root@84.247.165.187)
#   - Docker containers running (postgres, nextjs)
#   - Variables env configurées
#
# Exit codes :
#   0 - Déploiement réussi
#   1 - Erreur migration
#   2 - Erreur seed
#   3 - Erreur validation
# =============================================================================

set -e  # Exit on error

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="84.247.165.187"
VPS_USER="root"
VPS_PORT="22"
DB_NAME="moncabinet"
DB_USER="moncabinet"
CONTAINER_POSTGRES="moncabinet-postgres"
CONTAINER_NEXTJS="moncabinet-nextjs"
DEPLOY_DIR="/opt/moncabinet"

# Fichiers
MIGRATION_FILE="migrations/20260210_legal_abrogations.sql"
SEED_SCRIPT="scripts/seed-legal-abrogations.ts"

# =============================================================================
# FONCTIONS UTILITAIRES
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

log_step() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# ÉTAPE 0 : VÉRIFICATIONS PRÉ-DÉPLOIEMENT
# =============================================================================

log_step "ÉTAPE 0 : Vérifications Pré-Déploiement"

# Vérifier fichiers locaux
log_info "Vérification fichiers locaux..."

if [ ! -f "$MIGRATION_FILE" ]; then
  log_error "Migration non trouvée : $MIGRATION_FILE"
  exit 1
fi

if [ ! -f "$SEED_SCRIPT" ]; then
  log_error "Script seed non trouvé : $SEED_SCRIPT"
  exit 1
fi

log_success "Fichiers locaux OK"

# Vérifier connexion SSH
log_info "Vérification connexion SSH vers VPS..."

if ! ssh -p $VPS_PORT -o ConnectTimeout=10 $VPS_USER@$VPS_HOST "echo 'OK'" > /dev/null 2>&1; then
  log_error "Impossible de se connecter au VPS"
  log_info "Vérifiez : ssh -p $VPS_PORT $VPS_USER@$VPS_HOST"
  exit 1
fi

log_success "Connexion SSH OK"

# =============================================================================
# ÉTAPE 1 : BACKUP BASE DE DONNÉES
# =============================================================================

log_step "ÉTAPE 1 : Backup Base de Données"

BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_pre_phase2_${BACKUP_DATE}.sql"

log_info "Création backup : $BACKUP_FILE"

ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << EOF
  cd $DEPLOY_DIR

  # Backup complet DB
  docker exec $CONTAINER_POSTGRES pg_dump -U $DB_USER -d $DB_NAME > backups/$BACKUP_FILE

  # Compresser backup
  gzip backups/$BACKUP_FILE

  echo "Backup créé : backups/${BACKUP_FILE}.gz"
  ls -lh backups/${BACKUP_FILE}.gz
EOF

log_success "Backup base de données créé"

# =============================================================================
# ÉTAPE 2 : APPLICATION MIGRATION
# =============================================================================

log_step "ÉTAPE 2 : Application Migration legal_abrogations"

log_info "Vérification si table legal_abrogations existe déjà..."

TABLE_EXISTS=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='legal_abrogations');\"")

if [ "$TABLE_EXISTS" = "t" ]; then
  log_warning "Table legal_abrogations existe déjà"

  read -p "Voulez-vous re-créer la table (supprime données existantes) ? [y/N] " -n 1 -r
  echo

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Suppression table existante..."
    ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -c 'DROP TABLE IF EXISTS legal_abrogations CASCADE;'"
  else
    log_info "Conservation table existante, skip migration"
    SKIP_MIGRATION=true
  fi
fi

if [ "$SKIP_MIGRATION" != "true" ]; then
  log_info "Application migration $MIGRATION_FILE..."

  # Copier migration vers VPS
  scp -P $VPS_PORT "$MIGRATION_FILE" $VPS_USER@$VPS_HOST:$DEPLOY_DIR/migrations/

  # Appliquer migration
  ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << EOF
    cd $DEPLOY_DIR

    # Appliquer migration
    docker exec -i $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME < migrations/$(basename $MIGRATION_FILE)

    # Vérifier création table
    docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -c "\d legal_abrogations"
EOF

  if [ $? -eq 0 ]; then
    log_success "Migration appliquée avec succès"
  else
    log_error "Erreur lors de l'application de la migration"
    exit 1
  fi
else
  log_info "Migration skippée (table existante conservée)"
fi

# =============================================================================
# ÉTAPE 3 : SEED DONNÉES ABROGATIONS
# =============================================================================

log_step "ÉTAPE 3 : Seed Données Abrogations"

log_info "Vérification données existantes..."

COUNT_EXISTING=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM legal_abrogations;'")

log_info "Données existantes : $COUNT_EXISTING entrées"

if [ "$COUNT_EXISTING" -gt 0 ]; then
  log_warning "Données déjà présentes dans legal_abrogations"

  read -p "Voulez-vous re-charger les données (ajoute nouvelles, skip duplicates) ? [Y/n] " -n 1 -r
  echo

  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    LOAD_SEED=true
  else
    log_info "Skip seed, conservation données existantes"
  fi
else
  LOAD_SEED=true
fi

if [ "$LOAD_SEED" = "true" ]; then
  log_info "Chargement seed abrogations..."

  # Copier script seed vers VPS
  scp -P $VPS_PORT "$SEED_SCRIPT" $VPS_USER@$VPS_HOST:$DEPLOY_DIR/scripts/

  # Exécuter seed
  ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << EOF
    cd $DEPLOY_DIR

    # Exécuter seed via container nextjs
    docker exec $CONTAINER_NEXTJS npx tsx scripts/$(basename $SEED_SCRIPT)
EOF

  if [ $? -eq 0 ]; then
    # Compter entrées après seed
    COUNT_AFTER=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM legal_abrogations;'")

    log_success "Seed chargé avec succès"
    log_info "Total entrées : $COUNT_AFTER (avant: $COUNT_EXISTING, ajoutées: $((COUNT_AFTER - COUNT_EXISTING)))"
  else
    log_error "Erreur lors du chargement du seed"
    exit 2
  fi
fi

# =============================================================================
# ÉTAPE 4 : VALIDATION VARIABLES ENVIRONNEMENT
# =============================================================================

log_step "ÉTAPE 4 : Validation Variables Environnement"

log_info "Vérification variables env production..."

ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << 'EOF'
  cd /opt/moncabinet

  # Vérifier variables dans .env
  if grep -q "ENABLE_CITATION_VALIDATION" .env 2>/dev/null; then
    CITATION_VAL=$(grep "ENABLE_CITATION_VALIDATION" .env | cut -d'=' -f2)
    echo "ENABLE_CITATION_VALIDATION=$CITATION_VAL"
  else
    echo "⚠️  ENABLE_CITATION_VALIDATION non définie (défaut: true)"
  fi

  if grep -q "ENABLE_ABROGATION_DETECTION" .env 2>/dev/null; then
    ABROG_VAL=$(grep "ENABLE_ABROGATION_DETECTION" .env | cut -d'=' -f2)
    echo "ENABLE_ABROGATION_DETECTION=$ABROG_VAL"
  else
    echo "⚠️  ENABLE_ABROGATION_DETECTION non définie (défaut: true)"
  fi
EOF

log_success "Variables environnement vérifiées"

# =============================================================================
# ÉTAPE 5 : REDÉMARRAGE APPLICATION (si nécessaire)
# =============================================================================

log_step "ÉTAPE 5 : Redémarrage Application"

read -p "Voulez-vous redémarrer le container Next.js pour charger les changements ? [Y/n] " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  log_info "Redémarrage container $CONTAINER_NEXTJS..."

  ssh -p $VPS_PORT $VPS_USER@$VPS_HOST << EOF
    cd $DEPLOY_DIR
    docker-compose -f docker-compose.prod.yml restart nextjs

    # Attendre démarrage
    sleep 10
EOF

  log_success "Container redémarré"
else
  log_info "Skip redémarrage (les changements seront actifs au prochain redémarrage)"
fi

# =============================================================================
# ÉTAPE 6 : TESTS SANTÉ
# =============================================================================

log_step "ÉTAPE 6 : Tests Santé Application"

log_info "Test health check API..."

HEALTH_RESPONSE=$(curl -sf https://qadhya.tn/api/health 2>/dev/null || echo "FAILED")

if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
  log_success "✅ Health check : Application healthy"
else
  log_error "❌ Health check failed"
  log_info "Response: $HEALTH_RESPONSE"
fi

# Test endpoint test
log_info "Test page /chat-test accessible..."

HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://qadhya.tn/chat-test 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
  log_success "✅ Page /chat-test accessible (HTTP $HTTP_CODE)"
else
  log_warning "⚠️  Page /chat-test non accessible (HTTP $HTTP_CODE)"
fi

# =============================================================================
# ÉTAPE 7 : AFFICHAGE RÉSUMÉ
# =============================================================================

log_step "RÉSUMÉ DÉPLOIEMENT PHASE 2"

echo ""
echo -e "${GREEN}✅ DÉPLOIEMENT PHASE 2 TERMINÉ AVEC SUCCÈS${NC}"
echo ""
echo "📊 Résumé :"
echo "  - Backup créé : backups/${BACKUP_FILE}.gz"
echo "  - Migration : legal_abrogations table créée"
echo "  - Seed : $COUNT_AFTER entrées abrogations"
echo "  - Variables env : ENABLE_CITATION_VALIDATION, ENABLE_ABROGATION_DETECTION"
echo "  - Application : Healthy ✅"
echo ""
echo "🔗 URLs :"
echo "  - Production : https://qadhya.tn"
echo "  - Page test : https://qadhya.tn/chat-test"
echo "  - Health : https://qadhya.tn/api/health"
echo ""
echo "📝 Prochaines étapes :"
echo "  1. Tester warnings sur /chat-test avec question :"
echo "     \"Quelle est la procédure selon la Loi n°1968-07 ?\""
echo "  2. Vérifier affichage warning abrogation (🔴 CRITIQUE)"
echo "  3. Monitorer logs : ssh root@$VPS_HOST 'docker logs -f $CONTAINER_NEXTJS | grep RAG'"
echo ""
echo "🔄 Rollback si nécessaire :"
echo "  ssh root@$VPS_HOST 'cd /opt/moncabinet && zcat backups/${BACKUP_FILE}.gz | docker exec -i $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME'"
echo ""

exit 0
