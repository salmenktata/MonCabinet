#!/bin/bash
# Script: Test Local Setup
# Description: Applique migration + configure env + démarre serveur

set -e

echo "🚀 Configuration Tests Locaux - Gestion Dynamique Providers"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Vérifier PostgreSQL
echo "📊 Step 1/5: Vérification PostgreSQL..."
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✅ psql trouvé${NC}"

    # Tenter connexion
    if psql -U postgres -d qadhya_dev -c "SELECT 1;" &> /dev/null; then
        echo -e "${GREEN}✅ Connexion PostgreSQL OK${NC}"
    else
        echo -e "${YELLOW}⚠️  Connexion échouée. Essayer avec Docker?${NC}"
        echo "   docker exec qadhya-postgres psql -U postgres -d qadhya_dev -c 'SELECT 1;'"
    fi
else
    echo -e "${YELLOW}⚠️  psql non trouvé. PostgreSQL via Docker?${NC}"
    echo "   Vérifier: docker ps | grep postgres"
fi
echo ""

# Step 2: Appliquer migration
echo "📦 Step 2/5: Application migration SQL..."
MIGRATION_FILE="migrations/20260215_create_operation_provider_configs.sql"

if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}✅ Migration trouvée: $MIGRATION_FILE${NC}"

    # Tenter avec psql local
    if command -v psql &> /dev/null; then
        echo "   Commande à exécuter manuellement si nécessaire:"
        echo -e "${YELLOW}   psql -U postgres -d qadhya_dev -f $MIGRATION_FILE${NC}"
    fi

    # Alternative Docker
    echo ""
    echo "   Ou via Docker:"
    echo -e "${YELLOW}   docker exec -i qadhya-postgres psql -U postgres -d qadhya_dev < $MIGRATION_FILE${NC}"

else
    echo -e "${RED}❌ Migration non trouvée: $MIGRATION_FILE${NC}"
    exit 1
fi
echo ""

# Step 3: Vérifier tables créées
echo "🔍 Step 3/5: Vérification tables créées..."
echo "   Commande à exécuter après migration:"
echo -e "${YELLOW}   psql -U postgres -d qadhya_dev -c \"SELECT COUNT(*) FROM operation_provider_configs;\"${NC}"
echo "   Attendu: 6 rows"
echo ""

# Step 4: Configuration .env.local
echo "⚙️  Step 4/5: Configuration feature flag..."
ENV_FILE=".env.local"

if [ -f "$ENV_FILE" ]; then
    if grep -q "DYNAMIC_OPERATION_CONFIG=true" "$ENV_FILE"; then
        echo -e "${GREEN}✅ Feature flag déjà activé${NC}"
    else
        echo -e "${YELLOW}⚠️  Feature flag non trouvé, ajout...${NC}"
        echo "" >> "$ENV_FILE"
        echo "# Gestion Dynamique Providers (Feb 2026)" >> "$ENV_FILE"
        echo "DYNAMIC_OPERATION_CONFIG=true" >> "$ENV_FILE"
        echo -e "${GREEN}✅ Feature flag ajouté${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env.local non trouvé, création...${NC}"
    echo "# Gestion Dynamique Providers (Feb 2026)" > "$ENV_FILE"
    echo "DYNAMIC_OPERATION_CONFIG=true" >> "$ENV_FILE"
    echo -e "${GREEN}✅ .env.local créé${NC}"
fi
echo ""

# Step 5: Instructions démarrage
echo "🚀 Step 5/5: Démarrage serveur..."
echo "   Exécuter:"
echo -e "${GREEN}   npm run dev${NC}"
echo ""
echo "   Puis ouvrir:"
echo -e "${GREEN}   http://localhost:7002/super-admin/settings?tab=ai-architecture${NC}"
echo ""

# Summary
echo "📋 RÉSUMÉ DES ACTIONS:"
echo ""
echo "✅ Ce qui a été fait automatiquement:"
echo "   - Vérification PostgreSQL"
echo "   - Configuration .env.local (feature flag)"
echo ""
echo "⚠️  À faire manuellement:"
echo "   1. Appliquer migration SQL (voir commandes ci-dessus)"
echo "   2. Vérifier 6 rows insérées"
echo "   3. Démarrer serveur: npm run dev"
echo "   4. Ouvrir UI: http://localhost:7002/super-admin/settings?tab=ai-architecture"
echo ""
echo "📚 Documentation:"
echo "   - Guide: docs/DYNAMIC_PROVIDERS_README.md"
echo "   - Impl:  docs/DYNAMIC_PROVIDERS_IMPLEMENTATION.md"
echo ""
echo "🎉 Configuration terminée!"
