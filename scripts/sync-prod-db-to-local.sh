#!/bin/bash
#
# Script pour synchroniser la base de données de production vers le local
# Usage: ./scripts/sync-prod-db-to-local.sh
#

set -e

REMOTE_HOST="root@84.247.165.187"
CONTAINER_NAME="qadhya-postgres"
DB_NAME="qadhya"
DB_USER="moncabinet"
DUMP_FILE="/tmp/qadhya-prod-$(date +%Y%m%d_%H%M%S).sql"

echo "🔄 Synchronisation de la base de données de production vers le local..."
echo ""

# Étape 1: Dump de la base de production
echo "📥 1/3 - Création du dump depuis la production..."
ssh $REMOTE_HOST "docker exec $CONTAINER_NAME pg_dump -U $DB_USER -d $DB_NAME --clean --if-exists" > "$DUMP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Dump créé: $DUMP_FILE ($(du -h $DUMP_FILE | cut -f1))"
else
    echo "❌ Erreur lors de la création du dump"
    exit 1
fi

# Étape 2: Arrêter le serveur Next.js si actif
echo ""
echo "🛑 2/3 - Arrêt du serveur Next.js local..."
lsof -ti:7002 | xargs kill -9 2>/dev/null || true
sleep 2

# Étape 3: Restaurer le dump dans la base locale
echo ""
echo "📤 3/3 - Restauration du dump dans la base locale..."
docker exec -i qadhya-postgres psql -U $DB_USER -d $DB_NAME < "$DUMP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Base de données restaurée avec succès"
    echo ""
    echo "📊 Statistiques:"
    docker exec qadhya-postgres psql -U $DB_USER -d $DB_NAME -c "
        SELECT
            schemaname,
            COUNT(*) as tables
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY schemaname
        ORDER BY tables DESC;
    "
    echo ""
    echo "✅ Synchronisation terminée avec succès!"
    echo "💡 Vous pouvez maintenant lancer le serveur avec: npm run dev"
    echo "📝 Dump sauvegardé: $DUMP_FILE"
else
    echo "❌ Erreur lors de la restauration"
    exit 1
fi
