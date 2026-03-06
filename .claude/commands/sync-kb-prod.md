# Sync KB Prod → Dev

Remplace les tables KB locales par les données de production.

**Avant / Après :** ~48,939 chunks locaux → ~69,284 chunks prod

## Implémentation

Exécuter les étapes suivantes dans l'ordre :

### Étape 1 — Dump prod (dans le container, puis copie sur l'hôte)

```bash
ssh moncabinet-prod "docker exec qadhya-postgres pg_dump \
  -U moncabinet -d qadhya \
  --no-owner --no-acl \
  -t web_sources -t knowledge_base -t knowledge_base_chunks \
  -F c -f /tmp/kb_prod_dump.dump && echo 'Dump OK'"

ssh moncabinet-prod "docker cp qadhya-postgres:/tmp/kb_prod_dump.dump /tmp/kb_prod_dump.dump && ls -lh /tmp/kb_prod_dump.dump"
```

### Étape 2 — Transfert en local (~1 Go, quelques minutes)

```bash
scp moncabinet-prod:/tmp/kb_prod_dump.dump /tmp/kb_prod_dump.dump
echo "Transfert terminé : $(ls -lh /tmp/kb_prod_dump.dump)"
```

### Étape 3 — Vider les tables locales (+ web_sources pour éviter les doublons)

```bash
LOCAL_PG=$(docker ps --format '{{.Names}}' | grep postgres | head -1)
docker exec -i $LOCAL_PG psql -U moncabinet -d qadhya \
  -c "TRUNCATE web_sources, knowledge_base_chunks, knowledge_base RESTART IDENTITY CASCADE;"
```

### Étape 4 — Désactiver le trigger redisearch + Restaurer

```bash
LOCAL_PG=$(docker ps --format '{{.Names}}' | grep postgres | head -1)

# Désactiver le trigger qui appelle redisearch_sync_status (absent en local)
docker exec -i $LOCAL_PG psql -U moncabinet -d qadhya \
  -c "ALTER TABLE knowledge_base_chunks DISABLE TRIGGER ALL;"

# Restaurer depuis le dump prod
PGPASSWORD="dev_password_change_in_production" \
  /opt/homebrew/opt/postgresql@15/bin/pg_restore \
  -h 127.0.0.1 -p 5433 -U moncabinet -d qadhya \
  --no-owner --no-acl --data-only \
  -t web_sources -t knowledge_base -t knowledge_base_chunks \
  /tmp/kb_prod_dump.dump

# Réactiver les triggers
docker exec -i $LOCAL_PG psql -U moncabinet -d qadhya \
  -c "ALTER TABLE knowledge_base_chunks ENABLE TRIGGER ALL;"
```

### Étape 5 — Vérification

```bash
LOCAL_PG=$(docker ps --format '{{.Names}}' | grep postgres | head -1)
docker exec -i $LOCAL_PG psql -U moncabinet -d qadhya \
  -c "SELECT count(*) AS chunks FROM knowledge_base_chunks; SELECT count(*) AS kb_docs FROM knowledge_base;"
```

### Étape 6 — Nettoyage

```bash
rm /tmp/kb_prod_dump.dump
ssh moncabinet-prod "rm -f /tmp/kb_prod_dump.dump"
```

## Résultat attendu

- `knowledge_base_chunks` : ~69,284 lignes
- `knowledge_base` : ~10,812 documents

## Notes importantes

- Le dump fait ~1 Go (vecteurs 768-dim × 69k chunks) — prévoir 5-10 min
- Si erreur `invalid input value for enum norm_level` : appliquer `migrations/20260304_extend_norm_level_enum.sql` d'abord
- Si erreur `column X does not exist` : appliquer les migrations manquantes depuis `db/migrations/` et `migrations/`
- Ne touche pas aux autres tables (users, dossiers, conversations, jurisprudence...)
