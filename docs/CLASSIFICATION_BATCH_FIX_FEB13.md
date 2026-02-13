# Fix Classification Batch - 13 Février 2026

## 🐛 Problème

La page Classification Batch (https://qadhya.tn/super-admin/classification) retournait une erreur "Erreur serveur" lors du clic sur "Lancer la classification".

### Symptômes
- **Console browser** : `Error: Erreur serveur at page-a370c23c5200eee1.js:1:7918`
- **Logs serveur** :
```
[ClassifyAPI] Erreur: error: new row for relation "indexing_jobs"
violates check constraint "indexing_jobs_job_type_check"
```

## 🔍 Root Cause

La contrainte CHECK `indexing_jobs_job_type_check` ne contenait **PAS** la valeur `'classify_pages'`.

```sql
-- Contrainte AVANT (manque classify_pages)
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text
]))
```

Quand l'API `/api/super-admin/classify-pages` essayait d'insérer un job avec `job_type = 'classify_pages'`, PostgreSQL rejetait l'INSERT.

## ✅ Solution Appliquée

### 1. Migration SQL

**Fichier** : `migrations/20260213_add_classify_pages_to_job_type_check.sql`

```sql
BEGIN;

-- Supprimer ancienne contrainte
ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

-- Créer nouvelle contrainte avec classify_pages
ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text  -- ⬅️ AJOUTÉ
]));

COMMIT;
```

### 2. Application en Production

```bash
# Étape 1 : Supprimer ancienne contrainte
docker exec <postgres-container> psql -U moncabinet -d qadhya -c \
  "ALTER TABLE indexing_jobs DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;"

# Étape 2 : Créer nouvelle contrainte
docker exec <postgres-container> psql -U moncabinet -d qadhya -c \
  "ALTER TABLE indexing_jobs ADD CONSTRAINT indexing_jobs_job_type_check CHECK (...);"

# Étape 3 : Vérifier
docker exec <postgres-container> psql -U moncabinet -d qadhya -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'indexing_jobs_job_type_check';"
```

**Résultat** : Contrainte mise à jour avec succès ✅

## 📋 Fichiers Concernés

1. **API Backend** : `app/api/super-admin/classify-pages/route.ts`
   - Ligne 88-105 : INSERT dans `indexing_jobs` avec `job_type = 'classify_pages'`

2. **Composant Client** : `components/super-admin/classification/ClassifyBatchButton.tsx`
   - Ligne 47-51 : Appel POST `/api/super-admin/classify-pages`

3. **Page UI** : `app/super-admin/classification/page.tsx`
   - Ligne 45-47 : Onglet "Batch" avec `<ClassifyBatchButton />`

## 🧪 Tests de Validation

### Test 1 : Vérifier la contrainte en production

```bash
docker exec <postgres-container> psql -U moncabinet -d qadhya -c \
  "SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname = 'indexing_jobs_job_type_check';"
```

**Attendu** : La contrainte doit contenir `'classify_pages'::text`

### Test 2 : Tester l'API directement

```bash
# 1. Obtenir session token (authentifié super_admin)
TOKEN="<votre-session-token>"

# 2. Lancer classification
curl -X POST https://qadhya.tn/api/super-admin/classify-pages \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$TOKEN" \
  -d '{"limit": 10}'
```

**Attendu** :
```json
{
  "message": "Classification lancée pour X pages",
  "job_id": "uuid",
  "pages_count": X,
  "limit": 10
}
```

### Test 3 : UI Browser

1. Aller sur https://qadhya.tn/super-admin/classification
2. Onglet "Batch"
3. Mettre `limit = 10`
4. Cliquer "Lancer la classification"

**Attendu** :
- ✅ Pas d'erreur dans console
- ✅ Toast success : "Classification lancée pour X pages"
- ✅ Progress bar s'affiche
- ✅ Polling du status démarre

### Test 4 : Vérifier le job en DB

```sql
SELECT id, job_type, status, started_at, metadata
FROM indexing_jobs
WHERE job_type = 'classify_pages'
ORDER BY started_at DESC
LIMIT 1;
```

**Attendu** : Job avec `status = 'running'` ou `'completed'`

## 📚 Documentation Créée

1. **`docs/DATABASE_CONSTRAINTS.md`**
   - Guide complet sur la contrainte CHECK `indexing_jobs.job_type`
   - Procédure pour ajouter un nouveau `job_type`
   - Historique des modifications

2. **Mise à jour mémoire** : `memory/bugs-fixes.md`
   - Section "CHECK Constraint indexing_jobs - classify_pages"
   - Leçon + checklist pour éviter récurrence

## 🎯 Impact

- ✅ Classification Batch fonctionnel
- ✅ Pages non classifiées peuvent être traitées en batch
- ✅ Job d'indexation créé sans erreur
- ✅ UI opérationnelle avec progress tracking

## 📖 Leçon

**CRITIQUE** : Quand vous créez un nouveau type de job dans `indexing_jobs`, vous **DEVEZ** mettre à jour la contrainte CHECK.

### Checklist Ajout Nouveau Job Type

- [ ] Créer API qui INSERT dans `indexing_jobs`
- [ ] Ajouter `job_type` à contrainte CHECK (dev + prod)
- [ ] Créer migration SQL documentée
- [ ] Tester en local avant déploiement
- [ ] Vérifier contrainte en prod après déploiement
- [ ] Documenter dans `docs/DATABASE_CONSTRAINTS.md`

## 🔗 Références

- **API** : `/app/api/super-admin/classify-pages/route.ts`
- **Migration** : `/migrations/20260213_add_classify_pages_to_job_type_check.sql`
- **Documentation** : `/docs/DATABASE_CONSTRAINTS.md`
- **Mémoire** : `/memory/bugs-fixes.md` (ligne ~150)
- **Date fix** : 13 février 2026
- **Temps résolution** : ~15 minutes

---

**Status** : ✅ RÉSOLU - Production opérationnelle
