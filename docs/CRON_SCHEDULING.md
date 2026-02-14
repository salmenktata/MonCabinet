# Guide Scheduling Custom (Phase 6.1)

## 📋 Vue d'ensemble

Le système de crons supporte maintenant la **planification d'exécutions futures**. Les utilisateurs peuvent sélectionner une date et heure pour exécuter automatiquement un cron, avec possibilité de passer des paramètres personnalisés (Phase 6.2).

## 🏗️ Architecture

```
UI (DatePicker + TimePicker)
    ↓
POST /api/admin/cron-executions/schedule
    ↓
INSERT scheduled_cron_executions (status='pending')
    ↓
Cron Worker (toutes les minutes)
    ↓
SELECT get_ready_scheduled_crons()
    ↓
POST /api/admin/cron-executions/trigger (avec paramètres)
    ↓
UPDATE status='triggered'
```

## 📂 Fichiers Clés

### Database

- **`db/migrations/20260214000002_scheduled_cron_executions.sql`**
  - Table `scheduled_cron_executions`
  - Fonctions SQL : `get_ready_scheduled_crons()`, `mark_scheduled_cron_triggered()`
  - Vue : `vw_scheduled_crons_summary`

### Backend

- **`app/api/admin/cron-executions/schedule/route.ts`**
  - POST: Créer planification
  - GET: Lister planifications
  - DELETE: Annuler planification

- **`app/api/admin/cron-executions/schedule/[id]/triggered/route.ts`**
  - PATCH: Marquer comme déclenché (appelé par worker)

- **`app/api/admin/cron-executions/schedule/[id]/failed/route.ts`**
  - PATCH: Marquer comme échoué (appelé par worker)

- **`scripts/cron-scheduler-worker.sh`**
  - Worker qui tourne toutes les minutes
  - Récupère crons prêts
  - Déclenche via API trigger
  - Marque comme triggered/failed

### UI

- **`components/super-admin/monitoring/CronScheduleModal.tsx`**
  - Modal avec DatePicker + TimePicker
  - Validation futur (min +1 minute)
  - Raccourcis rapides (dans 1h, demain 9h, etc.)
  - Intégration Phase 6.2 (paramètres)

- **`components/super-admin/monitoring/ScheduledCronsSection.tsx`**
  - Tableau crons planifiés
  - Compte à rebours temps réel
  - Badge orange si < 5min
  - Bouton annuler

- **`components/super-admin/monitoring/CronQuickTrigger.tsx`** (modifié)
  - Ajout bouton "Planifier" à côté "Exécuter"
  - Ouverture CronScheduleModal

## 🔧 Installation Production

### 1. Appliquer Migration SQL

```bash
ssh root@84.247.165.187

# Se connecter à PostgreSQL
docker exec -it qadhya-postgres psql -U moncabinet -d qadhya

# Exécuter migration
\i /opt/qadhya/db/migrations/20260214000002_scheduled_cron_executions.sql

# Vérifier table créée
\dt scheduled_cron_executions

# Vérifier fonctions créées
\df get_ready_scheduled_crons

# Quitter
\q
```

### 2. Installer Worker Script

```bash
# Copier script
chmod +x /opt/qadhya/scripts/cron-scheduler-worker.sh

# Ajouter au crontab
crontab -e

# Ajouter ligne (toutes les minutes):
* * * * * /opt/qadhya/scripts/cron-scheduler-worker.sh >> /var/log/qadhya/scheduler-worker.log 2>&1
```

### 3. Vérifier Logs

```bash
# Logs worker
tail -f /var/log/qadhya/scheduler-worker.log

# Logs DB exécutions
tail -f /var/log/qadhya/cron-executions.log
```

## 📊 Table `scheduled_cron_executions`

### Colonnes

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | ID unique |
| `cron_name` | TEXT | Nom du cron (ex: 'index-kb-progressive') |
| `scheduled_at` | TIMESTAMPTZ | Date/heure planifiée (UTC) |
| `parameters` | JSONB | Paramètres Phase 6.2 (ex: `{"batchSize": 5}`) |
| `created_by` | TEXT | Utilisateur créateur |
| `created_at` | TIMESTAMPTZ | Date création |
| `status` | TEXT | 'pending', 'triggered', 'cancelled', 'failed' |
| `triggered_at` | TIMESTAMPTZ | Date déclenchement effectif |
| `triggered_execution_id` | UUID | ID de l'exécution créée (FK → cron_executions) |
| `error_message` | TEXT | Message erreur si status='failed' |

