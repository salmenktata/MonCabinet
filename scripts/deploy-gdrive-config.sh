#!/bin/bash

###############################################################################
# Script de déploiement de la configuration Google Drive en production
#
# Usage: ./scripts/deploy-gdrive-config.sh <chemin-vers-service-account.json>
#
# Prérequis:
# 1. Fichier JSON du service account téléchargé depuis Google Cloud Console
# 2. Dossier Google Drive partagé avec l'email du service account
# 3. Accès SSH au serveur production
###############################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
PROD_SERVER="root@84.247.165.187"
PROD_DIR="/opt/moncabinet"
TMP_FILE="/tmp/gdrive-service-account.json"

###############################################################################
# Fonctions
###############################################################################

print_header() {
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║     Configuration Google Drive - Production                 ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

validate_json_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    print_error "Fichier non trouvé: $file"
    exit 1
  fi

  # Vérifier que c'est du JSON valide
  if ! jq empty "$file" 2>/dev/null; then
    print_error "Fichier JSON invalide"
    exit 1
  fi

  # Vérifier les champs requis
  local type=$(jq -r '.type' "$file")
  local client_email=$(jq -r '.client_email' "$file")
  local private_key=$(jq -r '.private_key' "$file")

  if [ "$type" != "service_account" ]; then
    print_error "Type incorrect (attendu: service_account, trouvé: $type)"
    exit 1
  fi

  if [ -z "$client_email" ] || [ "$client_email" = "null" ]; then
    print_error "client_email manquant dans le JSON"
    exit 1
  fi

  if [ -z "$private_key" ] || [ "$private_key" = "null" ]; then
    print_error "private_key manquant dans le JSON"
    exit 1
  fi

  print_success "Fichier JSON valide"
  echo "   Email: $client_email"
}

show_instructions() {
  echo ""
  print_info "Étapes de configuration Google Cloud Console:"
  echo ""
  echo "1. Créer le Service Account:"
  echo "   → https://console.cloud.google.com/iam-admin/serviceaccounts?project=qadhya"
  echo "   → Nom: qadhya-gdrive-crawler"
  echo "   → Rôle: Aucun (accès limité aux dossiers partagés)"
  echo ""
  echo "2. Générer une clé JSON:"
  echo "   → Cliquer sur le service account"
  echo "   → Keys → Add Key → Create new key → JSON"
  echo "   → Télécharger le fichier"
  echo ""
  echo "3. Partager le dossier Google Drive:"
  echo "   → URL: https://drive.google.com/drive/folders/1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl"
  echo "   → Clic droit → Partager"
  echo "   → Ajouter: qadhya-gdrive-crawler@qadhya.iam.gserviceaccount.com"
  echo "   → Permission: Lecteur"
  echo ""
}

###############################################################################
# Main
###############################################################################

print_header

# Vérifier les arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  show_instructions
  echo "Usage: $0 <chemin-vers-service-account.json>"
  exit 0
fi

if [ -z "$1" ]; then
  print_error "Fichier service account manquant"
  echo ""
  echo "Usage: $0 <chemin-vers-service-account.json>"
  echo ""
  show_instructions
  exit 1
fi

SERVICE_ACCOUNT_FILE="$1"

# Vérifier que jq est installé
if ! command -v jq &> /dev/null; then
  print_error "jq n'est pas installé. Installation requise: brew install jq"
  exit 1
fi

# Valider le fichier JSON
echo "🔍 Validation du fichier JSON..."
validate_json_file "$SERVICE_ACCOUNT_FILE"
echo ""

# Demander confirmation
print_warning "Partage du dossier Google Drive"
echo "   Avez-vous partagé le dossier avec le service account?"
echo "   Email: $(jq -r '.client_email' "$SERVICE_ACCOUNT_FILE")"
echo ""
read -p "Continuer? (o/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Oo]$ ]]; then
  print_info "Annulé. Partagez d'abord le dossier puis relancez ce script."
  exit 0
fi

# Copier le fichier sur le serveur
echo ""
echo "📤 Copie du fichier sur le serveur production..."
scp "$SERVICE_ACCOUNT_FILE" "$PROD_SERVER:$TMP_FILE" || {
  print_error "Échec de la copie du fichier"
  exit 1
}
print_success "Fichier copié"
echo ""

# Préparer le JSON pour PostgreSQL (échapper les caractères)
echo "📝 Préparation de l'insertion en base de données..."
JSON_CONTENT=$(jq -c '.' "$SERVICE_ACCOUNT_FILE" | sed "s/'/''/g")

# Insérer dans la base de données
echo "💾 Insertion dans system_settings..."
ssh "$PROD_SERVER" "cd $PROD_DIR && docker compose exec -T postgres psql -U moncabinet -d moncabinet" <<EOF
INSERT INTO system_settings (key, value)
VALUES ('google_drive_service_account', '$JSON_CONTENT'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
EOF

if [ $? -eq 0 ]; then
  print_success "Configuration sauvegardée"
else
  print_error "Échec de l'insertion"
  exit 1
fi
echo ""

# Vérifier que la configuration est bien présente
echo "🔍 Vérification de la configuration..."
RESULT=$(ssh "$PROD_SERVER" "cd $PROD_DIR && docker compose exec -T postgres psql -U moncabinet -d moncabinet -t -c \"SELECT COUNT(*) FROM system_settings WHERE key = 'google_drive_service_account';\"" | tr -d ' ')

if [ "$RESULT" = "1" ]; then
  print_success "Configuration vérifiée"
else
  print_error "Configuration non trouvée"
  exit 1
fi
echo ""

# Nettoyer le fichier temporaire
echo "🧹 Nettoyage..."
ssh "$PROD_SERVER" "rm -f $TMP_FILE"
print_success "Fichier temporaire supprimé"
echo ""

# Test de connexion
echo "🧪 Test de connexion Google Drive..."
echo "   Dossier test: 1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl"
echo ""

ssh "$PROD_SERVER" "cd $PROD_DIR && docker compose exec -T nextjs npx tsx scripts/test-gdrive-connection.ts 1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl" || {
  print_warning "Le test de connexion a échoué"
  echo ""
  print_info "Vérifications à faire:"
  echo "   1. Le dossier est-il bien partagé avec le service account?"
  echo "   2. Le service account a-t-il la permission 'Lecteur'?"
  echo "   3. Le folderId est-il correct?"
  echo ""
  exit 1
}

echo ""
print_success "✨ Configuration terminée avec succès!"
echo ""
print_info "Prochaines étapes:"
echo "   1. Aller sur: https://qadhya.tn/super-admin/web-sources/new"
echo "   2. Créer une nouvelle source Google Drive"
echo "   3. Tester le crawl"
echo ""
