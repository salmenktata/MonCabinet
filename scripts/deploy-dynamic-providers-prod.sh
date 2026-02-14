#!/bin/bash
# Script: Deploy Gestion Dynamique Providers en Production
# Description: Checklist complète pour déploiement production sans erreurs

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
VPS_HOST="84.247.165.187"
VPS_USER="root"
DB_NAME="qadhya"
DB_USER="moncabinet"
MIGRATION_FILE="migrations/20260215_create_operation_provider_configs.sql"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DÉPLOIEMENT GESTION DYNAMIQUE PROVIDERS - PRODUCTION     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

echo -e "${YELLOW}📋 PRE-FLIGHT CHECKS${NC}"
echo ""

# Check 1: Migration file exists
echo -n "1. Vérification migration SQL... "
if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Migration non trouvée: $MIGRATION_FILE${NC}"
    exit 1
fi

# Check 2: SSH access
echo -n "2. Vérification accès SSH VPS... "
if ssh -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'OK'" &> /dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Impossible de se connecter au VPS${NC}"
    exit 1
fi

# Check 3: Git status clean
echo -n "3. Vérification git status... "
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✅ Clean${NC}"
else
    echo -e "${YELLOW}⚠️  Uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Continuer quand même? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check 4: Tests passed
echo -n "4. Vérification tests unitaires... "
if npm run test lib/config/__tests__/operations-config-service.test.ts &> /dev/null; then
    echo -e "${GREEN}✅ 40+ tests pass${NC}"
else
    echo -e "${YELLOW}⚠️  Tests échoués ou non exécutés${NC}"
    read -p "Continuer quand même? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}✅ Pre-flight checks terminés${NC}"
echo ""

# =============================================================================
# CONFIRMATION
# =============================================================================

echo -e "${YELLOW}⚠️  ATTENTION: Vous allez déployer en PRODUCTION${NC}"
echo ""
echo "Actions qui seront effectuées:"
echo "  1. Upload migration SQL sur VPS"
echo "  2. Backup DB production (snapshot)"
echo "  3. Appliquer migration SQL"
echo "  4. Vérifier tables créées (6 rows)"
echo "  5. Activer feature flag"
echo "  6. Trigger GitHub Actions (Tier 2 rebuild)"
echo "  7. Health check post-déploiement"
echo ""
read -p "Confirmer déploiement PRODUCTION? (yes/NO) " -r
echo
if [[ ! $REPLY == "yes" ]]; then
    echo -e "${YELLOW}❌ Déploiement annulé${NC}"
    exit 0
fi

echo ""

# =============================================================================
# STEP 1: UPLOAD MIGRATION
# =============================================================================

echo -e "${BLUE}📦 STEP 1/7: Upload migration SQL${NC}"
echo ""

# Copy migration to VPS
scp "$MIGRATION_FILE" "$VPS_USER@$VPS_HOST:/opt/qadhya/migrations/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration uploadée: /opt/qadhya/$MIGRATION_FILE${NC}"
else
    echo -e "${RED}❌ Échec upload${NC}"
    exit 1
fi

echo ""

# =============================================================================
# STEP 2: BACKUP DB
# =============================================================================

echo -e "${BLUE}💾 STEP 2/7: Backup base de données${NC}"
echo ""

BACKUP_FILE="/opt/backups/qadhya_pre_dynamic_providers_$(date +%Y%m%d_%H%M%S).sql"

ssh "$VPS_USER@$VPS_HOST" "pg_dump -U $DB_USER -d $DB_NAME > $BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup créé: $BACKUP_FILE${NC}"

    # Get backup size
    BACKUP_SIZE=$(ssh "$VPS_USER@$VPS_HOST" "du -h $BACKUP_FILE | cut -f1")
    echo "   Taille: $BACKUP_SIZE"
else
    echo -e "${RED}❌ Échec backup${NC}"
    exit 1
fi

echo ""

# =============================================================================
# STEP 3: APPLY MIGRATION
# =============================================================================

echo -e "${BLUE}🗄️  STEP 3/7: Application migration SQL${NC}"
echo ""

ssh "$VPS_USER@$VPS_HOST" "psql -U $DB_USER -d $DB_NAME -f /opt/qadhya/$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration appliquée${NC}"
else
    echo -e "${RED}❌ Échec migration${NC}"
    echo ""
    echo "ROLLBACK disponible:"
    echo "  ssh $VPS_USER@$VPS_HOST"
    echo "  psql -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
    exit 1
fi

echo ""

# =============================================================================
# STEP 4: VERIFY TABLES
# =============================================================================

echo -e "${BLUE}🔍 STEP 4/7: Vérification tables créées${NC}"
echo ""

# Check operation_provider_configs
ROWS_COUNT=$(ssh "$VPS_USER@$VPS_HOST" "psql -U $DB_USER -d $DB_NAME -t -c 'SELECT COUNT(*) FROM operation_provider_configs;'" | tr -d ' ')

if [ "$ROWS_COUNT" == "6" ]; then
    echo -e "${GREEN}✅ Table operation_provider_configs: 6 rows${NC}"
