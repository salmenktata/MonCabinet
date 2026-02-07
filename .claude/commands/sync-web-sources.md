# Skill: Synchronisation Web Sources Dev → Prod

Synchronise les sources web et pages crawlées de dev vers prod **sans écraser** les données existantes (UPSERT).

## Tables synchronisées

| Table | Description |
|-------|-------------|
| `web_sources` | Configuration des sources web à crawler |
| `web_pages` | Pages web crawlées (contenu) |
| `web_files` | Fichiers téléchargés depuis le web |
| `knowledge_base` | Documents (sans chunks) |

## Arguments

| Argument | Description |
|----------|-------------|
| (aucun) | Export + copie + import UPSERT complet |
| `--export` | Export local uniquement (sans envoi) |
| `--status` | Afficher l'état des web sources en prod |
| `--diff` | Comparer web sources dev vs prod |

## Instructions (mode par défaut)

### Étape 1 : Vérifier que Docker tourne

```bash
docker ps --filter "name=postgres" --format "table {{.Names}}\t{{.Status}}"
```

### Étape 2 : Exporter les web sources

```bash
bash scripts/sync-web-sources.sh
```

### Étape 3 : Copier vers le VPS

```bash
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r exports/ "$VPS_USER@$VPS_HOST:/opt/moncabinet/"
```

### Étape 4 : Importer en production (UPSERT)

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'IMPORT_SCRIPT'
set -e
cd /opt/moncabinet/exports

echo "=== Import Web Sources (UPSERT - sans perte de données) ==="

# Trouver les fichiers les plus récents
LATEST=$(ls -t web_sources_*.csv 2>/dev/null | head -1 | sed 's/web_sources_\(.*\)\.csv/\1/')

if [ -z "$LATEST" ]; then
  echo "ERREUR: Aucun fichier web_sources trouvé"
  exit 1
fi

echo "Timestamp: $LATEST"

# Stats avant import
echo ""
echo "=== État AVANT import ==="
docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL
SELECT 'web_sources' as t, COUNT(*) as count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY t;
EOSQL

# Import via Docker avec UPSERT
docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL

-- Désactiver les triggers temporairement
SET session_replication_role = replica;

-- 1. web_sources (ON CONFLICT DO NOTHING)
CREATE TEMP TABLE tmp_web_sources (LIKE web_sources INCLUDING ALL);
\copy tmp_web_sources FROM '/exports/web_sources_${LATEST}.csv' WITH CSV HEADER;
INSERT INTO web_sources SELECT * FROM tmp_web_sources
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_sources;

-- 2. web_pages (ON CONFLICT DO NOTHING)
CREATE TEMP TABLE tmp_web_pages (LIKE web_pages INCLUDING ALL);
\copy tmp_web_pages FROM '/exports/web_pages_${LATEST}.csv' WITH CSV HEADER;
INSERT INTO web_pages SELECT * FROM tmp_web_pages
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_pages;

-- 3. web_files (ON CONFLICT DO NOTHING)
CREATE TEMP TABLE tmp_web_files (LIKE web_files INCLUDING ALL);
\copy tmp_web_files FROM '/exports/web_files_${LATEST}.csv' WITH CSV HEADER;
INSERT INTO web_files SELECT * FROM tmp_web_files
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_web_files;

-- 4. knowledge_base (ON CONFLICT DO NOTHING)
CREATE TEMP TABLE tmp_kb (LIKE knowledge_base INCLUDING ALL);
\copy tmp_kb FROM '/exports/knowledge_base_${LATEST}.csv' WITH CSV HEADER;
INSERT INTO knowledge_base SELECT * FROM tmp_kb
ON CONFLICT (id) DO NOTHING;
DROP TABLE tmp_kb;

-- Réactiver les triggers
SET session_replication_role = DEFAULT;

EOSQL

# Stats après import
echo ""
echo "=== État APRÈS import ==="
docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL
SELECT 'web_sources' as t, COUNT(*) as count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY t;
EOSQL

echo ""
echo "=== Import UPSERT terminé ==="
echo ""
echo "Prochaine étape: Lancer l'indexation avec /reindex-prod"
IMPORT_SCRIPT
```

### Étape 5 : Vérification

```bash
echo "Sync terminée! Pour relancer l'indexation en prod:"
echo "  /reindex-prod"
```

## Commandes par argument

### --export : Export local uniquement

```bash
bash scripts/sync-web-sources.sh
echo ""
echo "Export terminé. Fichiers dans exports/"
ls -lh exports/web_*.csv exports/knowledge_base_*.csv 2>/dev/null | tail -8
```

### --status : État des web sources en production

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'STATUS_SCRIPT'
echo "=== Web Sources en production ==="
docker exec moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL
SELECT 'web_sources' as table_name, COUNT(*) as count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY table_name;

\echo ''
\echo '=== Détail web_sources ==='
SELECT id, name, url, status, last_crawled_at::date as last_crawl
FROM web_sources
ORDER BY last_crawled_at DESC NULLS LAST;
EOSQL
STATUS_SCRIPT
```

### --diff : Comparer web sources dev vs prod

```bash
echo "=== Web Sources en DEV ==="
docker exec -i $(docker ps -qf "name=postgres" | head -1) psql -U moncabinet -d moncabinet -c "
SELECT 'web_sources' as table_name, COUNT(*) as dev_count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY table_name;"

echo ""
echo "=== Web Sources en PROD ==="
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c \"
SELECT 'web_sources' as table_name, COUNT(*) as prod_count FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
ORDER BY table_name;\""
```

## Prérequis

- Docker doit tourner localement (PostgreSQL dev)
- Variables d'environnement VPS configurées (`VPS_HOST`, `VPS_USER`, `VPS_PASSWORD`)
- `sshpass` installé

## Notes importantes

- **UPSERT** : Ajoute uniquement les nouvelles entrées, ne remplace pas les données existantes
- Après sync, lancer `/reindex-prod` pour générer les embeddings des nouveaux documents
- Les chunks ne sont pas synchronisés (ré-indexation en prod)
