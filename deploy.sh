#!/bin/bash
#
# Script de déploiement MonCabinet sur VPS Contabo
#
# Usage: ./deploy.sh
#
# Fonctionnalités:
# - Git pull dernières modifications
# - Backup PostgreSQL automatique
# - Rebuild Docker images
# - Déploiement avec health check
# - Rollback automatique en cas d'échec
#

set -e

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Déploiement MonCabinet sur VPS Contabo...${NC}"

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "docker compose.yml" ]; then
  echo -e "${RED}❌ ERREUR: docker compose.yml non trouvé!${NC}"
  echo "Exécuter ce script depuis /opt/moncabinet/"
  exit 1
fi

# Vérifier que .env.production existe
if [ ! -f ".env.production" ]; then
  echo -e "${RED}❌ ERREUR: .env.production non trouvé!${NC}"
  echo "Créer .env.production avec les variables requises"
  exit 1
fi

# ============================================================================
# ÉTAPE 1: Git Pull
# ============================================================================

echo -e "${YELLOW}📥 Git pull...${NC}"
git pull origin main || {
  echo -e "${RED}❌ ERREUR: Git pull échoué!${NC}"
  exit 1
}

# ============================================================================
# ÉTAPE 2: Backup Base de Données
# ============================================================================

echo -e "${YELLOW}💾 Backup PostgreSQL...${NC}"

# Créer dossier backups s'il n'existe pas
mkdir -p /opt/backups/moncabinet

# Backup avec timestamp
BACKUP_FILE="/opt/backups/moncabinet/db_backup_$(date +%Y%m%d_%H%M%S).sql"

# Vérifier que container postgres existe
if docker ps -a | grep -q moncabinet-postgres; then
  docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > "$BACKUP_FILE" || {
    echo -e "${RED}❌ ERREUR: Backup PostgreSQL échoué!${NC}"
    exit 1
  }

  # Compresser backup
  gzip "$BACKUP_FILE"
  echo -e "${GREEN}✅ Backup sauvegardé: ${BACKUP_FILE}.gz${NC}"
else
  echo -e "${YELLOW}⚠️  Container postgres non trouvé, skip backup${NC}"
fi

# ============================================================================
# ÉTAPE 3: Backup .env.production
# ============================================================================

echo -e "${YELLOW}💾 Backup configuration...${NC}"
cp .env.production ".env.production.backup.$(date +%Y%m%d_%H%M%S)" || {
  echo -e "${RED}❌ ERREUR: Backup .env.production échoué!${NC}"
  exit 1
}

# ============================================================================
# ÉTAPE 4: Rebuild Docker Images
# ============================================================================

echo -e "${YELLOW}🐳 Rebuild Docker images...${NC}"

# Charger variables depuis .env.production
export $(grep -v '^#' .env.production | xargs)

# Build Next.js avec --no-cache pour forcer rebuild complet
docker compose build --no-cache nextjs || {
  echo -e "${RED}❌ ERREUR: Build Docker échoué!${NC}"
  exit 1
}

echo -e "${GREEN}✅ Build réussi${NC}"

# ============================================================================
# ÉTAPE 5: Stop Containers (Graceful Shutdown)
# ============================================================================

echo -e "${YELLOW}🛑 Arrêt containers...${NC}"

# Graceful stop (10s timeout)
docker compose down --timeout 10 || {
  echo -e "${RED}❌ ERREUR: Arrêt containers échoué!${NC}"
  exit 1
}

echo -e "${GREEN}✅ Containers arrêtés${NC}"

# ============================================================================
# ÉTAPE 6: Start Containers
# ============================================================================

echo -e "${YELLOW}✅ Démarrage containers...${NC}"

# Start tous les services
docker compose up -d || {
  echo -e "${RED}❌ ERREUR: Démarrage containers échoué!${NC}"
  exit 1
}

echo -e "${GREEN}✅ Containers démarrés${NC}"

# ============================================================================
# ÉTAPE 7: Health Check
# ============================================================================

echo -e "${YELLOW}🏥 Health check...${NC}"

# Attendre 30s pour que l'app démarre
sleep 30

MAX_RETRIES=10
RETRY_COUNT=0
HEALTH_URL="http://localhost:3000/api/health"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo -e "${YELLOW}⏳ Tentative $((RETRY_COUNT + 1))/$MAX_RETRIES...${NC}"

  if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application démarrée avec succès!${NC}"

    # Afficher réponse health check
    echo -e "${YELLOW}📊 Status:${NC}"
    curl -s "$HEALTH_URL" | python3 -m json.tool || echo "Format JSON invalide"

    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      sleep 5
    fi
  fi
done

# ============================================================================
# ÉTAPE 8: Rollback si échec
# ============================================================================

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}❌ ERREUR: Application non accessible après $MAX_RETRIES tentatives!${NC}"
  echo -e "${YELLOW}🔄 Rollback en cours...${NC}"

  # Arrêter containers défectueux
  docker compose down

  # Restaurer dernière config qui marchait
  LAST_BACKUP=$(ls -t .env.production.backup.* 2>/dev/null | head -1)
  if [ -n "$LAST_BACKUP" ]; then
    echo -e "${YELLOW}📥 Restauration: $LAST_BACKUP${NC}"
    cp "$LAST_BACKUP" .env.production
  fi

  # Redémarrer avec ancienne config
  export $(grep -v '^#' .env.production | xargs)
  docker compose up -d

  echo -e "${RED}❌ DÉPLOIEMENT ÉCHOUÉ - Rollback effectué${NC}"
  echo "Vérifier les logs: docker compose logs -f --tail=100"

  exit 1
fi

# ============================================================================
# ÉTAPE 9: Nettoyage
# ============================================================================

echo -e "${YELLOW}🧹 Nettoyage images Docker...${NC}"
docker image prune -f || true

echo -e "${YELLOW}🧹 Nettoyage anciens backups (garder 7 derniers)...${NC}"
cd /opt/backups/moncabinet/
ls -t db_backup_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm || true
cd /opt/moncabinet

# Supprimer backups .env.production > 7 jours
find . -name ".env.production.backup.*" -mtime +7 -delete || true

# ============================================================================
# ÉTAPE 10: Résumé
# ============================================================================

echo ""
echo -e "${GREEN}✅ ============================================${NC}"
echo -e "${GREEN}✅ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS!${NC}"
echo -e "${GREEN}✅ ============================================${NC}"
echo ""
echo -e "${YELLOW}📊 Status containers:${NC}"
docker compose ps

echo ""
echo -e "${YELLOW}📝 Logs récents:${NC}"
docker compose logs --tail=20

echo ""
echo -e "${YELLOW}💡 Commandes utiles:${NC}"
echo "  - Voir logs live:     docker compose logs -f --tail=100"
echo "  - Redémarrer:         docker compose restart"
echo "  - Arrêter:            docker compose down"
echo "  - Status détaillé:    docker compose ps -a"
echo ""
echo -e "${GREEN}🌐 Application accessible sur: ${NEXT_PUBLIC_APP_URL}${NC}"
