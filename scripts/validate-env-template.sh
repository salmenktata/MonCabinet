#!/bin/bash
# =============================================================================
# Script de Validation - Variables d'Environnement (.env.example)
# =============================================================================
# Vérifie que toutes les variables requises sont présentes dans .env.example
# et que les variables recommandées sont documentées.
#
# Exit codes :
#   0 - Toutes les variables requises présentes
#   1 - Variables requises manquantes
#   2 - Fichier .env.example non trouvé
#
# Usage : bash scripts/validate-env-template.sh
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fichier à valider
ENV_FILE=".env.example"

# =============================================================================
# VARIABLES REQUISES (BLOQUANTES)
# =============================================================================
REQUIRED_VARS=(
  # Base de données
  "DATABASE_URL"
  "POSTGRES_USER"
  "POSTGRES_PASSWORD"
  "POSTGRES_DB"

  # Redis
  "REDIS_URL"

  # NextAuth
  "NEXTAUTH_URL"
  "NEXTAUTH_SECRET"

  # MinIO Storage
  "MINIO_ENDPOINT"
  "MINIO_PORT"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
  "MINIO_USE_SSL"

  # Sécurité
  "ENCRYPTION_KEY"
  "CRON_SECRET"

  # Ollama
  "OLLAMA_BASE_URL"
  "OLLAMA_CHAT_MODEL"
  "OLLAMA_EMBEDDING_MODEL"
)

# =============================================================================
# VARIABLES RECOMMANDÉES (WARNINGS)
# =============================================================================
RECOMMENDED_VARS=(
  # LLM Providers
  "GROQ_API_KEY"
  "DEEPSEEK_API_KEY"
  "ANTHROPIC_API_KEY"
  "GEMINI_API_KEY"

  # Email
  "RESEND_API_KEY"

  # Google Drive
  "GOOGLE_DRIVE_ENABLED"
  "GOOGLE_DRIVE_CLIENT_EMAIL"
  "GOOGLE_DRIVE_PRIVATE_KEY"

  # Configuration RAG
  "RAG_MAX_CONTEXT_TOKENS"
  "RAG_SIMILARITY_THRESHOLD"
  "SEARCH_CACHE_THRESHOLD"

  # Indexation
  "OLLAMA_EMBEDDING_CONCURRENCY"
  "USE_STREAMING_PDF"
)

# =============================================================================
# FONCTIONS
# =============================================================================

check_file_exists() {
  if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Erreur : Fichier $ENV_FILE non trouvé${NC}"
    exit 2
  fi
}

check_required_variables() {
  local missing_count=0

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}🔍 Vérification des variables REQUISES${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "^${var}=" "$ENV_FILE" || grep -q "^# ${var}=" "$ENV_FILE"; then
      echo -e "  ${GREEN}✓${NC} $var"
    else
      echo -e "  ${RED}✗${NC} $var ${RED}(MANQUANTE)${NC}"
      missing_count=$((missing_count + 1))
    fi
  done

  echo ""

  if [ $missing_count -gt 0 ]; then
    echo -e "${RED}❌ $missing_count variable(s) requise(s) manquante(s)${NC}"
    return 1
  else
    echo -e "${GREEN}✅ Toutes les variables requises sont présentes${NC}"
    return 0
  fi
}

check_recommended_variables() {
  local missing_count=0

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}📋 Vérification des variables RECOMMANDÉES${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  for var in "${RECOMMENDED_VARS[@]}"; do
    if grep -q "^${var}=" "$ENV_FILE" || grep -q "^# ${var}=" "$ENV_FILE"; then
      echo -e "  ${GREEN}✓${NC} $var"
    else
      echo -e "  ${YELLOW}⚠${NC} $var ${YELLOW}(recommandée)${NC}"
      missing_count=$((missing_count + 1))
    fi
  done

  echo ""

  if [ $missing_count -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $missing_count variable(s) recommandée(s) manquante(s)${NC}"
    echo -e "${YELLOW}   Ces variables améliorent les fonctionnalités mais ne sont pas bloquantes${NC}"
  else
    echo -e "${GREEN}✅ Toutes les variables recommandées sont présentes${NC}"
  fi

  echo ""
}

# =============================================================================
# MAIN
# =============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🔐 Validation des Variables d'Environnement${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Vérifier existence fichier
check_file_exists

# Vérifier variables requises
if ! check_required_variables; then
  echo ""
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ VALIDATION ÉCHOUÉE${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${YELLOW}💡 Ajoutez les variables manquantes dans $ENV_FILE${NC}"
  exit 1
fi

# Vérifier variables recommandées (warnings seulement)
check_recommended_variables

# Succès
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ VALIDATION RÉUSSIE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit 0
