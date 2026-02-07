# Skill: Synchronisation Base de Connaissances vers Production

Exporte et synchronise la base de connaissances, templates, indexation et clés API depuis l'environnement de développement vers la production.

## Modes de synchronisation

| Mode | Description |
|------|-------------|
| (par défaut) | Sync complète - **REMPLACE** toutes les données |
| `--web-sources` | Sync web sources - **AJOUTE** sans écraser (UPSERT) |
| `--files` | Sync fichiers MinIO DEV → PROD (incrémental) |
| `--web-sources --files` | Sync métadonnées + fichiers PDF |

## Données synchronisées (mode par défaut)

| Table | Description |
|-------|-------------|
| `platform_config` | Clés API (Groq, OpenAI, Resend, Brevo, etc.) |
| `knowledge_base` | Documents de la base de connaissances |
| `knowledge_base_chunks` | Embeddings/indexation vectorielle |
| `knowledge_categories` | Catégories de documents |
| `templates` | Templates de documents juridiques |

## Données synchronisées (mode --web-sources)

| Table | Description |
|-------|-------------|
| `web_sources` | Configuration des sources web à crawler |
| `web_pages` | Pages web crawlées (contenu) |
| `web_files` | Fichiers téléchargés depuis le web |
| `knowledge_base` | Documents (sans chunks, ré-indexation en prod) |

## Instructions

### Étape 1 : Vérifier que Docker tourne

```bash
docker ps --filter "name=postgres" --format "table {{.Names}}\t{{.Status}}"
```

Si aucun container PostgreSQL n'est affiché, démarrer Docker.

### Étape 2 : Exporter les données

```bash
npm run sync:export
```

Ou exécuter directement :

```bash
bash scripts/sync-to-prod.sh
```

Résultat attendu : fichiers CSV créés dans `exports/`

### Étape 3 : Afficher le résumé de l'export

```bash
echo "=== Fichiers exportés ===" && ls -lh exports/*.csv 2>/dev/null | tail -5
```

### Étape 4 : Copier vers le VPS

```bash
# Copier le dossier exports vers le VPS
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r exports/ "$VPS_USER@$VPS_HOST:/opt/moncabinet/"
```

### Étape 5 : Importer en production

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'IMPORT_SCRIPT'
set -e
cd /opt/moncabinet/exports

echo "=== Import des données en production ==="

# Trouver les fichiers les plus récents
LATEST=$(ls -t platform_config_*.csv 2>/dev/null | head -1 | sed 's/platform_config_\(.*\)\.csv/\1/')

if [ -z "$LATEST" ]; then
  echo "ERREUR: Aucun fichier d'export trouvé"
  exit 1
fi

echo "Timestamp: $LATEST"

# Import via Docker
docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL

-- Désactiver les contraintes temporairement
SET session_replication_role = replica;

-- 1. platform_config
DELETE FROM platform_config;
\copy platform_config FROM '/exports/platform_config_${LATEST}.csv' WITH CSV HEADER;

-- 2. knowledge_categories
DELETE FROM knowledge_categories;
\copy knowledge_categories FROM '/exports/knowledge_categories_${LATEST}.csv' WITH CSV HEADER;

-- 3. knowledge_base
DELETE FROM knowledge_base;
\copy knowledge_base FROM '/exports/knowledge_base_${LATEST}.csv' WITH CSV HEADER;

-- 4. knowledge_base_chunks
DELETE FROM knowledge_base_chunks;
\copy knowledge_base_chunks FROM '/exports/knowledge_base_chunks_${LATEST}.csv' WITH CSV HEADER;

-- 5. templates
DELETE FROM templates;
\copy templates FROM '/exports/templates_${LATEST}.csv' WITH CSV HEADER;

-- Réactiver les contraintes
SET session_replication_role = DEFAULT;

-- Vérification
SELECT 'Import terminé' as status;
SELECT 'platform_config' as table_name, COUNT(*) as count FROM platform_config
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
UNION ALL SELECT 'knowledge_base_chunks', COUNT(*) FROM knowledge_base_chunks
UNION ALL SELECT 'knowledge_categories', COUNT(*) FROM knowledge_categories
UNION ALL SELECT 'templates', COUNT(*) FROM templates;

EOSQL

echo "=== Import terminé avec succès ==="
IMPORT_SCRIPT
```

### Étape 6 : Vérification

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c \"SELECT 'knowledge_base' as t, COUNT(*) FROM knowledge_base UNION ALL SELECT 'templates', COUNT(*) FROM templates;\""
```

## Arguments

| Argument | Description |
|----------|-------------|
| (aucun) | Export + copie + import complet (REMPLACE tout) |
| `--web-sources` | Sync web sources UPSERT (AJOUTE sans écraser) |
| `--files` | Sync fichiers MinIO DEV → PROD (incrémental) |
| `--web-sources --files` | Sync métadonnées + fichiers PDF |
| `--export` | Export local uniquement (sans envoi) |
| `--status` | Afficher l'état des données en prod |
| `--diff` | Comparer dev et prod |

## Commandes par argument

### --web-sources : Sync web sources (UPSERT)

```bash
echo "=== Sync Web Sources DEV → PROD (UPSERT) ==="
bash scripts/sync-web-sources.sh
```

Puis copier vers le VPS et importer:

