#!/bin/bash
#
# Script de restauration MonCabinet
#
# Usage: ./restore.sh [options]
#
# Options:
#   --db <file>       Restaurer base PostgreSQL depuis fichier .sql.gz
#   --minio <dir>     Restaurer MinIO depuis dossier backup
#   --list            Lister les backups disponibles
#   --latest          Restaurer depuis les derniers backups
#
# Exemples:
#   ./restore.sh --list
#   ./restore.sh --db /opt/backups/moncabinet/db_20260206_030000.sql.gz
#   ./restore.sh --minio /opt/backups/moncabinet/minio_20260206_030000
#   ./restore.sh --latest
#

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/backups/moncabinet"

# Charger variables d'environnement
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
elif [ -f "/opt/moncabinet/.env" ]; then
  export $(grep -v '^#' "/opt/moncabinet/.env" | xargs)
fi

# Fonction: Lister les backups
list_backups() {
  echo -e "${BLUE}📦 Backups disponibles dans $BACKUP_DIR${NC}"
  echo ""

  echo -e "${YELLOW}🗄️  Base de données PostgreSQL:${NC}"
  ls -lh "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}' || echo "  Aucun backup trouvé"
  echo ""

  echo -e "${YELLOW}📁 MinIO (documents):${NC}"
  for dir in "$BACKUP_DIR"/minio_*; do
    if [ -d "$dir" ]; then
      SIZE=$(du -sh "$dir" | cut -f1)
      COUNT=$(find "$dir" -type f | wc -l)
      echo "  $(basename "$dir") ($SIZE, $COUNT fichiers)"
    fi
  done 2>/dev/null || echo "  Aucun backup trouvé"
  echo ""

  echo -e "${YELLOW}💻 Code source:${NC}"
  ls -lh "$BACKUP_DIR"/code_*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}' || echo "  Aucun backup trouvé"
}

# Fonction: Restaurer PostgreSQL
restore_db() {
  local backup_file="$1"

  if [ ! -f "$backup_file" ]; then
    echo -e "${RED}❌ Fichier non trouvé: $backup_file${NC}"
    exit 1
  fi

  echo -e "${YELLOW}⚠️  ATTENTION: Cette opération va ÉCRASER la base de données actuelle!${NC}"
  echo -e "Fichier: $backup_file"
  read -p "Confirmer? (oui/non): " confirm

  if [ "$confirm" != "oui" ]; then
    echo -e "${YELLOW}Restauration annulée.${NC}"
    exit 0
  fi

  echo -e "${YELLOW}🔄 Restauration PostgreSQL en cours...${NC}"

  # Vérifier container
  if ! docker ps | grep -q moncabinet-postgres; then
    echo -e "${RED}❌ Container PostgreSQL non démarré!${NC}"
    exit 1
  fi

  # Arrêter l'application pour éviter les conflits
  echo -e "${YELLOW}⏸️  Arrêt temporaire de l'application...${NC}"
  docker stop moncabinet-nextjs 2>/dev/null || true

  # Supprimer et recréer la base
  echo -e "${YELLOW}🗑️  Suppression de la base actuelle...${NC}"
  docker exec moncabinet-postgres psql -U "${DB_USER:-moncabinet}" -c "DROP DATABASE IF EXISTS moncabinet;" postgres
  docker exec moncabinet-postgres psql -U "${DB_USER:-moncabinet}" -c "CREATE DATABASE moncabinet;" postgres

  # Restaurer
  echo -e "${YELLOW}📥 Importation du backup...${NC}"
  gunzip -c "$backup_file" | docker exec -i moncabinet-postgres psql -U "${DB_USER:-moncabinet}" moncabinet

  # Redémarrer l'application
  echo -e "${YELLOW}▶️  Redémarrage de l'application...${NC}"
  docker start moncabinet-nextjs

  echo -e "${GREEN}✅ Base de données restaurée avec succès!${NC}"
}

