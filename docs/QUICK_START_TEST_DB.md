# Guide de Démarrage Rapide - Base de Test

## ✅ Système Opérationnel

Le système de gestion de datasets est **100% fonctionnel** et testé avec succès.

---

## 🚀 Commandes Essentielles

### Setup Initial (Une fois)

```bash
# Créer la base de test complète (56 tables)
npm run test:db:create --force

# Insérer les fixtures (25 entrées)
npm run test:db:seed
```

**Résultat attendu :**
```
✅ Base qadhya_test créée
✅ 56 tables créées
✅ Extension pgvector active
✅ 2 utilisateurs, 3 sources web, 10 documents KB, 5 clients, 5 dossiers
```

---

### Usage Quotidien

```bash
# Reset la base (vide toutes les tables)
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force

# Réinsérer les fixtures
npm run test:db:seed

# Ou en une seule commande
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force && npm run test:db:seed
```

---

## 📊 Fixtures Disponibles

| Table | Quantité | Description |
|-------|----------|-------------|
| **users** | 2 | test.user@qadhya.test + admin@qadhya.test |
| **web_sources** | 3 | cassation.tn, 9anoun.tn, da5ira.com |
| **knowledge_base** | 10 | 5 jurisprudence, 3 legislation, 2 doctrine |
| **clients** | 5 | 2 personnes morales, 3 personnes physiques |
| **dossiers** | 5 | Statuts variés (en_cours, clos, archive) |

**Total :** 25 fixtures

---

## 🔧 Workflows de Développement

### Scénario 1 : Développer Feature Crawling

```bash
# 1. Setup base de test
npm run test:db:create --force
npm run test:db:seed

# 2. Lancer serveur dev
npm run dev

# 3. Tester feature sur http://localhost:7002/super-admin/web-sources
# - 3 sources de test disponibles
# - Tester crawl sur cassation.tn, 9anoun.tn, da5ira.com

# 4. Reset entre tests
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force && npm run test:db:seed

# 5. Commit & Push → CI/CD déploie
git add .
git commit -m "feat: nouvelle feature crawl"
git push origin main
```

---

### Scénario 2 : Développer Feature Indexation

```bash
# 1. Setup
npm run test:db:create --force
npm run test:db:seed

# 2. Développer logique indexation
# Modifier lib/web-scraper/web-indexer-service.ts

# 3. Tester sur 10 docs KB de test
npm run dev
# POST /api/admin/kb/index

# 4. Vérifier qualité
npm run audit:rag

# 5. Reset + retester
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force && npm run test:db:seed
```

---

### Scénario 3 : Tests Automatisés (CI/CD)

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Test Database
        run: |
          npm run test:db:create -- --force
          npm run test:db:seed

      - name: Run Tests
        run: npm test
        env:
          DATABASE_URL: postgresql://moncabinet:dev_password@localhost:5433/qadhya_test
```

---

## 🛡️ Sécurité

### Protection Anti-Production

Le script `reset-test-database.ts` **refuse** de s'exécuter si :
- ❌ `DATABASE_URL` contient `/qadhya` sans `test`
- ❌ `DATABASE_URL` ne contient pas `test` ou `qadhya_test`

**Exemple :**
```bash
# ✅ Autorisé
DATABASE_URL="postgresql://user:pass@localhost:5433/qadhya_test"

# ❌ Bloqué (production)
DATABASE_URL="postgresql://user:pass@localhost:5432/qadhya"
```

---

## 🔍 Vérification Santé

### Compter les Entrées

```bash
docker exec qadhya-postgres psql -U moncabinet -d qadhya_test -c \
  "SELECT 
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM web_sources) as sources,
    (SELECT COUNT(*) FROM knowledge_base) as kb_docs,
    (SELECT COUNT(*) FROM clients) as clients,
    (SELECT COUNT(*) FROM dossiers) as dossiers"
```

**Résultat attendu :**
```
 users | sources | kb_docs | clients | dossiers 
