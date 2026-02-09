#!/bin/bash
# =============================================================================
# Script de Synchronisation des Clés API
# =============================================================================
#
# Synchronise les clés API entre :
#   1. .env.local (Source de vérité)
#   2. Base de données locale (api_keys)
#   3. .env VPS production
#   4. Base de données production
#
# Usage:
#   ./scripts/sync-api-keys.sh [--check-only] [--no-db] [--no-vps]
#
# Options:
#   --check-only : Affiche uniquement les différences, ne modifie rien
#   --no-db      : Skip synchronisation base de données
#   --no-vps     : Skip synchronisation VPS
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="root@84.247.165.187"
VPS_ENV_FILE="/opt/moncabinet/.env"
LOCAL_ENV_FILE=".env.local"

# Options
CHECK_ONLY=false
SYNC_DB=true
SYNC_VPS=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --check-only)
      CHECK_ONLY=true
      shift
      ;;
    --no-db)
      SYNC_DB=false
      shift
      ;;
    --no-vps)
      SYNC_VPS=false
      shift
      ;;
    *)
      echo "Option inconnue: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}==================================================================="
echo "🔄 Synchronisation des Clés API - $(date)"
echo -e "===================================================================${NC}"
echo ""

# =============================================================================
# 1. Charger clés depuis .env.local
# =============================================================================
echo -e "${BLUE}📖 Chargement des clés depuis .env.local (Source de vérité)${NC}"

if [ ! -f "$LOCAL_ENV_FILE" ]; then
  echo -e "${RED}❌ Erreur : $LOCAL_ENV_FILE introuvable${NC}"
  exit 1
fi

source "$LOCAL_ENV_FILE"

# Clés à synchroniser
declare -A LOCAL_KEYS=(
  ["GOOGLE_API_KEY"]="$GOOGLE_API_KEY"
  ["GROQ_API_KEY"]="$GROQ_API_KEY"
  ["DEEPSEEK_API_KEY"]="$DEEPSEEK_API_KEY"
  ["ENCRYPTION_KEY"]="$ENCRYPTION_KEY"
  ["GEMINI_MODEL"]="${GEMINI_MODEL:-gemini-2.0-flash-exp}"
  ["DEEPSEEK_MODEL"]="${DEEPSEEK_MODEL:-deepseek-chat}"
  ["GROQ_MODEL"]="${GROQ_MODEL:-llama-3.3-70b-versatile}"
)

echo -e "${GREEN}✓ 7 clés chargées${NC}"
echo ""

# =============================================================================
# 2. Vérifier VPS
# =============================================================================
if [ "$SYNC_VPS" = true ]; then
  echo -e "${BLUE}🔍 Vérification .env VPS${NC}"

  VPS_DIFFS=0

  for key in "${!LOCAL_KEYS[@]}"; do
    local_value="${LOCAL_KEYS[$key]}"

    # Récupérer valeur du VPS
    vps_value=$(ssh $VPS_HOST "grep '^${key}=' $VPS_ENV_FILE 2>/dev/null | cut -d'=' -f2-" || echo "")

    # Comparer
    if [ -z "$vps_value" ]; then
      echo -e "  ${YELLOW}⚠️  $key : MANQUANT sur VPS${NC}"
      ((VPS_DIFFS++))
    elif [ "$local_value" != "$vps_value" ]; then
      echo -e "  ${YELLOW}⚠️  $key : DIFFÉRENT${NC}"
      echo -e "     Local: ${local_value:0:20}..."
      echo -e "     VPS:   ${vps_value:0:20}..."
      ((VPS_DIFFS++))
    else
      echo -e "  ${GREEN}✓${NC} $key : OK"
    fi
  done

  if [ $VPS_DIFFS -eq 0 ]; then
    echo -e "${GREEN}✓ VPS synchronisé (0 différence)${NC}"
  else
    echo -e "${YELLOW}⚠️  VPS désynchronisé ($VPS_DIFFS différences)${NC}"
  fi
  echo ""
fi

# =============================================================================
# 3. Vérifier Base de Données Locale
# =============================================================================
if [ "$SYNC_DB" = true ]; then
  echo -e "${BLUE}🔍 Vérification Base de Données Locale${NC}"

  # Vérifier si Docker est en cours
  if ! docker ps | grep -q qadhya-postgres; then
    echo -e "${YELLOW}⚠️  Container PostgreSQL local non démarré${NC}"
    echo -e "   Démarrer avec: docker compose up -d postgres"
    SYNC_DB=false
  else
    DB_DIFFS=0

    # Vérifier ENCRYPTION_KEY
    db_encryption=$(docker exec qadhya-postgres psql -U moncabinet -d moncabinet -tAc "SELECT COUNT(*) FROM api_keys WHERE provider = 'gemini'" 2>/dev/null || echo "0")

    if [ "$db_encryption" = "0" ]; then
      echo -e "  ${YELLOW}⚠️  Base de données vide (0 clés)${NC}"
      ((DB_DIFFS++))
    else
      echo -e "  ${GREEN}✓${NC} Base de données contient des clés"
    fi

    if [ $DB_DIFFS -eq 0 ]; then
      echo -e "${GREEN}✓ Base de données OK${NC}"
    else
      echo -e "${YELLOW}⚠️  Base de données nécessite synchronisation${NC}"
    fi
  fi
  echo ""