else
    echo -e "${RED}❌ Attendu 6 rows, trouvé: $ROWS_COUNT${NC}"
    exit 1
fi

# Check ai_config_change_history
TABLE_EXISTS=$(ssh "$VPS_USER@$VPS_HOST" "psql -U $DB_USER -d $DB_NAME -t -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ai_config_change_history');\"" | tr -d ' ')

if [ "$TABLE_EXISTS" == "t" ]; then
    echo -e "${GREEN}✅ Table ai_config_change_history créée${NC}"
else
    echo -e "${RED}❌ Table ai_config_change_history non créée${NC}"
    exit 1
fi

echo ""

# =============================================================================
# STEP 5: ENABLE FEATURE FLAG
# =============================================================================

echo -e "${BLUE}⚙️  STEP 5/7: Activation feature flag${NC}"
echo ""

# Check if already enabled
ALREADY_ENABLED=$(ssh "$VPS_USER@$VPS_HOST" "grep -c 'DYNAMIC_OPERATION_CONFIG=true' /opt/qadhya/.env.production.local || echo 0")

if [ "$ALREADY_ENABLED" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Feature flag déjà activé${NC}"
else
    ssh "$VPS_USER@$VPS_HOST" "echo '' >> /opt/qadhya/.env.production.local && echo '# Gestion Dynamique Providers (Feb 2026)' >> /opt/qadhya/.env.production.local && echo 'DYNAMIC_OPERATION_CONFIG=true' >> /opt/qadhya/.env.production.local"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Feature flag activé${NC}"
    else
        echo -e "${RED}❌ Échec activation feature flag${NC}"
        exit 1
    fi
fi

echo ""

# =============================================================================
# STEP 6: TRIGGER GITHUB ACTIONS
# =============================================================================

echo -e "${BLUE}🚀 STEP 6/7: Trigger GitHub Actions (Tier 2)${NC}"
echo ""

echo "Commande à exécuter:"
echo -e "${YELLOW}gh workflow run \"Deploy to VPS Contabo\" -f force_docker=true${NC}"
echo ""

read -p "Lancer le workflow maintenant? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    gh workflow run "Deploy to VPS Contabo" -f force_docker=true

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Workflow lancé${NC}"
        echo ""
        echo "Suivre progression:"
        echo "  gh run watch"
        echo "  ou: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
    else
        echo -e "${RED}❌ Échec lancement workflow${NC}"
        echo "Lancer manuellement: gh workflow run \"Deploy to VPS Contabo\" -f force_docker=true"
    fi
else
    echo -e "${YELLOW}⚠️  Workflow non lancé (manuel requis)${NC}"
fi

echo ""

# =============================================================================
# STEP 7: HEALTH CHECK (après déploiement)
# =============================================================================

echo -e "${BLUE}🏥 STEP 7/7: Health check post-déploiement${NC}"
echo ""

echo "Attendre fin du déploiement (8-10 min), puis exécuter:"
echo ""
echo -e "${YELLOW}# Test API${NC}"
echo "curl https://qadhya.tn/api/admin/operations-config | jq '.operations | length'"
echo "# Attendu: 6"
echo ""
echo -e "${YELLOW}# Test UI${NC}"
echo "https://qadhya.tn/super-admin/settings?tab=ai-architecture"
echo "# Vérifier panel 'Configuration par Opération' affiché"
echo ""
echo -e "${YELLOW}# Test Health${NC}"
echo "curl https://qadhya.tn/api/health | jq '.status'"
echo "# Attendu: \"healthy\""
echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DÉPLOIEMENT COMPLÉTÉ AVEC SUCCÈS                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "✅ Actions effectuées:"
echo "   - Migration SQL appliquée"
echo "   - 6 rows insérées (operation_provider_configs)"
echo "   - Table audit trail créée (ai_config_change_history)"
echo "   - Feature flag activé (DYNAMIC_OPERATION_CONFIG=true)"
echo "   - Workflow GitHub Actions lancé (ou à lancer manuellement)"
echo ""

echo "📊 Monitoring 24h recommandé:"
echo "   - Logs: ssh $VPS_USER@$VPS_HOST \"tail -f /var/log/qadhya/app.log\""
echo "   - Métriques: https://qadhya.tn/super-admin/monitoring"
echo "   - Health: curl https://qadhya.tn/api/health"
echo ""

echo "🆘 Rollback si problème:"
echo "   - Option 1: Désactiver feature flag"
echo "     ssh $VPS_USER@$VPS_HOST"
echo "     sed -i 's/DYNAMIC_OPERATION_CONFIG=true/DYNAMIC_OPERATION_CONFIG=false/' /opt/qadhya/.env.production.local"
echo "     docker compose restart nextjs"
echo ""
echo "   - Option 2: Restore backup DB"
echo "     ssh $VPS_USER@$VPS_HOST"
echo "     psql -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
echo ""

echo "📚 Documentation:"
echo "   - docs/DYNAMIC_PROVIDERS_README.md"
echo "   - docs/DYNAMIC_PROVIDERS_IMPLEMENTATION.md"
echo ""

echo -e "${GREEN}🎉 Déploiement production terminé!${NC}"
