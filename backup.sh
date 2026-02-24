#!/bin/bash
#
# Script de backup automatique Qadhya
#
# Usage: ./backup.sh [--notify]
#
# Options:
#   --notify    Envoyer notification Brevo en cas d'échec
#
# Fonctionnalités:
# - Backup PostgreSQL (dump SQL compressé)
# - Backup MinIO (documents)
# - Backup code source
# - Rotation automatique (garder 14 derniers)
# - Alerte si disque > 80%
# - Notification Brevo en cas d'échec
#
# À planifier dans crontab:
# 0 3 * * * /opt/qadhya/backup.sh --notify >> /var/log/qadhya-backup.log 2>&1
#

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/qadhya}"
DATE=$(date +%Y%m%d_%H%M%S)
NOTIFY=false
ERRORS=""

# Parser arguments
for arg in "$@"; do
  case $arg in
    --notify)
      NOTIFY=true
      shift
      ;;
  esac
done

# Charger variables d'environnement
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
elif [ -f "/opt/qadhya/.env" ]; then
  export $(grep -v '^#' "/opt/qadhya/.env" | xargs)
fi

# Fonction pour envoyer notification Brevo en cas d'échec
send_failure_notification() {
  local error_message="$1"

  if [ "$NOTIFY" = true ] && [ -n "$BREVO_API_KEY" ]; then
    curl -s -X POST "https://api.brevo.com/v3/smtp/email" \
      -H "accept: application/json" \
      -H "api-key: $BREVO_API_KEY" \
      -H "content-type: application/json" \
      -d "{
        \"sender\": {\"name\": \"Qadhya Backup\", \"email\": \"${BREVO_SENDER_EMAIL:-noreply@moncabinet.tn}\"},
        \"to\": [{\"email\": \"${ADMIN_EMAIL:-admin@moncabinet.tn}\"}],
        \"subject\": \"⚠️ Échec Backup Qadhya - $DATE\",
        \"htmlContent\": \"<h2>Échec du backup automatique</h2><p>Date: $DATE</p><p>Erreur:</p><pre>$error_message</pre><p>Vérifiez le serveur et relancez le backup manuellement.</p>\"
      }" > /dev/null 2>&1 || true
    echo -e "${YELLOW}📧 Notification envoyée${NC}"
  fi
}

# Fonction cleanup en cas d'erreur
cleanup_on_error() {
  echo -e "${RED}❌ Backup échoué!${NC}"
  send_failure_notification "$ERRORS"
  exit 1
}

# Créer dossier backups
mkdir -p "$BACKUP_DIR"

# Trap pour gérer les erreurs
trap cleanup_on_error ERR

echo -e "${GREEN}🔄 Backup Qadhya - $DATE${NC}"
echo "Notify: $NOTIFY"

# ============================================================================
# ÉTAPE 1: Backup PostgreSQL
# ============================================================================

echo -e "${YELLOW}💾 Backup PostgreSQL...${NC}"

# Vérifier que container tourne
if ! docker ps | grep -q qadhya-postgres; then
  echo -e "${RED}❌ Container PostgreSQL non démarré!${NC}"
  exit 1
fi

# Dump SQL compressé
docker exec qadhya-postgres pg_dump -U moncabinet qadhya | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_DIR/db_$DATE.sql.gz" | cut -f1)
  echo -e "${GREEN}✅ PostgreSQL backup: db_$DATE.sql.gz ($SIZE)${NC}"
else
  ERRORS="Échec backup PostgreSQL"
  echo -e "${RED}❌ $ERRORS${NC}"
  cleanup_on_error
fi

# ============================================================================
# ÉTAPE 2: Backup MinIO (Documents)
# ============================================================================

echo -e "${YELLOW}💾 Backup MinIO...${NC}"

# Créer dossier pour ce backup
MINIO_BACKUP_DIR="$BACKUP_DIR/minio_$DATE"
mkdir -p "$MINIO_BACKUP_DIR"

# Vérifier que container MinIO tourne
if ! docker ps | grep -q qadhya-minio; then
  echo -e "${RED}❌ Container MinIO non démarré!${NC}"
  exit 1
fi

# Vérifier si le bucket documents existe
BUCKET_EXISTS=$(docker run --rm \
  --network qadhya_default \
  -e MC_HOST_myminio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc:latest \
  ls myminio/documents 2>&1 || true)

if echo "$BUCKET_EXISTS" | grep -q "does not exist"; then
  echo -e "${YELLOW}⚠️  Bucket 'documents' n'existe pas encore (aucun fichier uploadé)${NC}"
  rmdir "$MINIO_BACKUP_DIR" 2>/dev/null || true
else
  # Mirror bucket documents via MinIO client
  docker run --rm \
    --network qadhya_default \
    -v "$MINIO_BACKUP_DIR:/backup" \
    -e MC_HOST_myminio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
    minio/mc:latest \
    mirror myminio/documents /backup/documents > /dev/null 2>&1 || true

  # Compter fichiers et taille totale
  FILE_COUNT=$(find "$MINIO_BACKUP_DIR" -type f 2>/dev/null | wc -l)
  if [ "$FILE_COUNT" -gt 0 ]; then
    TOTAL_SIZE=$(du -sh "$MINIO_BACKUP_DIR" | cut -f1)
    echo -e "${GREEN}✅ MinIO backup: minio_$DATE ($FILE_COUNT fichiers, $TOTAL_SIZE)${NC}"
  else
    echo -e "${YELLOW}⚠️  MinIO: aucun fichier à sauvegarder${NC}"
    rmdir "$MINIO_BACKUP_DIR" 2>/dev/null || true
  fi