```bash
# Copier les fichiers vers le VPS
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r exports/ "$VPS_USER@$VPS_HOST:/opt/moncabinet/"
```

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
echo "Note: Lancez l'indexation pour générer les embeddings des nouveaux documents"
echo "      curl -X GET 'http://localhost:3000/api/cron/web-crawler'"
IMPORT_SCRIPT
```

### --files : Synchroniser les fichiers PDF (MinIO)

```bash
echo "=== Sync Fichiers MinIO DEV → PROD ==="
bash scripts/sync-minio-files.sh
```

### --web-sources --files : Sync complète web sources

```bash
# 1. Sync métadonnées (base de données)
echo "=== Étape 1/2: Sync métadonnées ==="
bash scripts/sync-web-sources.sh
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r exports/ "$VPS_USER@$VPS_HOST:/opt/moncabinet/"
```

Puis importer les métadonnées:

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

echo "=== Import métadonnées terminé ==="
IMPORT_SCRIPT
```

Puis synchroniser les fichiers MinIO:

```bash
# 2. Sync fichiers MinIO
echo ""
echo "=== Étape 2/2: Sync fichiers MinIO ==="
bash scripts/sync-minio-files.sh

echo ""
echo "✅ Sync complète terminée (métadonnées + fichiers)"
```

### --export : Export local uniquement

```bash
bash scripts/sync-to-prod.sh
echo "Export terminé. Fichiers dans exports/"
ls -lh exports/*.csv | tail -5
```

### --status : État des données en production

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'STATUS_SCRIPT'
echo "=== Données en production ==="
docker exec moncabinet-postgres psql -U moncabinet -d moncabinet << EOSQL
SELECT 'platform_config' as table_name, COUNT(*) as count FROM platform_config
UNION ALL SELECT 'knowledge_base', COUNT(*) FROM knowledge_base
UNION ALL SELECT 'knowledge_base_chunks', COUNT(*) FROM knowledge_base_chunks
UNION ALL SELECT 'knowledge_categories', COUNT(*) FROM knowledge_categories
UNION ALL SELECT 'templates', COUNT(*) FROM templates
UNION ALL SELECT 'web_sources', COUNT(*) FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
ORDER BY table_name;
EOSQL
STATUS_SCRIPT
```

### --diff : Comparer dev et prod

```bash
echo "=== Données en DEV ==="
docker exec -i $(docker ps -qf "name=postgres" | head -1) psql -U moncabinet -d moncabinet -c "
SELECT 'knowledge_base' as table_name, COUNT(*) as dev_count FROM knowledge_base
UNION ALL SELECT 'templates', COUNT(*) FROM templates
UNION ALL SELECT 'platform_config', COUNT(*) FROM platform_config
UNION ALL SELECT 'web_sources', COUNT(*) FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
ORDER BY table_name;"

echo ""
echo "=== Données en PROD ==="
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c \"
SELECT 'knowledge_base' as table_name, COUNT(*) as prod_count FROM knowledge_base
UNION ALL SELECT 'templates', COUNT(*) FROM templates
UNION ALL SELECT 'platform_config', COUNT(*) FROM platform_config
UNION ALL SELECT 'web_sources', COUNT(*) FROM web_sources
UNION ALL SELECT 'web_pages', COUNT(*) FROM web_pages
UNION ALL SELECT 'web_files', COUNT(*) FROM web_files
ORDER BY table_name;\""
```

## Prérequis

- Docker doit tourner localement (PostgreSQL dev)
- Variables d'environnement VPS configurées :
  - `VPS_HOST`
  - `VPS_USER`
  - `VPS_PASSWORD`
- `sshpass` installé (`brew install sshpass` ou `brew install hudochenkov/sshpass/sshpass`)

## Workflow recommandé

### Sync complète (remplace tout)
1. Développer et tester en local
2. Ajouter documents à la base de connaissances
3. Indexer les documents (embeddings)
4. `/sync-prod` pour synchroniser vers la prod
5. `/sync-prod --status` pour vérifier

### Sync web sources (ajoute sans écraser)
1. Crawler les nouvelles sources en dev
2. `/sync-prod --web-sources` pour synchroniser les métadonnées
3. Lancer l'indexation en prod après sync:
   ```bash
   /vps "curl -X GET 'http://localhost:3000/api/cron/web-crawler'"
   ```
4. `/sync-prod --status` pour vérifier

### Sync web sources complète avec fichiers PDF
1. Crawler les nouvelles sources en dev (pages + fichiers PDF)
2. `/sync-prod --web-sources --files` pour synchroniser métadonnées ET fichiers
3. Lancer l'indexation en prod après sync:
   ```bash
   /vps "curl -X GET 'http://localhost:3000/api/cron/web-crawler'"
   ```
4. `/sync-prod --status` pour vérifier

### Sync fichiers uniquement
- `/sync-prod --files` pour synchroniser uniquement les fichiers MinIO (incrémental)

## Résumé des commandes

```bash
# Sync complète - REMPLACE tout
/sync-prod

# Sync web sources - AJOUTE sans écraser (métadonnées uniquement)
/sync-prod --web-sources

# Sync fichiers MinIO - AJOUTE sans écraser (fichiers PDF uniquement)
/sync-prod --files

# Sync web sources complète - métadonnées + fichiers PDF
/sync-prod --web-sources --files

# Vérifier état prod
/sync-prod --status

# Comparer dev et prod
/sync-prod --diff

# Lancer indexation en prod après sync
/vps "curl -X GET 'http://localhost:3000/api/cron/web-crawler'"
```

## Notes importantes

- **Mode par défaut** : Les embeddings sont copiés tels quels (pas de ré-indexation en prod)
- **Mode --web-sources** : UPSERT - ajoute uniquement les nouvelles entrées, les données existantes en prod sont préservées
- Les clés API sont synchronisées depuis `platform_config` (mode par défaut uniquement)
- Toujours faire un backup avant en prod si nécessaire
- Après `--web-sources`, lancer l'indexation pour générer les embeddings des nouveaux documents