fi

# =============================================================================
# 4. Rapport de Synchronisation
# =============================================================================
echo -e "${BLUE}==================================================================="
echo "📊 Rapport de Synchronisation"
echo -e "===================================================================${NC}"
echo ""

NEEDS_SYNC=false

if [ "$SYNC_VPS" = true ] && [ $VPS_DIFFS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  VPS Production : $VPS_DIFFS différence(s)${NC}"
  NEEDS_SYNC=true
fi

if [ "$SYNC_DB" = true ] && [ $DB_DIFFS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Base de Données : $DB_DIFFS différence(s)${NC}"
  NEEDS_SYNC=true
fi

if [ "$NEEDS_SYNC" = false ]; then
  echo -e "${GREEN}✅ Tout est synchronisé !${NC}"
  exit 0
fi

# =============================================================================
# 5. Synchronisation (si demandé)
# =============================================================================
if [ "$CHECK_ONLY" = true ]; then
  echo ""
  echo -e "${BLUE}ℹ️  Mode --check-only : Aucune modification effectuée${NC}"
  echo ""
  echo "Pour synchroniser, lancez :"
  echo "  ./scripts/sync-api-keys.sh"
  exit 0
fi

echo ""
echo -e "${YELLOW}⚠️  Des différences ont été détectées.${NC}"
read -p "Synchroniser maintenant ? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Synchronisation annulée${NC}"
  exit 0
fi

# =============================================================================
# 6. Synchroniser VPS
# =============================================================================
if [ "$SYNC_VPS" = true ] && [ $VPS_DIFFS -gt 0 ]; then
  echo ""
  echo -e "${BLUE}🔄 Synchronisation VPS...${NC}"

  # Créer backup
  ssh $VPS_HOST "cp $VPS_ENV_FILE ${VPS_ENV_FILE}.backup-\$(date +%Y%m%d-%H%M%S)"
  echo -e "${GREEN}✓ Backup créé sur VPS${NC}"

  # Synchroniser chaque clé
  for key in "${!LOCAL_KEYS[@]}"; do
    value="${LOCAL_KEYS[$key]}"

    ssh $VPS_HOST "bash -c '
      ENV_FILE=\"$VPS_ENV_FILE\"
      if grep -q \"^${key}=\" \"\$ENV_FILE\"; then
        sed -i \"s|^${key}=.*|${key}=${value}|\" \"\$ENV_FILE\"
      else
        echo \"${key}=${value}\" >> \"\$ENV_FILE\"
      fi
    '"

    echo -e "  ${GREEN}✓${NC} $key synchronisé"
  done

  # Redémarrer container
  echo ""
  echo -e "${BLUE}🔄 Redémarrage container Next.js...${NC}"
  ssh $VPS_HOST "cd /opt/moncabinet && docker compose -f docker-compose.prod.yml up -d nextjs"

  echo -e "${GREEN}✅ VPS synchronisé${NC}"
fi

# =============================================================================
# 7. Synchroniser Base de Données
# =============================================================================
if [ "$SYNC_DB" = true ] && [ $DB_DIFFS -gt 0 ]; then
  echo ""
  echo -e "${BLUE}🔄 Synchronisation Base de Données...${NC}"

  if [ -f "scripts/import-api-keys-to-db.ts" ]; then
    npx tsx scripts/import-api-keys-to-db.ts
    echo -e "${GREEN}✅ Base de données synchronisée${NC}"
  else
    echo -e "${YELLOW}⚠️  Script import-api-keys-to-db.ts introuvable${NC}"
  fi
fi

# =============================================================================
# 8. Résumé Final
# =============================================================================
echo ""
echo -e "${GREEN}==================================================================="
echo "✅ Synchronisation Terminée"
echo -e "===================================================================${NC}"
echo ""
echo "État final :"
echo -e "  ${GREEN}✓${NC} .env.local (source de vérité)"
if [ "$SYNC_VPS" = true ]; then
  echo -e "  ${GREEN}✓${NC} .env VPS production"
fi
if [ "$SYNC_DB" = true ]; then
  echo -e "  ${GREEN}✓${NC} Base de données locale"
fi
echo ""
echo "📝 Prochaines étapes :"
echo "  1. Tester la production : https://qadhya.tn/api/health"
echo "  2. Mettre à jour GitHub Secrets :"
echo "     https://github.com/salmenktata/Avocat/settings/secrets/actions"
echo ""
