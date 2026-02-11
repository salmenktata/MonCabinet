#!/bin/bash

# Script de déploiement de la source 9anoun.tn en production
# Usage : ./scripts/deploy-9anoun-source-prod.sh

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   🚀 DÉPLOIEMENT SOURCE 9ANOUN.TN EN PRODUCTION               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Variables
VPS_HOST="root@84.247.165.187"
DB_NAME="qadhya"
DB_USER="moncabinet"

echo "📡 Connexion au VPS..."
echo ""

# Étape 1 : Vérifier que le déploiement est terminé
echo "1️⃣  Vérification du déploiement..."
ssh $VPS_HOST "docker ps | grep qadhya-nextjs | grep -q healthy"
if [ $? -eq 0 ]; then
    echo "✅ Container qadhya-nextjs est healthy"
else
    echo "⚠️  Container qadhya-nextjs pas encore healthy, attente 30 sec..."
    sleep 30
fi
echo ""

# Étape 2 : Copier le fichier SQL vers le VPS
echo "2️⃣  Copie du fichier SQL vers le VPS..."
scp scripts/insert-9anoun-source.sql $VPS_HOST:/tmp/
echo "✅ Fichier copié"
echo ""

# Étape 3 : Exécuter le SQL
echo "3️⃣  Insertion de la source web en base de données..."
ssh $VPS_HOST "docker exec qadhya-postgres psql -U $DB_USER -d $DB_NAME -f /tmp/insert-9anoun-source.sql"
echo ""

# Étape 4 : Récupérer l'ID de la source créée
echo "4️⃣  Récupération de l'ID de la source..."
SOURCE_ID=$(ssh $VPS_HOST "docker exec qadhya-postgres psql -U $DB_USER -d $DB_NAME -t -c \"SELECT id FROM web_sources WHERE base_url LIKE '%9anoun.tn%' ORDER BY created_at DESC LIMIT 1;\"" | tr -d ' ')
echo "✅ Source ID : $SOURCE_ID"
echo ""

# Étape 5 : Vérifier la configuration
echo "5️⃣  Vérification de la configuration..."
ssh $VPS_HOST "docker exec qadhya-postgres psql -U $DB_USER -d $DB_NAME -c \"SELECT name, base_url, requires_javascript, follow_links, max_pages, array_length(seed_urls, 1) as nb_seed_urls FROM web_sources WHERE id = '$SOURCE_ID';\""
echo ""

# Étape 6 : Afficher les prochaines étapes
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   ✅ SOURCE CONFIGURÉE AVEC SUCCÈS !                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 RÉSUMÉ :"
echo "   - Source ID : $SOURCE_ID"
echo "   - Nom : 9anoun.tn - Codes Juridiques (Hybride Optimisé)"
echo "   - Seed URLs : 54 codes juridiques"
echo "   - Mode : Hybride (Playwright + Fetch Static)"
echo ""
echo "🚀 LANCER LE CRAWL :"
echo ""
echo "   Option A : Via Interface Web"
echo "   URL : https://qadhya.tn/super-admin/web-sources/$SOURCE_ID"
echo "   Action : Cliquer sur 'Démarrer Crawl'"
echo ""
echo "   Option B : Via API"
echo "   curl -X POST https://qadhya.tn/api/admin/web-sources/$SOURCE_ID/crawl \\"
echo "     -H \"Authorization: Bearer \$ADMIN_TOKEN\""
echo ""
echo "📈 MONITORING :"
echo "   Dashboard : https://qadhya.tn/super-admin/web-sources/$SOURCE_ID"
echo "   Logs : ssh $VPS_HOST 'docker logs -f qadhya-nextjs | grep Crawler'"
echo ""
echo "⏱️  PERFORMANCE ATTENDUE :"
echo "   - Phase 1 : 54 pages d'accueil en ~13 min"
echo "   - Phase 2 : Articles en ~10-30 sec (fetch static)"
echo "   - Total : 15-20 minutes 🚀"
echo ""