fi

# ============================================================================
# ÉTAPE 3: Backup Code Source
# ============================================================================

echo -e "${YELLOW}💾 Backup code source...${NC}"

# Backup tar.gz (exclure node_modules, .next, .git)
tar -czf "$BACKUP_DIR/code_$DATE.tar.gz" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='logs' \
  --exclude='*.log' \
  -C /opt qadhya > /dev/null 2>&1

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_DIR/code_$DATE.tar.gz" | cut -f1)
  echo -e "${GREEN}✅ Code backup: code_$DATE.tar.gz ($SIZE)${NC}"
else
  echo -e "${RED}❌ Échec backup code${NC}"
fi

# ============================================================================
# ÉTAPE 4: Nettoyage Anciens Backups (garder 14 derniers)
# ============================================================================

echo -e "${YELLOW}🧹 Nettoyage anciens backups...${NC}"

# Supprimer backups PostgreSQL > 14 jours
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +14 -delete 2>/dev/null || true

# Supprimer backups code > 14 jours
find "$BACKUP_DIR" -name "code_*.tar.gz" -mtime +14 -delete 2>/dev/null || true

# Supprimer dossiers MinIO > 14 jours
find "$BACKUP_DIR" -type d -name "minio_*" -mtime +14 -exec rm -rf {} + 2>/dev/null || true

# Compter backups restants
DB_BACKUPS=$(find "$BACKUP_DIR" -name "db_*.sql.gz" | wc -l)
CODE_BACKUPS=$(find "$BACKUP_DIR" -name "code_*.tar.gz" | wc -l)
MINIO_BACKUPS=$(find "$BACKUP_DIR" -type d -name "minio_*" | wc -l)

echo -e "${GREEN}✅ Backups actuels: ${DB_BACKUPS} DB, ${CODE_BACKUPS} code, ${MINIO_BACKUPS} MinIO${NC}"

# ============================================================================
# ÉTAPE 5: Vérifier Espace Disque
# ============================================================================

echo -e "${YELLOW}💾 Vérification espace disque...${NC}"

DISK_USAGE=$(df -h /opt | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAILABLE=$(df -h /opt | tail -1 | awk '{print $4}')

echo "Disque utilisé: ${DISK_USAGE}% (disponible: ${DISK_AVAILABLE})"

if [ "$DISK_USAGE" -gt 80 ]; then
  echo -e "${RED}⚠️  ALERTE: Disque utilisé à ${DISK_USAGE}%!${NC}"
  echo "Espace disponible: $DISK_AVAILABLE"
  echo "Nettoyer anciens backups ou augmenter capacité disque"

  # Optionnel: Envoyer alerte email
  # echo "Disque VPS à ${DISK_USAGE}%" | mail -s "Alerte Disque Qadhya" admin@moncabinet.tn
else
  echo -e "${GREEN}✅ Espace disque OK (${DISK_USAGE}%)${NC}"
fi

# ============================================================================
# ÉTAPE 6: Résumé Backup
# ============================================================================

echo ""
echo -e "${GREEN}✅ ============================================${NC}"
echo -e "${GREEN}✅ BACKUP TERMINÉ: $DATE${NC}"
echo -e "${GREEN}✅ ============================================${NC}"
echo ""
echo "Backup directory: $BACKUP_DIR"
echo "Backups database: $DB_BACKUPS fichiers"
echo "Backups code: $CODE_BACKUPS fichiers"
echo "Backups MinIO: $MINIO_BACKUPS dossiers"
echo "Espace disque: ${DISK_USAGE}% utilisé, ${DISK_AVAILABLE} disponible"
echo ""

# ============================================================================
# ÉTAPE 7: Statistiques Backup
# ============================================================================

BACKUP_DIR_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "Taille totale backups: $BACKUP_DIR_SIZE"

# Dernier backup de chaque type
LAST_DB=$(ls -t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | head -1)
LAST_CODE=$(ls -t "$BACKUP_DIR"/code_*.tar.gz 2>/dev/null | head -1)
LAST_MINIO=$(ls -td "$BACKUP_DIR"/minio_* 2>/dev/null | head -1)

if [ -n "$LAST_DB" ]; then
  DB_SIZE=$(du -h "$LAST_DB" | cut -f1)
  echo "Dernier backup DB: $(basename "$LAST_DB") ($DB_SIZE)"
fi

if [ -n "$LAST_CODE" ]; then
  CODE_SIZE=$(du -h "$LAST_CODE" | cut -f1)
  echo "Dernier backup code: $(basename "$LAST_CODE") ($CODE_SIZE)"
fi

if [ -n "$LAST_MINIO" ]; then
  MINIO_SIZE=$(du -sh "$LAST_MINIO" | cut -f1)
  echo "Dernier backup MinIO: $(basename "$LAST_MINIO") ($MINIO_SIZE)"
fi

echo ""
echo -e "${GREEN}✅ Backup réussi${NC}"