-------+---------+---------+---------+----------
     2 |       3 |      10 |       5 |        5
```

---

### Lister les Tables

```bash
docker exec qadhya-postgres psql -U moncabinet -d qadhya_test -c \
  "SELECT table_name FROM information_schema.tables 
   WHERE table_schema='public' AND table_type='BASE TABLE' 
   ORDER BY table_name"
```

**Résultat attendu :** 56 tables

---

## 📝 Modifier les Fixtures

### Ajouter un Client

1. Éditer `lib/test-db/fixtures/clients.json`
```json
{
  "nom": "Nouveau Client SARL",
  "prenom": null,
  "type": "personne_morale",
  "email": "nouveau@test.tn",
  "telephone": "+216 71 999 888",
  "adresse": "Adresse Test",
  "cin_matricule": "9999999X"
}
```

2. Recharger
```bash
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force && npm run test:db:seed
```

---

### Ajouter un Document KB

1. Éditer `lib/test-db/fixtures/knowledge-base.json`
```json
{
  "title": "Nouveau Document Test",
  "category": "jurisprudence",
  "language": "fr",
  "file_url": "test/nouveau-doc.pdf",
  "file_type": "application/pdf",
  "metadata": {
    "source": "test_fixture",
    "tribunal": "Tribunal Test"
  },
  "is_indexed": false
}
```

2. Recharger les fixtures

---

## 🎯 Prochaines Étapes

### Option 1 : Snapshot Production (Recommandé)

Créer un snapshot anonymisé de production pour tests réalistes :

```bash
# 1. Démarrer tunnel SSH vers prod
npm run tunnel:start

# 2. Créer snapshot (50 docs max)
npm run test:db:snapshot -- --limit 50

# 3. Importer dans base test
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya_test \
  < scripts/test-db/snapshots/prod_20260211.sql

# 4. Arrêter tunnel
npm run tunnel:stop
```

---

### Option 2 : Tests End-to-End

Intégrer la base de test dans les tests automatisés :

```typescript
// __tests__/integration/crawl.test.ts
import { describe, test, beforeEach } from 'vitest'

describe('Web Crawler Integration Tests', () => {
  beforeEach(async () => {
    // Reset base de test avant chaque test
    await resetTestDatabase()
  })

  test('should crawl cassation.tn', async () => {
    // Utiliser les fixtures de test
    const source = await getWebSource('cassation.tn')
    const result = await crawlWebSource(source.id)
    
    expect(result.pages_crawled).toBeGreaterThan(0)
  })
})
```

---

## 📚 Documentation Complète

- **Guide Complet** : `docs/DATASET_MANAGEMENT_GUIDE.md` (3000+ mots)
- **Stratégie Embeddings** : `docs/EMBEDDING_STRATEGY_GUIDE.md` (4000+ mots)
- **Récapitulatif** : `docs/PROVIDER_ALIGNMENT_FEB2026.md`

---

## ❓ Troubleshooting

### Erreur : "database qadhya_test does not exist"

```bash
npm run test:db:create --force
```

---

### Erreur : FK constraint violation

```bash
DATABASE_URL="postgresql://moncabinet:dev_password_change_in_production@localhost:5433/qadhya_test" \
  npm run test:db:reset --force
npm run test:db:seed
```

---

### Erreur : Cannot connect to database

Vérifier que le container PostgreSQL est actif :

```bash
docker ps | grep postgres

# Si pas actif, démarrer
docker-compose up -d
```

---

## 🎉 Conclusion

Le système de gestion de datasets est **prêt pour production** :

- ✅ 3 scripts opérationnels (create, reset, seed)
- ✅ 25 fixtures testées et fonctionnelles
- ✅ Protection anti-production robuste
- ✅ Workflows documentés pour tous les cas d'usage
- ✅ Compatible avec CI/CD

**Dernière mise à jour :** 11 février 2026  
**Testé sur :** qadhya_test (56 tables, 25 fixtures)