### Contraintes

- **CHECK** `status IN ('pending', 'triggered', 'cancelled', 'failed')`
- **CHECK** `scheduled_at > NOW() OR status != 'pending'` (empêche planification dans le passé)

### Index

- `idx_scheduled_crons_pending` : WHERE status='pending' (query worker optimisée)
- `idx_scheduled_crons_recent` : WHERE created_at >= NOW() - 30 days

## 🔍 Fonctions SQL

### `get_ready_scheduled_crons()`

Retourne les crons dont `scheduled_at <= NOW()` et `status='pending'`.

**FOR UPDATE SKIP LOCKED** : Évite race conditions si multiple workers (scalabilité future).

```sql
SELECT * FROM get_ready_scheduled_crons();
```

### `mark_scheduled_cron_triggered(p_id UUID, p_execution_id UUID)`

Marque un cron planifié comme `triggered` et associe l'ID de l'exécution.

```sql
SELECT mark_scheduled_cron_triggered(
  '123e4567-e89b-12d3-a456-426614174000',
  '987fcdeb-51a2-43d8-b123-987654321abc'
);
```

### `mark_scheduled_cron_failed(p_id UUID, p_error TEXT)`

Marque un cron planifié comme `failed` avec message d'erreur.

```sql
SELECT mark_scheduled_cron_failed(
  '123e4567-e89b-12d3-a456-426614174000',
  'Cron already running (409 Conflict)'
);
```

### `cleanup_old_scheduled_crons()`

Nettoie les crons `triggered`/`cancelled`/`failed` de plus de 30 jours.

**Rétention** : pending → jamais supprimés automatiquement

```sql
SELECT cleanup_old_scheduled_crons(); -- Returns: nombre supprimés
```

## 🎨 UI Workflow

### 1. Planifier un Cron

```
Dashboard → Onglet "Crons & Batches"
    ↓
Section "Déclenchement Manuel"
    ↓
Cliquer bouton "Planifier" sur un cron
    ↓
Modal CronScheduleModal s'ouvre
    ↓
Sélectionner date + heure (ou raccourci "Dans 1 heure")
    ↓
(Optionnel) Configurer paramètres Phase 6.2
    ↓
Cliquer "Planifier"
    ↓
Toast: "Cron planifié avec succès !"
    ↓
Apparaît dans section "Crons Planifiés"
```

### 2. Annuler un Cron Planifié

```
Section "Crons Planifiés"
    ↓
Cliquer icône Corbeille
    ↓
Confirmer annulation
    ↓
status → 'cancelled'
    ↓
Disparaît de la liste
```

### 3. Compte à Rebours

- **Mise à jour temps réel** : 1 seconde
- **Badge orange** : Si < 5 minutes
- **Format** :
  - < 60s : `45s`
  - < 60min : `15 min`
  - < 24h : `2h 30min`
  - ≥ 24h : `3j 5h`

## 🔬 Tests

### Test End-to-End Local

```bash
# 1. Démarrer dev
npm run dev

# 2. Ouvrir dashboard
http://localhost:7002/super-admin/monitoring?tab=crons

# 3. Planifier un cron
- Cliquer "Planifier" sur "monitor-openai"
- Sélectionner "Dans 1 heure"
- Cliquer "Planifier"

# 4. Vérifier DB
npx tsx scripts/test-scheduling.ts

# 5. Simuler worker (manuellement)
bash scripts/cron-scheduler-worker.sh

# 6. Vérifier logs
tail -f /var/log/qadhya/scheduler-worker.log
```

### Test API (curl)

#### Créer Planification

```bash
curl -X POST http://localhost:7002/api/admin/cron-executions/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "cronName": "monitor-openai",
    "scheduledAt": "2026-02-14T15:30:00Z",
    "parameters": {},
    "createdBy": "admin"
  }'

# Réponse:
# {
#   "success": true,
#   "scheduled": {
#     "id": "123e4567-e89b-12d3-a456-426614174000",
#     "cronName": "monitor-openai",
#     "scheduledAt": "2026-02-14T15:30:00.000Z",
#     ...
#   }
# }
```

#### Lister Planifications

```bash
curl http://localhost:7002/api/admin/cron-executions/schedule?status=pending

# Réponse:
# {
#   "success": true,
#   "scheduled": [...],
#   "count": 3
# }
```