# Fonction: Restaurer MinIO
restore_minio() {
  local backup_dir="$1"

  if [ ! -d "$backup_dir" ]; then
    echo -e "${RED}❌ Dossier non trouvé: $backup_dir${NC}"
    exit 1
  fi

  echo -e "${YELLOW}⚠️  ATTENTION: Cette opération va ÉCRASER les documents actuels!${NC}"
  echo -e "Dossier: $backup_dir"
  read -p "Confirmer? (oui/non): " confirm

  if [ "$confirm" != "oui" ]; then
    echo -e "${YELLOW}Restauration annulée.${NC}"
    exit 0
  fi

  echo -e "${YELLOW}🔄 Restauration MinIO en cours...${NC}"

  # Vérifier container
  if ! docker ps | grep -q moncabinet-minio; then
    echo -e "${RED}❌ Container MinIO non démarré!${NC}"
    exit 1
  fi

  # Mirror depuis backup vers MinIO
  docker run --rm \
    --network moncabinet_moncabinet-network \
    -v "$backup_dir:/backup:ro" \
    -e MC_HOST_myminio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
    minio/mc:latest \
    mirror --overwrite /backup/documents myminio/documents

  echo -e "${GREEN}✅ Documents MinIO restaurés avec succès!${NC}"
}

# Fonction: Restaurer les derniers backups
restore_latest() {
  echo -e "${YELLOW}🔍 Recherche des derniers backups...${NC}"

  LATEST_DB=$(ls -t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | head -1)
  LATEST_MINIO=$(ls -td "$BACKUP_DIR"/minio_* 2>/dev/null | head -1)

  if [ -z "$LATEST_DB" ] && [ -z "$LATEST_MINIO" ]; then
    echo -e "${RED}❌ Aucun backup trouvé!${NC}"
    exit 1
  fi

  echo -e "${BLUE}Derniers backups trouvés:${NC}"
  [ -n "$LATEST_DB" ] && echo "  DB: $(basename "$LATEST_DB")"
  [ -n "$LATEST_MINIO" ] && echo "  MinIO: $(basename "$LATEST_MINIO")"
  echo ""

  echo -e "${YELLOW}⚠️  ATTENTION: Cela va ÉCRASER toutes les données actuelles!${NC}"
  read -p "Confirmer restauration complète? (oui/non): " confirm

  if [ "$confirm" != "oui" ]; then
    echo -e "${YELLOW}Restauration annulée.${NC}"
    exit 0
  fi

  # Restaurer DB
  if [ -n "$LATEST_DB" ]; then
    echo ""
    echo -e "${BLUE}=== Restauration PostgreSQL ===${NC}"

    # Arrêter l'application
    docker stop moncabinet-nextjs 2>/dev/null || true

    # Supprimer et recréer la base
    docker exec moncabinet-postgres psql -U "${DB_USER:-moncabinet}" -c "DROP DATABASE IF EXISTS moncabinet;" postgres
    docker exec moncabinet-postgres psql -U "${DB_USER:-moncabinet}" -c "CREATE DATABASE moncabinet;" postgres

    # Restaurer
    gunzip -c "$LATEST_DB" | docker exec -i moncabinet-postgres psql -U "${DB_USER:-moncabinet}" moncabinet

    echo -e "${GREEN}✅ PostgreSQL restauré${NC}"
  fi

  # Restaurer MinIO
  if [ -n "$LATEST_MINIO" ]; then
    echo ""
    echo -e "${BLUE}=== Restauration MinIO ===${NC}"

    docker run --rm \
      --network moncabinet_moncabinet-network \
      -v "$LATEST_MINIO:/backup:ro" \
      -e MC_HOST_myminio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
      minio/mc:latest \
      mirror --overwrite /backup/documents myminio/documents

    echo -e "${GREEN}✅ MinIO restauré${NC}"
  fi

  # Redémarrer l'application
  docker start moncabinet-nextjs 2>/dev/null || true

  echo ""
  echo -e "${GREEN}✅ ============================================${NC}"
  echo -e "${GREEN}✅ RESTAURATION COMPLÈTE TERMINÉE${NC}"
  echo -e "${GREEN}✅ ============================================${NC}"
}

# Main
case "${1:-}" in
  --list)
    list_backups
    ;;
  --db)
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: $0 --db <fichier.sql.gz>${NC}"
      exit 1
    fi
    restore_db "$2"
    ;;
  --minio)
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: $0 --minio <dossier_backup>${NC}"
      exit 1
    fi
    restore_minio "$2"
    ;;
  --latest)
    restore_latest
    ;;
  *)
    echo -e "${BLUE}Script de restauration MonCabinet${NC}"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --list            Lister les backups disponibles"
    echo "  --db <file>       Restaurer PostgreSQL depuis fichier .sql.gz"
    echo "  --minio <dir>     Restaurer MinIO depuis dossier backup"
    echo "  --latest          Restaurer depuis les derniers backups"
    echo ""
    echo "Exemples:"
    echo "  $0 --list"
    echo "  $0 --db /opt/backups/moncabinet/db_20260206_030000.sql.gz"
    echo "  $0 --latest"
    ;;
esac
