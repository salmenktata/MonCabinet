#!/bin/bash
set -e

# ============================================================================
# SCRIPT DE VÉRIFICATION PRÉ-DÉPLOIEMENT
# ============================================================================
# Vérifie la configuration avant le déploiement pour éviter les erreurs
# communes comme la confusion de nom de base de données.
#
# Usage: ./scripts/pre-deploy-check.sh [production|local]
# ============================================================================

ENVIRONMENT="${1:-production}"
ENV_FILE=".env"

if [ "$ENVIRONMENT" = "production" ]; then
    ENV_FILE=".env.production"
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         VÉRIFICATION PRÉ-DÉPLOIEMENT ($ENVIRONMENT)         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# ============================================================================
# FONCTION: Vérifier variable d'environnement
# ============================================================================
check_env_var() {
    local var_name=$1
    local required=${2:-true}
    local file=${3:-$ENV_FILE}

    if [ -f "$file" ]; then
        if grep -q "^${var_name}=" "$file"; then
            value=$(grep "^${var_name}=" "$file" | cut -d= -f2-)
            if [ -z "$value" ] || [ "$value" = "CHANGE_ME" ] || [[ "$value" =~ CHANGE_ME ]]; then
                if [ "$required" = "true" ]; then
                    echo -e "${RED}✗${NC} $var_name: NON CONFIGURÉ (requis)"
                    ((ERRORS++))
                else
                    echo -e "${YELLOW}⚠${NC} $var_name: NON CONFIGURÉ (optionnel)"
                    ((WARNINGS++))
                fi
            else
                echo -e "${GREEN}✓${NC} $var_name: configuré"
            fi
        else
            if [ "$required" = "true" ]; then
                echo -e "${RED}✗${NC} $var_name: MANQUANT (requis)"
                ((ERRORS++))
            else
                echo -e "${YELLOW}⚠${NC} $var_name: MANQUANT (optionnel)"
                ((WARNINGS++))
            fi
        fi
    else
        echo -e "${RED}✗${NC} Fichier $file introuvable"
        ((ERRORS++))
    fi
}

# ============================================================================
# VÉRIFICATIONS CRITIQUES
# ============================================================================
echo "▓▓▓ VÉRIFICATIONS CRITIQUES ▓▓▓"
echo ""

# Base de données
echo "→ Configuration Base de Données"
check_env_var "DB_NAME" true
check_env_var "DB_USER" true
check_env_var "DB_PASSWORD" true
check_env_var "DATABASE_URL" true
echo ""

# MinIO
echo "→ Configuration MinIO"
check_env_var "MINIO_ROOT_USER" true
check_env_var "MINIO_ROOT_PASSWORD" true
check_env_var "MINIO_ENDPOINT" true
echo ""

# NextAuth
echo "→ Configuration NextAuth"
check_env_var "NEXTAUTH_URL" true
check_env_var "NEXTAUTH_SECRET" true
echo ""

# ============================================================================
# VÉRIFICATIONS IA/LLM
# ============================================================================
echo "▓▓▓ VÉRIFICATIONS IA/LLM ▓▓▓"
echo ""

check_env_var "GROQ_API_KEY" false
check_env_var "DEEPSEEK_API_KEY" false
check_env_var "OPENAI_API_KEY" false
check_env_var "OLLAMA_ENABLED" false
echo ""

# ============================================================================
# VÉRIFICATIONS INTÉGRATIONS
# ============================================================================
echo "▓▓▓ VÉRIFICATIONS INTÉGRATIONS ▓▓▓"
echo ""

check_env_var "RESEND_API_KEY" false
check_env_var "GOOGLE_CLIENT_ID" false
check_env_var "GOOGLE_CLIENT_SECRET" false
echo ""

# ============================================================================
# VÉRIFICATION COHÉRENCE DATABASE_URL
# ============================================================================
echo "▓▓▓ VÉRIFICATION COHÉRENCE DATABASE_URL ▓▓▓"
echo ""

