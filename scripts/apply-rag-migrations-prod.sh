#!/bin/bash
# Script d'application des migrations RAG en production
# Usage: bash scripts/apply-rag-migrations-prod.sh

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Application Migrations RAG - Production"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier qu'on est sur le VPS
if [ ! -f /opt/qadhya/.env.production.local ]; then
  echo "❌ Ce script doit être exécuté sur le VPS (dans /opt/qadhya)"
  exit 1
fi

# Backup DB avant migration
echo ""
echo "📦 Étape 1: Backup base de données..."
BACKUP_DIR="/opt/backups/moncabinet"
BACKUP_FILE="${BACKUP_DIR}/pre-rag-migration-$(date +%Y%m%d-%H%M%S).sql"

docker exec qadhya-postgres pg_dump -U moncabinet qadhya > "$BACKUP_FILE"
gzip "$BACKUP_FILE"

echo "✓ Backup créé: ${BACKUP_FILE}.gz"

# Migration 1: OpenAI Embeddings
echo ""
echo "🔧 Étape 2: Migration OpenAI Embeddings..."

docker exec -i qadhya-postgres psql -U moncabinet -d qadhya <<'EOF'
-- Vérifier si déjà appliquée
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_base_chunks'
      AND column_name = 'embedding_openai'
  ) THEN
    RAISE NOTICE 'Application migration OpenAI embeddings...';
  ELSE
    RAISE NOTICE 'Migration OpenAI embeddings déjà appliquée, skip';
  END IF;
END $$;
EOF

# Appliquer migration OpenAI
if docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "\d knowledge_base_chunks" | grep -q "embedding_openai"; then
  echo "✓ Migration OpenAI déjà appliquée"
else
  echo "  Application de la migration..."
  docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < migrations/2026-02-12-add-openai-embeddings.sql
  echo "✓ Migration OpenAI appliquée"
fi

# Migration 2: Hybrid Search
echo ""
echo "🔧 Étape 3: Migration Hybrid Search..."

# Appliquer migration Hybrid
if docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "\d knowledge_base_chunks" | grep -q "content_tsvector"; then
  echo "✓ Migration Hybrid Search déjà appliquée"
else
  echo "  Application de la migration..."
  docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < migrations/2026-02-12-add-hybrid-search.sql
  echo "✓ Migration Hybrid Search appliquée"
fi

# Vérification migrations
echo ""
echo "🔍 Étape 4: Vérification migrations..."

docker exec qadhya-postgres psql -U moncabinet -d qadhya <<'EOF'
-- Vérifier colonnes
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_base_chunks' AND column_name = 'embedding_openai')
    THEN '✓ Colonne embedding_openai existe'
    ELSE '✗ Colonne embedding_openai MANQUANTE'
  END;

SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_base_chunks' AND column_name = 'content_tsvector')
    THEN '✓ Colonne content_tsvector existe'
    ELSE '✗ Colonne content_tsvector MANQUANTE'
  END;

-- Vérifier fonctions
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'search_knowledge_base_flexible')
    THEN '✓ Fonction search_knowledge_base_flexible existe'
    ELSE '✗ Fonction search_knowledge_base_flexible MANQUANTE'
  END;

SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'search_knowledge_base_hybrid')
    THEN '✓ Fonction search_knowledge_base_hybrid existe'
    ELSE '✗ Fonction search_knowledge_base_hybrid MANQUANTE'
  END;

-- Stats migration
SELECT * FROM vw_kb_embedding_migration_stats;
SELECT * FROM vw_kb_search_coverage;
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Migrations RAG appliquées avec succès !"
echo ""
echo "📋 Prochaines étapes:"
echo "  1. Déployer le code: git push origin main"
echo "  2. Réindexer avec OpenAI: npx tsx scripts/reindex-kb-openai.ts"
echo "  3. Tester: npx tsx scripts/test-rag-complete-e2e.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