#### Annuler Planification

```bash
curl -X DELETE "http://localhost:7002/api/admin/cron-executions/schedule?id=123e4567-e89b-12d3-a456-426614174000"

# Réponse:
# {
#   "success": true,
#   "message": "Scheduled cron cancelled",
#   "cronName": "monitor-openai"
# }
```

## 🐛 Debugging

### Cron Worker Ne Déclenche Pas

**Symptômes** : Crons restent `pending` malgré `scheduled_at` passé

**Causes possibles** :

1. **Worker pas installé** : Vérifier `crontab -l`
2. **Worker crash** : Vérifier `/var/log/qadhya/scheduler-worker.log`
3. **API indisponible** : Vérifier `docker ps` (qadhya-nextjs running)
4. **CRON_SECRET manquant** : Vérifier `/opt/qadhya/.env.production.local`

**Fix** :

```bash
# Vérifier crontab
crontab -l | grep scheduler-worker

# Vérifier logs
tail -50 /var/log/qadhya/scheduler-worker.log

# Lancer worker manuellement (debug)
bash -x /opt/qadhya/scripts/cron-scheduler-worker.sh
```

### Timezone Issues

**Symptôme** : Cron s'exécute 1-2h avant/après l'heure sélectionnée

**Cause** : PostgreSQL stocke en UTC, UI affiche en heure locale

**Solution** : Cron scheduler worker utilise UTC, c'est normal. Le compte à rebours UI est correct.

```sql
-- Vérifier timezone PostgreSQL
SHOW timezone; -- Devrait être 'UTC'

-- Vérifier heure serveur
SELECT NOW(); -- Heure UTC
```

### Cron Planifié Déclenché 2 Fois

**Cause** : Multiple workers concurrents (si `* * * * *` en doublon dans crontab)

**Fix** :

```bash
# Vérifier doublons crontab
crontab -l | grep scheduler-worker | wc -l
# Devrait être 1

# Supprimer doublons
crontab -e
# Supprimer lignes en double
```

**Protection** : `FOR UPDATE SKIP LOCKED` empêche double déclenchement même avec multiple workers.

## 📈 Monitoring

### Métriques Clés

```sql
-- Nombre crons planifiés par status
SELECT status, COUNT(*) as count
FROM scheduled_cron_executions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY status;

-- Crons imminents (< 5 minutes)
SELECT cron_name, scheduled_at,
       EXTRACT(EPOCH FROM (scheduled_at - NOW())) as seconds_until
FROM scheduled_cron_executions
WHERE status = 'pending'
  AND scheduled_at <= NOW() + INTERVAL '5 minutes'
ORDER BY scheduled_at ASC;

-- Taux de succès worker
SELECT
  COUNT(*) FILTER (WHERE status = 'triggered') as triggered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'triggered') /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('triggered', 'failed')), 0), 2) as success_rate_pct
FROM scheduled_cron_executions
WHERE created_at >= NOW() - INTERVAL '7 days';
```

### Alertes Recommandées

- ⚠️ **Warning** : 5+ crons `failed` en 24h
- 🚨 **Critical** : Worker n'a rien déclenché depuis 1h (alors qu'il y a des `pending`)
- ℹ️ **Info** : 10+ crons planifiés pour les prochaines 24h (capacité)

## 🚀 Améliorations Futures (Phase 7+)

### 1. Patterns de Répétition

```sql
ALTER TABLE scheduled_cron_executions
  ADD COLUMN repeat_pattern TEXT CHECK (repeat_pattern IN ('once', 'daily', 'weekly', 'monthly')),
  ADD COLUMN repeat_until TIMESTAMPTZ;
```

**Usage** : "Indexer KB tous les jours à 2h du matin pendant 1 mois"

### 2. Notifications

- Email/Slack quand cron planifié déclenché
- Alerte si échec déclenchement
- Rappel 5min avant exécution

### 3. Batch Scheduling

UI pour planifier 10+ crons en une fois (ex: réanalyses hebdomadaires catégorie par catégorie)

### 4. Calendar View

Vue calendrier mensuel des crons planifiés (intégration shadcn/ui Calendar)

### 5. Retry Logic

Si déclenchement échoue (409 Conflict), retry automatique après 1 minute

---

**Dernière mise à jour** : 14 février 2026 - Phase 6.1 Scheduling Custom ✅