if [ -f "$ENV_FILE" ]; then
    DB_NAME_VAR=$(grep "^DB_NAME=" "$ENV_FILE" | cut -d= -f2- || echo "")
    DATABASE_URL_VAR=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2- || echo "")

    if [ -n "$DB_NAME_VAR" ] && [ -n "$DATABASE_URL_VAR" ]; then
        if [[ "$DATABASE_URL_VAR" == *"${DB_NAME_VAR}"* ]] || [[ "$DATABASE_URL_VAR" == *"\${DB_NAME}"* ]]; then
            echo -e "${GREEN}✓${NC} DATABASE_URL cohérent avec DB_NAME"
        else
            echo -e "${RED}✗${NC} DATABASE_URL incohérent avec DB_NAME"
            echo "   DB_NAME=$DB_NAME_VAR"
            echo "   DATABASE_URL=$DATABASE_URL_VAR"
            ((ERRORS++))
        fi
    fi
fi
echo ""

# ============================================================================
# VÉRIFICATION DOCKER-COMPOSE
# ============================================================================
echo "▓▓▓ VÉRIFICATION DOCKER-COMPOSE ▓▓▓"
echo ""

COMPOSE_FILE="docker-compose.prod.yml"
if [ "$ENVIRONMENT" = "local" ]; then
    COMPOSE_FILE="docker-compose.yml"
fi

if [ -f "$COMPOSE_FILE" ]; then
    # Vérifier que DB_NAME est utilisé (pas hardcodé)
    if grep -q "POSTGRES_DB:.*qadhya" "$COMPOSE_FILE" && ! grep -q "POSTGRES_DB:.*\${DB_NAME" "$COMPOSE_FILE"; then
        echo -e "${RED}✗${NC} $COMPOSE_FILE: POSTGRES_DB hardcodé (devrait utiliser \${DB_NAME})"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓${NC} $COMPOSE_FILE: POSTGRES_DB utilise variable"
    fi

    if grep -q "DATABASE_URL:.*qadhya" "$COMPOSE_FILE" && ! grep -q "DATABASE_URL:.*\${DB_NAME" "$COMPOSE_FILE"; then
        echo -e "${RED}✗${NC} $COMPOSE_FILE: DATABASE_URL hardcodé (devrait utiliser \${DB_NAME})"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓${NC} $COMPOSE_FILE: DATABASE_URL utilise variable"
    fi

    # Vérifier healthcheck
    if grep -q "pg_isready.*-d qadhya" "$COMPOSE_FILE" && ! grep -q "pg_isready.*\${DB_NAME" "$COMPOSE_FILE"; then
        echo -e "${YELLOW}⚠${NC} $COMPOSE_FILE: healthcheck hardcodé (recommandé d'utiliser \${DB_NAME})"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓${NC} $COMPOSE_FILE: healthcheck utilise variable"
    fi
else
    echo -e "${YELLOW}⚠${NC} Fichier $COMPOSE_FILE introuvable"
    ((WARNINGS++))
fi
echo ""

# ============================================================================
# VÉRIFICATION PERMISSIONS
# ============================================================================
echo "▓▓▓ VÉRIFICATION PERMISSIONS ▓▓▓"
echo ""

if [ -f "$ENV_FILE" ]; then
    PERMS=$(stat -f "%A" "$ENV_FILE" 2>/dev/null || stat -c "%a" "$ENV_FILE" 2>/dev/null)
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "640" ]; then
        echo -e "${GREEN}✓${NC} Permissions $ENV_FILE: $PERMS (OK)"
    else
        echo -e "${YELLOW}⚠${NC} Permissions $ENV_FILE: $PERMS (recommandé: 600)"
        ((WARNINGS++))
    fi
fi
echo ""

# ============================================================================
# RÉSUMÉ
# ============================================================================
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                        RÉSUMÉ                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ Aucun problème détecté${NC}"
    echo ""
    echo "→ Prêt pour le déploiement !"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS avertissement(s)${NC}"
    echo ""
    echo "→ Déploiement possible mais vérifiez les avertissements"
    exit 0
else
    echo -e "${RED}✗ $ERRORS erreur(s), $WARNINGS avertissement(s)${NC}"
    echo ""
    echo "→ DÉPLOIEMENT BLOQUÉ - Corrigez les erreurs ci-dessus"
    exit 1
fi
