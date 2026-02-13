#!/bin/bash

# Script de Déploiement Phase 3.1 - Abrogations Production
# Exécute migration + seed sur VPS Qadhya

set -e

echo "🚀 Déploiement Phase 3.1 - Abrogations Juridiques"
echo "=================================================="
echo ""

VPS_HOST="${VPS_HOST:-84.247.165.187}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="/opt/moncabinet"

echo "📡 Connexion VPS: $VPS_USER@$VPS_HOST"
echo "📂 Répertoire: $VPS_PATH"
echo ""

# Vérifier que les fichiers existent
if [ ! -f "migrations/20260213_add_domain_legal_abrogations.sql" ]; then
  echo "❌ Erreur: Migration introuvable"
  exit 1
fi

if [ ! -f "scripts/seed-legal-abrogations-phase3.1.ts" ]; then
  echo "❌ Erreur: Script seed introuvable"
  exit 1
fi

if [ ! -f "data/abrogations/phase3.1-abrogations-consolidees.csv" ]; then
  echo "❌ Erreur: CSV abrogations introuvable"
  exit 1
fi

echo "✅ Fichiers locaux vérifiés"
echo ""

# 1. Copier fichiers vers VPS
echo "📤 Étape 1/4: Copie fichiers vers VPS..."

sshpass -p "$VPS_PASSWORD" scp \
  migrations/20260213_add_domain_legal_abrogations.sql \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/migrations/" || {
  echo "❌ Erreur copie migration"
  exit 1
}

sshpass -p "$VPS_PASSWORD" scp \
  scripts/seed-legal-abrogations-phase3.1.ts \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/scripts/" || {
  echo "❌ Erreur copie script seed"
  exit 1
}

sshpass -p "$VPS_PASSWORD" scp \
  scripts/migrate-add-domain.ts \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/scripts/" || {
  echo "❌ Erreur copie script migration"
  exit 1
}

sshpass -p "$VPS_PASSWORD" scp \
  data/abrogations/phase3.1-abrogations-consolidees.csv \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/data/abrogations/" || {
  echo "❌ Erreur copie CSV"
  exit 1
}

echo "✅ Fichiers copiés avec succès"
echo ""

# 2. Exécuter migration SQL
echo "📤 Étape 2/4: Exécution migration SQL..."

sshpass -p "$VPS_PASSWORD" ssh "$VPS_USER@$VPS_HOST" << 'MIGRATION'
set -e
cd /opt/moncabinet

echo "🔧 Exécution migration via script TypeScript..."

docker exec qadhya-nextjs npx tsx scripts/migrate-add-domain.ts

echo "✅ Migration exécutée avec succès"
MIGRATION

echo "✅ Migration terminée"
echo ""

# 3. Exécuter seed TypeScript
echo "📤 Étape 3/4: Exécution seed abrogations..."

sshpass -p "$VPS_PASSWORD" ssh "$VPS_USER@$VPS_HOST" << 'SEED'
set -e
cd /opt/moncabinet

echo "🌱 Exécution script seed Phase 3.1..."

docker exec qadhya-nextjs npx tsx scripts/seed-legal-abrogations-phase3.1.ts

echo "✅ Seed exécuté avec succès"
SEED

echo "✅ Seed terminé"
echo ""

# 4. Vérification
echo "📤 Étape 4/4: Vérification données..."

sshpass -p "$VPS_PASSWORD" ssh "$VPS_USER@$VPS_HOST" << 'VERIFY'
set -e

echo "📊 Statistiques base de données:"

docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT
    COUNT(*) as total_abrogations,
    COUNT(*) FILTER (WHERE verified = true) as verified,
    COUNT(*) FILTER (WHERE verified = false) as pending
  FROM legal_abrogations;
"

echo ""
echo "📈 Répartition par domaine:"

docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT domain, COUNT(*) as count
  FROM legal_abrogations
  WHERE domain IS NOT NULL
  GROUP BY domain
  ORDER BY count DESC;
"

echo ""
echo "📅 Abrogations récentes (2022-2025):"

docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT
    abrogated_reference,
    abrogating_reference,
    abrogation_date,
    domain,
    verified
  FROM legal_abrogations
  WHERE abrogation_date >= '2022-01-01'
  ORDER BY abrogation_date DESC
  LIMIT 10;
"
VERIFY

echo ""
echo "=================================================="
echo "✨ Déploiement Phase 3.1 terminé avec succès!"
echo "=================================================="
echo ""
echo "🎯 Prochaines étapes:"
echo "  - Vérifier API: https://qadhya.tn/api/legal/abrogations"
echo "  - Tester interface consultation abrogations"
echo "  - Monitorer logs: docker logs qadhya-nextjs"
echo ""
