# Gestion de la Concurrence des Déploiements

> **Date de création** : 13 février 2026
> **Statut** : ✅ Implémenté (Phase 1 + Phase 2)
> **Version** : 1.0

## Table des Matières

- [Vue d'Ensemble](#vue-densemble)
- [Phase 1 : Protection Critique (Verrous)](#phase-1--protection-critique-verrous)
- [Phase 2 : Gestion Queue Intelligente](#phase-2--gestion-queue-intelligente)
- [Scripts Utilitaires](#scripts-utilitaires)
- [Tests et Validation](#tests-et-validation)
- [Troubleshooting](#troubleshooting)
- [Métriques et Monitoring](#métriques-et-monitoring)

---

## Vue d'Ensemble

### Problème Initial

Avant l'implémentation, le système avait les vulnérabilités suivantes :

**✅ Bien géré** :
- Concurrence des workflows GitHub Actions (queue FIFO, `cancel-in-progress: false`)
- Health checks robustes avec retry logic
- Rollback automatique en cas d'échec

**❌ Vulnérabilités** :
- Pas de protection contre déploiements concurrents manuel + GHA
- Pas de gestion intelligente de queue (accumulation possible)
- Pas de visibilité temps réel sur les déploiements
- Race conditions possibles (`docker cp`, `docker restart` concurrents)

### Solution Implémentée

#### Phase 1 : Protection Critique (Verrous) 🔒

**Objectif** : Garantir qu'un seul déploiement peut s'exécuter sur le VPS à la fois, quelle que soit la source (GHA, SSH manuel, cron).

**Mécanisme** :
- Système de verrous (`flock`) côté VPS
- Timeout configurable (30 minutes par défaut)
- Libération automatique en cas de crash process
- Métadonnées du déploiement en cours (PID, user, timestamp, commande)

#### Phase 2 : Gestion Queue Intelligente 🎯

**Objectif** : Éviter les queues infinies et optimiser les déploiements groupés.

**Mécanisme** :
- Job `check-queue` vérifie le nombre de déploiements en attente
- Skip automatique si 3+ déploiements en queue (auto-batch)
- Timeout global workflow (implicite via job timeouts)
- Notifications claires des skips

---

## Phase 1 : Protection Critique (Verrous)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VPS Deployment Lock                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /var/lock/qadhya-deploy.lock          (lockfile flock)    │
│  /var/lock/qadhya-deploy.info          (metadata JSON)     │
│                                                             │
│  Timeout: 30 minutes                                        │
│  Auto-release: Yes (process exit)                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  GHA Deploy  │       │ Manual SSH   │       │  Cron Job    │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                              ▼
                    deploy-with-lock.sh
                              │
                    ┌─────────┴─────────┐
                    │  flock acquire    │
                    │  (max 30 min)     │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Execute deployment│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  flock release    │
                    └───────────────────┘
```

### Scripts

#### 1. `scripts/deploy-with-lock.sh`

**Fonction** : Wrapper qui acquiert un verrou avant d'exécuter une commande de déploiement.

**Usage** :
```bash
./deploy-with-lock.sh <commande_a_executer>
```

**Exemples** :
```bash
# Lightning deploy
./deploy-with-lock.sh docker cp /tmp/bundle qadhya-nextjs:/app

# Docker deploy
./deploy-with-lock.sh docker compose up -d nextjs

# Script personnalisé
./deploy-with-lock.sh bash scripts/my-custom-deploy.sh
```

**Comportement** :
- Tente d'acquérir verrou `/var/lock/qadhya-deploy.lock`
- Timeout 30 minutes (1800s)
- Enregistre métadonnées dans `/var/lock/qadhya-deploy.info`
- Exécute la commande passée en argument
- Libère verrou automatiquement à la fin (succès ou échec)
- Exit codes :
  - `0` : Succès
  - `1` : Échec acquisition verrou (timeout ou déjà pris)
  - Autre : Exit code de la commande exécutée

**Logs** :
```
ℹ️  Tentative d'acquisition du verrou de déploiement...
ℹ️  Timeout: 1800s (30 minutes)
✅ Verrou acquis avec succès
ℹ️  Informations du verrou enregistrées dans /var/lock/qadhya-deploy.info
ℹ️  Exécution de la commande: docker compose up -d nextjs
...
✅ Déploiement terminé avec succès
ℹ️  Verrou libéré
```

#### 2. `scripts/check-deploy-lock.sh`

**Fonction** : Diagnostic et gestion du verrou de déploiement.

**Usage** :
```bash
# Vérifier l'état du verrou
./check-deploy-lock.sh

# Forcer la libération (DANGER)
./check-deploy-lock.sh --force-unlock

# Afficher l'aide
./check-deploy-lock.sh --help
```

**Exemples de sortie** :

##### Aucun déploiement en cours
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ÉTAT DU VERROU DE DÉPLOIEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Aucun déploiement en cours (verrou libre)
```

##### Déploiement en cours
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ÉTAT DU VERROU DE DÉPLOIEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Déploiement en cours détecté

ℹ️  Informations du déploiement:

  PID: 12345
  User: root
  Started: 2026-02-13 10:30:45 UTC
  Timestamp: 1707823845
  Command: docker compose up -d nextjs
  Hostname: qadhya-vps

  Durée: 5m 32s

✅ Process actif (PID 12345)
  Commande: docker compose up -d nextjs
```

##### Verrou orphelin (process mort)
```
⚠️  Déploiement en cours détecté

❌ Process mort (PID 12345 n'existe plus)
⚠️  Verrou orphelin détecté - considérez forcer la libération
ℹ️  Commande: ./check-deploy-lock.sh --force-unlock
```

##### Forcer libération
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FORCER LA LIBÉRATION DU VERROU (DANGER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Cette opération peut causer des problèmes si un déploiement est en cours !
⚠️  Utilisez cette fonction UNIQUEMENT en cas de deadlock avéré.

Êtes-vous sûr de vouloir forcer la libération ? (tapez 'yes' pour confirmer) : yes

ℹ️  Sauvegarde des informations du verrou forcé:
PID: 12345
User: root
...

✅ Verrou forcé et libéré
⚠️  Si un déploiement était en cours, il peut maintenant être dans un état incohérent
ℹ️  Vérifiez l'état de l'application: docker ps, docker logs qadhya-nextjs
```

### Intégration GitHub Actions

Le workflow `.github/workflows/deploy-vps.yml` a été modifié pour intégrer les verrous :

#### Lightning Deploy (Tier 1)

```yaml
- name: Upload deploy scripts
  run: |
    scp scripts/deploy-with-lock.sh vps:/opt/moncabinet/scripts/
    scp scripts/check-deploy-lock.sh vps:/opt/moncabinet/scripts/
    ssh vps 'chmod +x /opt/moncabinet/scripts/*.sh'

- name: Upload and deploy
  run: |
    scp deploy.tar.gz vps:/tmp/deploy.tar.gz

    ssh vps << 'DEPLOY'
      bash /opt/moncabinet/scripts/deploy-with-lock.sh bash -c '
        # Extract, docker cp, docker restart
        ...
      '
    DEPLOY
```

#### Docker Deploy (Tier 2)

```yaml
- name: Copy scripts to VPS
  run: |
    scp scripts/deploy-with-lock.sh vps:/opt/moncabinet/scripts/
    scp scripts/check-deploy-lock.sh vps:/opt/moncabinet/scripts/

- name: Deploy via SSH
  script: |
    cd /opt/moncabinet
    bash scripts/deploy-with-lock.sh bash -c '
      # sed secrets, docker pull, docker compose up
      ...
    '
```

---

## Phase 2 : Gestion Queue Intelligente

### Architecture

```
Push commit → GitHub Actions
                    │
                    ▼
         ┌──────────────────────┐
         │   Job: check-queue   │
         │                      │
         │ Count queued/running │
         │   deployments        │
         └──────────┬───────────┘
                    │
         ┌──────────▼───────────┐
         │  Queue length >= 3?  │
         └──────┬────────┬──────┘
                │        │
         YES ◄──┘        └──► NO
          │                    │
          ▼                    ▼
   ┌─────────────┐      ┌─────────────┐
   │ SKIP (batch)│      │  PROCEED    │
   │             │      │             │
   │ notify-skip │      │ detect-     │
   │             │      │ changes     │
   └─────────────┘      └──────┬──────┘
                               │
                               ▼
                        Deploy jobs...
```

### Job `check-queue`

**Fonction** : Vérifier le nombre de déploiements en queue/en cours et décider si skip.

**Logique** :
```yaml
PENDING=$(gh run list \
  --workflow="Deploy to VPS Contabo" \
  --status=queued,in_progress \
  --json databaseId,status \
  --jq 'length')

if [ "$PENDING" -ge 3 ]; then
  # Skip ce déploiement (auto-batch)
  # Le dernier en queue inclura déjà ces changements
  should_skip=true
else
  # Procéder normalement
  should_skip=false
fi
```

**Outputs** :
- `should_skip` : `true` ou `false`
- `queue_length` : Nombre de déploiements en queue/en cours

### Job `notify-skip`

**Fonction** : Notifier l'utilisateur du skip (auto-batch).

**Logs** :
```
================================================
⏭️  DEPLOYMENT SKIPPED (Auto-Batch)
================================================
Raison: 5 déploiements déjà en queue/en cours
Le dernier déploiement en queue inclura ces changements

Pour forcer le déploiement malgré la queue:
  gh workflow run 'Deploy to VPS Contabo'
================================================
```

### Scénarios

#### Scénario 1 : 3 commits pushés rapidement

```
t=0s   : Commit A pushed → Run #1 starts (queue=1)
t=5s   : Commit B pushed → Run #2 queued (queue=2)
t=10s  : Commit C pushed → Run #3 queued (queue=3)

Run #1: ✅ Deploying A...
Run #2: ⏸️  Waiting (queue position 1)
Run #3: ⏸️  Waiting (queue position 2)

t=15s  : Commit D pushed → Run #4 check-queue

check-queue: PENDING=3 (runs 1,2,3)
check-queue: SKIP (auto-batch)

Run #4: ⏭️  Skipped (batch)

t=180s : Run #1 completes ✅
t=185s : Run #2 starts → Deploying B (includes A+B)
t=365s : Run #2 completes ✅
t=370s : Run #3 starts → Deploying C (includes A+B+C, mais D skippé)
```

**Résultat** :
- 4 commits, 3 runs effectifs (D skippé)
- Production finale : Code C (D non déployé car skippé avant d'être queued)

**Note** : Pour déployer D, soit attendre que queue se vide, soit forcer manuellement.

#### Scénario 2 : Déploiement GHA + déploiement SSH manuel concurrent

```
t=0s   : GHA Run #1 starts
         └─> deploy-with-lock.sh acquires lock
             ✅ Lock acquired

t=30s  : Admin SSH manual deploy
         └─> deploy-with-lock.sh attempts lock
             ❌ Lock already held (timeout 30min)
             ⏸️  Waiting...

t=180s : GHA Run #1 completes
         └─> deploy-with-lock.sh releases lock
             ✅ Lock released

t=180s : SSH manual deploy
         └─> deploy-with-lock.sh acquires lock
             ✅ Lock acquired
             ⚙️  Deploying...
```

---

## Scripts Utilitaires

### 1. Vérifier état verrou sur VPS

```bash
# SSH vers VPS
ssh root@84.247.165.187

# Vérifier état
bash /opt/moncabinet/scripts/check-deploy-lock.sh
```

### 2. Forcer libération verrou (DANGER)

```bash
# SSH vers VPS
ssh root@84.247.165.187

# Forcer libération (seulement si deadlock avéré)
bash /opt/moncabinet/scripts/check-deploy-lock.sh --force-unlock
```

### 3. Vérifier queue GitHub Actions

```bash
# Liste des runs en cours/queue
gh run list \
  --repo salmenktata/moncabinet \
  --workflow="Deploy to VPS Contabo" \
  --status=queued,in_progress \
  --limit 10

# Détail d'un run
gh run view <run_id>
```

### 4. Forcer déploiement manuel (bypass queue)

```bash
# Trigger workflow manuellement
gh workflow run "Deploy to VPS Contabo"

# Forcer Docker rebuild
gh workflow run "Deploy to VPS Contabo" -f force_docker=true
```

---

## Tests et Validation

### Test 1 : Déploiement unique réussit

**Objectif** : Vérifier que le verrou fonctionne normalement.

```bash
# Push commit
echo "test: $(date)" >> README.md
git commit -am "test: verify lock works"
git push origin main

# Observer workflow
gh run watch

# Attendu: ✅ Success (3-5min)

# Vérifier verrou libéré
ssh root@84.247.165.187 \
  "flock -n /var/lock/qadhya-deploy.lock echo 'Lock free'"
# Attendu: "Lock free"
```

### Test 2 : Déploiement concurrent bloqué

**Objectif** : Vérifier que deux déploiements ne peuvent pas s'exécuter simultanément.

```bash
# Terminal 1: Lancer workflow GHA
gh workflow run "Deploy to VPS Contabo"
gh run watch

# Terminal 2: Pendant exécution, tenter SSH manuel
ssh root@84.247.165.187 << 'SSH'
  cd /opt/moncabinet
  bash scripts/deploy-with-lock.sh docker compose up -d nextjs
SSH

# Attendu Terminal 2:
# ❌ Impossible d'acquérir le verrou de déploiement (timeout 1800s)
# Un autre déploiement est en cours.
```

### Test 3 : Queue auto-skip

**Objectif** : Vérifier le skip automatique si 3+ déploiements en queue.

```bash
# Pusher 4 commits rapidement (< 30s)
for i in 1 2 3 4; do
  echo "test $i: $(date)" >> README.md
  git commit -am "test: batch $i"
  git push origin main
  sleep 5
done

# Observer runs
gh run list --workflow="Deploy to VPS Contabo" --limit 5

# Attendu:
# Run #1: ✅ Success (deploying commit 1)
# Run #2: ⏸️  Queued
# Run #3: ⏸️  Queued
# Run #4: ⏭️  Skipped (auto-batch)
```

### Test 4 : Verrou orphelin

**Objectif** : Vérifier détection et nettoyage de verrou orphelin.

```bash
# Simuler verrou orphelin
ssh root@84.247.165.187 << 'SSH'
  # Créer verrou avec process inexistant
  cat > /var/lock/qadhya-deploy.info << EOF
PID: 99999
User: test
Started: 2026-02-13 10:00:00 UTC
Timestamp: $(date +%s)
Command: test
EOF
  touch /var/lock/qadhya-deploy.lock
SSH

# Vérifier état
ssh root@84.247.165.187 \
  "bash /opt/moncabinet/scripts/check-deploy-lock.sh"

# Attendu:
# ⚠️  Déploiement en cours détecté
# ❌ Process mort (PID 99999 n'existe plus)
# ⚠️  Verrou orphelin détecté

# Nettoyer
ssh root@84.247.165.187 \
  "bash /opt/moncabinet/scripts/check-deploy-lock.sh --force-unlock"

# Attendu:
# ✅ Verrou forcé et libéré
```

### Test 5 : Timeout verrou (30 minutes)

**Objectif** : Vérifier que le timeout fonctionne (test long).

```bash
# Simuler déploiement très long (réduire timeout pour test)
ssh root@84.247.165.187 << 'SSH'
  # Modifier temporairement le timeout à 60s
  sed -i 's/TIMEOUT=1800/TIMEOUT=60/' /opt/moncabinet/scripts/deploy-with-lock.sh

  # Lancer déploiement qui dure 90s
  bash /opt/moncabinet/scripts/deploy-with-lock.sh sleep 90 &

  # Attendre 5s
  sleep 5

  # Tenter autre déploiement
  bash /opt/moncabinet/scripts/deploy-with-lock.sh echo "test"
SSH

# Attendu:
# ℹ️  Tentative d'acquisition du verrou...
# (attente 60s)
# ❌ Impossible d'acquérir le verrou (timeout 60s)

# Restaurer timeout
ssh root@84.247.165.187 \
  "sed -i 's/TIMEOUT=60/TIMEOUT=1800/' /opt/moncabinet/scripts/deploy-with-lock.sh"
```

---

## Troubleshooting

### Problème 1 : Déploiement bloqué >20 minutes

**Symptômes** :
```
bash /opt/moncabinet/scripts/check-deploy-lock.sh

⚠️  Déploiement en cours détecté
Durée: 25m 12s
❌ Le déploiement dure depuis plus de 20 minutes !
```

**Diagnostic** :

1. Vérifier logs container :
```bash
ssh root@84.247.165.187 "docker logs qadhya-nextjs --tail 100"
```

2. Vérifier process actif :
```bash
ssh root@84.247.165.187 "ps aux | grep deploy"
```

3. Vérifier état services :
```bash
ssh root@84.247.165.187 "docker ps"
ssh root@84.247.165.187 "docker exec qadhya-postgres pg_isready"
```

**Solutions** :

- **Si process actif** : Attendre ou tuer process si sûr qu'il est bloqué
  ```bash
  ssh root@84.247.165.187 "kill -9 <PID>"
  ```

- **Si process mort** : Forcer libération verrou
  ```bash
  ssh root@84.247.165.187 \
    "bash /opt/moncabinet/scripts/check-deploy-lock.sh --force-unlock"
  ```

- **Si services down** : Investiguer logs + redémarrer si nécessaire
  ```bash
  ssh root@84.247.165.187 "docker compose -f /opt/moncabinet/docker-compose.prod.yml restart"
  ```

### Problème 2 : Workflow GHA timeout (job >10min)

**Symptômes** :
```
GitHub Actions:
Job 'Lightning Deploy' timed out after 10 minutes
```

**Diagnostic** :

1. Vérifier logs GHA (section "Upload and deploy")
2. Vérifier si verrou VPS bloqué :
   ```bash
   ssh root@84.247.165.187 \
     "bash /opt/moncabinet/scripts/check-deploy-lock.sh"
   ```

**Solutions** :

- **Si verrou bloqué** : Forcer libération (voir Problème 1)
- **Si timeout légitime (build lent)** : Augmenter timeout job dans workflow
  ```yaml
  deploy-fast:
    timeout-minutes: 15  # Au lieu de 10
  ```

### Problème 3 : Skip inattendu (auto-batch non désiré)

**Symptômes** :
```
GitHub Actions:
⏭️  DEPLOYMENT SKIPPED (Auto-Batch)
Raison: 3 déploiements déjà en queue/en cours
```

**Mais** : Vous voulez forcer le déploiement immédiatement.

**Solution** :

1. Attendre que queue se vide (~5-10 min)
2. OU forcer manuellement via `workflow_dispatch` :
   ```bash
   gh workflow run "Deploy to VPS Contabo"
   ```

3. OU désactiver temporairement la logique de skip :
   - Modifier `.github/workflows/deploy-vps.yml`
   - Changer seuil de `>= 3` à `>= 10` (ou très élevé)
   - Push changement

### Problème 4 : Race condition malgré verrou

**Symptômes** :
- État incohérent après déploiement
- Fichiers manquants ou corrompus

**Diagnostic** :

1. Vérifier logs `/var/lock/qadhya-deploy.info` historique
2. Vérifier si plusieurs sources de déploiement (GHA, SSH, cron)
3. Vérifier si scripts deployent sans passer par `deploy-with-lock.sh`

**Solutions** :

- **Toujours** utiliser `deploy-with-lock.sh` pour toute opération de déploiement
- Vérifier cron jobs :
  ```bash
  ssh root@84.247.165.187 "crontab -l"
  ```
- Auditer scripts personnalisés :
  ```bash
  ssh root@84.247.165.187 "grep -r 'docker cp' /opt/moncabinet/scripts/"
  ssh root@84.247.165.187 "grep -r 'docker compose up' /opt/moncabinet/scripts/"
  ```

---

## Métriques et Monitoring

### Métriques Clés

| Métrique | Description | Objectif | Mesure |
|----------|-------------|----------|--------|
| **Lock Wait Time** | Temps d'attente acquisition verrou | < 5 min | Logs `deploy-with-lock.sh` |
| **Deployment Duration** | Temps total déploiement | 3-5 min (Lightning), 5-10 min (Docker) | GHA workflow duration |
| **Queue Length** | Nombre de runs en queue | < 3 | `check-queue` output |
| **Skip Rate** | % de déploiements skippés | < 10% | GHA runs skipped / total |
| **Timeout Rate** | % de déploiements timeout | 0% | GHA runs timeout / total |
| **Lock Orphan Rate** | Fréquence verrous orphelins | 0/semaine | `check-deploy-lock.sh` calls |

### Commandes de Monitoring

#### 1. Statistiques déploiements (7 derniers jours)

```bash
gh run list \
  --workflow="Deploy to VPS Contabo" \
  --created="$(date -u -d '7 days ago' '+%Y-%m-%d')" \
  --json conclusion,createdAt,updatedAt,displayTitle \
  --jq '.[] | {
    title: .displayTitle,
    duration: (((.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 60),
    status: .conclusion
  }'
```

#### 2. Queue actuelle

```bash
gh run list \
  --workflow="Deploy to VPS Contabo" \
  --status=queued,in_progress \
  --json databaseId,status,createdAt,displayTitle \
  --jq 'length'
```

#### 3. Historique verrous (si loggé)

```bash
ssh root@84.247.165.187 \
  "journalctl -u docker -g 'deploy-with-lock' --since '1 day ago'"
```

### Dashboard (Phase 3 - Futur)

**Page** : `/super-admin/deployments`

**Widgets** :
- 🟢 Status déploiement en cours
- 📊 Queue length temps réel
- 📈 Historique 20 derniers déploiements (durée, status, tier)
- 🔒 État verrou VPS (libre/occupé, détails)
- ⏱️ Métriques (avg duration, skip rate, success rate)
- 🚨 Alertes (déploiement >20min, queue >5, orphans)

**API** : `GET /api/admin/deployment-status`

**Exemple Response** :
```json
{
  "lock": {
    "status": "locked",
    "holder": {
      "pid": 12345,
      "user": "root",
      "started": "2026-02-13T10:30:45Z",
      "duration_seconds": 325,
      "command": "docker compose up -d nextjs"
    }
  },
  "queue": {
    "length": 2,
    "runs": [
      {
        "id": 12345678,
        "status": "in_progress",
        "started": "2026-02-13T10:35:00Z"
      },
      {
        "id": 12345679,
        "status": "queued",
        "created": "2026-02-13T10:36:00Z"
      }
    ]
  },
  "last_deployment": {
    "sha": "a1b2c3d",
    "status": "success",
    "tier": "1-lightning",
    "duration_seconds": 185,
    "completed": "2026-02-13T10:25:00Z"
  },
  "health": {
    "status": "healthy",
    "checked_at": "2026-02-13T10:37:00Z"
  }
}
```

---

## Annexes

### A. Configuration Verrou

**Fichier** : `scripts/deploy-with-lock.sh`

**Paramètres configurables** :

```bash
LOCKFILE="/var/lock/qadhya-deploy.lock"      # Chemin lockfile
TIMEOUT=1800                                  # Timeout en secondes (30 min)
LOCK_INFO_FILE="/var/lock/qadhya-deploy.info" # Métadonnées
```

**Pour modifier le timeout** :

```bash
# Sur VPS, éditer le script
ssh root@84.247.165.187 \
  "sed -i 's/TIMEOUT=1800/TIMEOUT=3600/' /opt/moncabinet/scripts/deploy-with-lock.sh"

# 3600s = 1 heure
```

### B. Configuration Queue

**Fichier** : `.github/workflows/deploy-vps.yml`

**Paramètres configurables** :

```yaml
# Job check-queue, ligne ~50
if [ "$PENDING" -ge 3 ]; then
  # Changer "3" pour ajuster seuil
```

**Pour désactiver complètement le skip** :

```yaml
check-queue:
  # ...
  steps:
    - name: Check pending deployments
      id: check
      run: |
        # Toujours procéder
        echo "should_skip=false" >> $GITHUB_OUTPUT
        echo "queue_length=0" >> $GITHUB_OUTPUT
```

### C. Exemple Logs Complets

#### Déploiement Lightning réussi avec verrou

```
================================================
Run salmenktata/moncabinet/.github/workflows/deploy-vps.yml@main
================================================

> Job: check-queue
📊 Déploiements en queue/en cours: 1
✅ Proceeding with deployment

> Job: detect-changes
Changed files:
app/page.tsx
lib/utils.ts
---
Code-only changes -> Tier 1 (Lightning)

> Job: deploy-fast
  > Step: Upload deploy scripts
    deploy-with-lock.sh      100%  2.1KB
    check-deploy-lock.sh     100%  3.5KB

  > Step: Upload and deploy
    deploy.tar.gz            100%  45MB

    ℹ️  Tentative d'acquisition du verrou de déploiement...
    ℹ️  Timeout: 1800s (30 minutes)
    ✅ Verrou acquis avec succès
    ℹ️  Informations du verrou enregistrées
    ℹ️  Exécution de la commande: bash -c ...

    Extracting bundle...
    Cleaning old artifacts...
    Copying files to container...
    Restarting container...
    Lightning deploy completed at Thu Feb 13 10:35:42 UTC 2026

    ✅ Déploiement terminé avec succès
    ℹ️  Verrou libéré

  > Step: Health check
    Waiting 30s for container...
    ================================================
    Health check attempt 1/3 (10:36:12)
    PostgreSQL: accepting connections
    MinIO: OK
    API Response: {"status":"healthy","timestamp":"2026-02-13T10:36:12Z"}
    ================================================
    ✓ Health check PASSED!
    Deployed SHA: N/A (Lightning Deploy)
    ================================================

> Job: notify
✅ Lightning Deploy (Tier 1) successful!
```

---

**Dernière mise à jour** : 13 février 2026
**Auteur** : Claude Code
**Version** : 1.0
