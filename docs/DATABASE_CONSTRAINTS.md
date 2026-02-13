# Contraintes Base de Données

## Contrainte CHECK : indexing_jobs.job_type

La table `indexing_jobs` possède une contrainte CHECK qui limite les valeurs possibles pour `job_type`.

### Valeurs autorisées actuelles

```sql
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text
]))
```

### Ajouter un nouveau job_type

Si vous créez un nouveau type de job d'indexation, vous DEVEZ ajouter sa valeur à cette contrainte :

```sql
-- 1. Supprimer ancienne contrainte
ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

-- 2. Créer nouvelle contrainte avec le nouveau type
ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text,
  'votre_nouveau_type'::text  -- ⬅️ AJOUTER ICI
]));
```

### Historique des modifications

| Date | Job Type Ajouté | Migration | Commit |
|------|-----------------|-----------|--------|
| 2026-02-13 | `classify_pages` | `20260213_add_classify_pages_to_job_type_check.sql` | - |

### Symptôme si contrainte manquante

Si vous oubliez d'ajouter un `job_type` à la contrainte, vous obtiendrez cette erreur :

```
error: new row for relation "indexing_jobs" violates check constraint "indexing_jobs_job_type_check"
```

**Solution** : Appliquer la migration ci-dessus pour ajouter le type manquant.

### Migrations

Toutes les migrations de contraintes sont dans `/migrations/`.

### Vérifier la contrainte actuelle

```bash
# Production
docker exec <postgres-container> psql -U moncabinet -d qadhya -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'indexing_jobs_job_type_check';"

# Local
docker exec moncabinet-postgres psql -U postgres -d moncabinet -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'indexing_jobs_job_type_check';"
```

## Autres contraintes CHECK

*(À documenter au fur et à mesure)*
