#!/bin/bash
#
# Script: Nettoyage des données orphelines web sources
# Date: 2026-02-11
# Usage: ./scripts/cleanup-orphaned-web-data.sh [prod|local]
#

set -e

ENV=${1:-local}

if [ "$ENV" = "prod" ]; then
  echo "🔍 Nettoyage des données orphelines en PRODUCTION..."
  PSQL_CMD="ssh root@84.247.165.187 docker exec -i qadhya-postgres psql -U moncabinet -d qadhya"
else
  echo "🔍 Nettoyage des données orphelines en LOCAL..."
  PSQL_CMD="docker exec -i moncabinet-postgres psql -U moncabinet -d qadhya"
fi

echo ""
echo "📊 Identification des données orphelines..."

$PSQL_CMD <<EOF
-- Identifier les données orphelines
SELECT
  'web_pages' as table_name,
  COUNT(*) as orphan_count
FROM web_pages wp
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = wp.web_source_id)
UNION ALL
SELECT
  'web_page_versions' as table_name,
  COUNT(*) as orphan_count
FROM web_page_versions wpv
WHERE NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.id = wpv.web_page_id)
UNION ALL
SELECT
  'web_page_structured_metadata' as table_name,
  COUNT(*) as orphan_count
FROM web_page_structured_metadata wpsm
WHERE NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.id = wpsm.web_page_id)
UNION ALL
SELECT
  'web_crawl_logs' as table_name,
  COUNT(*) as orphan_count
FROM web_crawl_logs wcl
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = wcl.web_source_id)
UNION ALL
SELECT
  'web_files' as table_name,
  COUNT(*) as orphan_count
FROM web_files wf
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = wf.web_source_id);
EOF

echo ""
read -p "⚠️  Voulez-vous supprimer ces données orphelines ? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Annulé"
  exit 0
fi

echo ""
echo "🗑️  Suppression des données orphelines..."

$PSQL_CMD <<EOF
BEGIN;

-- Sauvegarder les IDs des pages orphelines
CREATE TEMP TABLE orphan_pages AS
SELECT id FROM web_pages wp
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = wp.web_source_id);

-- Supprimer les versions des pages orphelines
DELETE FROM web_page_versions
WHERE web_page_id IN (SELECT id FROM orphan_pages);

-- Supprimer les métadonnées des pages orphelines
DELETE FROM web_page_structured_metadata
WHERE web_page_id IN (SELECT id FROM orphan_pages);

-- Supprimer les pages orphelines
DELETE FROM web_pages
WHERE id IN (SELECT id FROM orphan_pages);

-- Supprimer les versions orphelines (dont la page n'existe plus)
DELETE FROM web_page_versions
WHERE NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.id = web_page_versions.web_page_id);

-- Supprimer les métadonnées orphelines
DELETE FROM web_page_structured_metadata
WHERE NOT EXISTS (SELECT 1 FROM web_pages wp WHERE wp.id = web_page_structured_metadata.web_page_id);

-- Supprimer les logs orphelins
DELETE FROM web_crawl_logs
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = web_crawl_logs.web_source_id);

-- Supprimer les fichiers orphelins
DELETE FROM web_files
WHERE NOT EXISTS (SELECT 1 FROM web_sources ws WHERE ws.id = web_files.web_source_id);

COMMIT;

SELECT '✅ Nettoyage terminé' as result;
EOF

echo ""
echo "✅ Nettoyage des données orphelines terminé !"
