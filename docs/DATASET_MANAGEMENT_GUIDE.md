# Guide de Gestion des Datasets

## Table des Matières

1. [Principes Fondamentaux](#principes-fondamentaux)
2. [Architecture des Environnements](#architecture-des-environnements)
3. [Configuration](#configuration)
4. [Scripts Disponibles](#scripts-disponibles)
5. [Workflow de Développement](#workflow-de-développement)
6. [Fixtures de Test](#fixtures-de-test)
7. [Troubleshooting](#troubleshooting)
8. [Règles de Sécurité](#règles-de-sécurité)

---

## Principes Fondamentaux

### Règle d'Or : Isolation Stricte

> **"Code en local, Données en prod"**
>
> **JAMAIS sync KB locale → prod**

La base de connaissances en production doit être remplie **uniquement** par crawl et indexation directe sur l'environnement de production. Aucun transfert de données depuis le développement local n'est autorisé.

### Pourquoi une Base de Test Séparée ?

1. **Isolation physique complète** : Aucun risque de pollution des données de production
2. **Reset rapide** : Recréer l'environnement de test en quelques secondes
3. **Pas de modification du schéma** : Pas besoin d'ajouter une colonne `environment`
4. **Compatible avec les migrations** : Réutilise toutes les migrations existantes

---

## Architecture des Environnements

| Environnement | Database | Redis DB | MinIO Bucket | Usage |
|---------------|----------|----------|--------------|-------|
| **Dev** | `qadhya` (port 5433) | DB 0 | `documents`, `web-files` | Développement quotidien |
| **Test** | `qadhya_test` (port 5433) | DB 1 | `test-documents`, `test-web-files` | Tests automatisés, fixtures |
| **Prod** | `moncabinet` (port 5432) | DB 0 | `documents`, `web-files` | Production (via tunnel SSH port 5434) |

### Configuration par Environnement

#### Dev (.env.local)
```bash
DATABASE_URL=postgresql://moncabinet:dev_password@localhost:5433/qadhya
REDIS_URL=redis://localhost:6379
MINIO_BUCKET=documents
```

#### Test (.env.test)
```bash
DATABASE_URL=postgresql://moncabinet:dev_password@localhost:5433/qadhya_test
REDIS_URL=redis://localhost:6379/1
MINIO_BUCKET=test-documents
ENABLE_WEB_CRAWLER_CRON=false
ENABLE_KB_INDEXING_CRON=false
```

#### Prod (via tunnel SSH)
```bash
# Sur VPS (84.247.165.187)
DATABASE_URL=postgresql://moncabinet:prod_password@localhost:5432/moncabinet
REDIS_URL=redis://localhost:6379
MINIO_BUCKET=documents
```

---

## Configuration

### Prérequis

- PostgreSQL (port 5433 pour dev/test)
- Redis (port 6379)
- MinIO (port 9000)
- Node.js 18+
- Docker (pour containers locaux)

### Setup Initial

```bash
# 1. Démarrer les services locaux (Docker)
docker-compose up -d

# 2. Créer la base de test + migrations
npm run test:db:create

# 3. Insérer des fixtures
npm run test:db:seed
```

---

## Scripts Disponibles

### Gestion Base de Test

#### `npm run test:db:create`
**Crée la base de test complète**

- Supprime la base existante (avec confirmation)
- Crée la base `qadhya_test`
- Active l'extension `pgvector`
- Applique toutes les migrations SQL
- Vérifie l'intégrité

**Usage :**
```bash
# Interactif (demande confirmation)
npm run test:db:create

# Mode CI (force, pas de confirmation)
npm run test:db:create -- --force
```

**Sortie attendue :**
```
🚀 Création de la base de données de test
📌 Base: qadhya_test
📌 Host: localhost:5433

🔨 Création de la base "qadhya_test"...
✅ Base "qadhya_test" créée avec succès

🔧 Activation de l'extension pgvector...
✅ Extension pgvector activée

📂 87 fichiers de migration trouvés

✅ 87 migrations appliquées avec succès!

✅ 87 migrations appliquées
✅ 76 tables créées
✅ Extension pgvector active

🎉 Base de test prête à l'emploi!
```

---

#### `npm run test:db:reset`
**Vide toutes les tables de test**

- Vérifie que `DATABASE_URL` pointe vers une base de test
- TRUNCATE toutes les tables (sauf `schema_migrations`)
- RESET les séquences (IDs recommencent à 1)
- Respecte les contraintes FK

**Usage :**
```bash
# Interactif (demande confirmation)
npm run test:db:reset

# Force (sans confirmation)
npm run test:db:reset:force

# Reset + Seed automatique
npm run test:db:reset:seed
```

**Sécurité :**
- Bloque si `DATABASE_URL` contient `/qadhya` sans `test`
- Bloque si pas de `test` dans l'URL

---

#### `npm run test:db:seed`
**Insère des fixtures standardisées**

Charge les fichiers JSON depuis `lib/test-db/fixtures/` et les insère dans la base.

**Usage :**
```bash
npm run test:db:seed
```

**Fixtures insérées :**
- 2 utilisateurs (user + admin)
- 3 sources web (cassation, 9anoun, da5ira)
- 10 documents KB (jurisprudence, codes, doctrine)
- 5 clients (personnes physiques et morales)
- 5 dossiers (statuts variés)

**Total :** ~50 entrées, <1 MB de données

---

#### `npm run test:db:snapshot`
**Crée un snapshot anonymisé de production**

⚠️ **UTILISER AVEC PRÉCAUTION**

- Se connecte à la base prod (via tunnel SSH port 5434)
- Exporte des données sélectives (pas d'utilisateurs)
- Anonymise les métadonnées sensibles
- Sauvegarde dans `test-db/snapshots/prod_YYYYMMDD.sql`

**Usage :**
```bash
# Démarrer le tunnel SSH vers prod
npm run tunnel:start

# Créer snapshot avec limite de 100 docs
npm run test:db:snapshot -- --limit 100

# Arrêter le tunnel
npm run tunnel:stop
```

**Données exportées :**
- ✅ `web_sources` (sans credentials)
- ✅ `web_pages` (limit N par source)
- ✅ `knowledge_base` (limit N docs)
- ❌ PAS d'utilisateurs (clients, dossiers, profiles)

---

#### `npm run test:db:compare`
**Compare schémas test vs prod**

Vérifie que la base de test est synchronisée avec production.

**Usage :**
```bash
npm run test:db:compare
```

**Compare :**
- Liste des tables
- Colonnes (types, nullable, default)
- Index (HNSW, BTREE, GIN)
- Contraintes FK, CHECK, UNIQUE
- Extensions (pgvector, etc.)

**Sortie :** Rapport diff avec ✅/❌ par élément

---

## Workflow de Développement

### Scénario 1 : Développer une Feature de Crawling

```bash
# 1. Setup initial (une fois)
npm run test:db:create
npm run test:db:seed

# 2. Développer la feature
npm run dev

# 3. Tester sur fixtures
# - Naviguer vers http://localhost:7002/super-admin/web-sources
# - Tester le crawl sur les 3 sources de test

# 4. Reset entre tests
npm run test:db:reset

# 5. Commit + Push
git add .
git commit -m "feat: nouvelle feature crawl"
git push origin main

# 6. Production (automatique)
# CI/CD déploie → Cron lance vrai crawl sur données réelles
```

---

### Scénario 2 : Développer une Feature d'Indexation

```bash
# 1. Créer base de test avec fixtures
npm run test:db:create
npm run test:db:seed

# 2. Développer la logique d'indexation
# Modifier lib/web-scraper/web-indexer-service.ts

# 3. Tester indexation sur 10 docs de test
npm run dev
# API: POST /api/admin/kb/index (batch de 2 docs)

# 4. Vérifier qualité des chunks
npm run audit:rag

# 5. Reset + retester
npm run test:db:reset:seed

# 6. Déployer en prod
git push origin main
# Cron indexation prod s'exécute toutes les 5 minutes
```

---

### Scénario 3 : Tests Automatisés (CI/CD)

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Database
        run: |
          npm run test:db:create -- --force
          npm run test:db:seed

      - name: Run Tests
        run: npm test
        env:
          DATABASE_URL: postgresql://moncabinet:dev_password@localhost:5433/qadhya_test
```

---

## Fixtures de Test

### Structure

```
lib/test-db/fixtures/
├── users.json           # 2 utilisateurs (regular + admin)
├── web-sources.json     # 3 sources web
├── knowledge-base.json  # 10 documents KB
├── clients.json         # 5 clients
└── dossiers.json        # 5 dossiers
```

### Format users.json

```json
[
  {
    "id": "test_user_1",
    "email": "test.user@qadhya.test",
    "name": "Utilisateur Test",
    "role": "user",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Format knowledge-base.json

```json
[
  {
    "id": 1,
    "title": "Code Civil Tunisien - Extrait Propriété",
    "category": "codes",
    "language": "fr",
    "file_url": "test/code-civil-propriete.pdf",
    "file_type": "application/pdf",
    "file_size": 51200,
    "metadata": {
      "source": "test_fixture",
      "tribunal": null
    },
    "is_indexed": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

### Modifier les Fixtures

1. Éditer le fichier JSON dans `lib/test-db/fixtures/`
2. Reset la base de test : `npm run test:db:reset`
3. Recharger les fixtures : `npm run test:db:seed`

---

## Troubleshooting

### Erreur : "database qadhya_test does not exist"

**Cause :** Base de test pas encore créée

**Solution :**
```bash
npm run test:db:create
```

---

### Erreur : FK constraint violation

**Cause :** Reset incomplet ou ordre d'insertion incorrect

**Solution :**
```bash
# Reset complet (force TRUNCATE CASCADE)
npm run test:db:reset:force

# Réinsérer fixtures
npm run test:db:seed
```

---

### Erreur : "Cannot DROP database (active connections)"

**Cause :** Connexions actives à la base de test

**Solution :**
```bash
# Arrêter le serveur dev
npm run stop

# Recréer la base
npm run test:db:create
```

---

### Données de test polluées

**Symptôme :** Tests échouent à cause de données invalides

**Solution :**
```bash
# Reset + seed en une commande
npm run test:db:reset:seed
```

---

### Schémas dev/test désynchronisés

**Symptôme :** Migrations appliquées en dev mais pas en test

**Solution :**
```bash
# Vérifier différences
npm run test:db:compare

# Recréer base de test avec toutes les migrations
npm run test:db:create
```

---

## Règles de Sécurité

### ✅ FAIRE

1. **Toujours vérifier `DATABASE_URL`** avant scripts destructifs
   ```bash
   echo $DATABASE_URL
   # Doit contenir "test" ou "qadhya_test"
   ```

2. **Utiliser `.env.test`** pour tests
   ```bash
   NODE_ENV=test npm run test
   ```

3. **Snapshots anonymisés uniquement**
   - Pas de données utilisateurs
   - Pas de credentials dans `web_sources`

4. **Confirmer avant DROP DATABASE** (sauf en CI)

### ❌ NE PAS FAIRE

1. **Sync KB locale → prod**
   ```bash
   # ❌ JAMAIS FAIRE ÇA
   pg_dump qadhya | psql moncabinet
   ```

2. **Reset sur base de production**
   ```bash
   # Scripts bloquent automatiquement si DATABASE_URL = prod
   npm run test:db:reset  # ❌ Erreur si prod
   ```

3. **Commit de données sensibles**
   ```bash
   # .gitignore contient déjà:
   test-db/snapshots/  # Snapshots non versionnés
   ```

---

## Référence Rapide

### Commandes Essentielles

```bash
# Setup complet base de test
npm run test:db:create && npm run test:db:seed

# Reset rapide
npm run test:db:reset:force && npm run test:db:seed

# Vérification santé
npm run test:db:compare

# Snapshot prod (avec tunnel)
npm run tunnel:start && npm run test:db:snapshot -- --limit 50
```

### Variables d'Environnement Critiques

```bash
# Test
DATABASE_URL=postgresql://moncabinet:dev_password@localhost:5433/qadhya_test
REDIS_URL=redis://localhost:6379/1
MINIO_BUCKET=test-documents

# Désactiver crons en test
ENABLE_WEB_CRAWLER_CRON=false
ENABLE_KB_INDEXING_CRON=false
```

---

## Support

- **Issues GitHub** : https://github.com/salmenktata/moncabinet/issues
- **Docs supplémentaires** : `docs/EMBEDDING_STRATEGY_GUIDE.md`
- **Architecture globale** : `docs/ARCHITECTURE.md`

---

**Dernière mise à jour :** Février 2026  
**Version :** 1.0.0
