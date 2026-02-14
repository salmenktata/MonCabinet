# Phase 6 : Déclenchement Manuel des Crons (Manual Trigger UI)

## 📋 Vue d'ensemble

Cette fonctionnalité permet de déclencher manuellement n'importe quel cron directement depuis le dashboard Super Admin, sans avoir besoin d'accès SSH.

**Dashboard** : https://qadhya.tn/super-admin/monitoring?tab=crons

## 🏗️ Architecture

### Composants

1. **Cron Trigger Server** (`cron-trigger-server.py`)
   - Serveur HTTP Python sur le host (port 9998)
   - Accessible uniquement en localhost (host + conteneurs)
   - Exécute les scripts cron en background
   - Service systemd avec auto-restart

2. **API Next.js** (`/api/admin/cron-executions/trigger`)
   - Endpoint POST pour déclencher un cron
   - Endpoint GET pour lister les crons disponibles
   - Vérifie qu'un cron n'est pas déjà running
   - Appelle le trigger server via HTTP

3. **UI Components**
   - `CronQuickTrigger` : Grille de boutons en haut du dashboard
   - `CronTriggerModal` : Modal de confirmation avec détails
   - Intégré dans `CronsAndBatchesTab`

### Flux d'Exécution

```
User (Dashboard)
    ↓ Click "▶️ Exécuter"
CronTriggerModal (Confirmation)
    ↓ POST /api/admin/cron-executions/trigger
API Next.js (Validation)
    ↓ HTTP POST localhost:9998/trigger
Cron Trigger Server (Host)
    ↓ subprocess.Popen()
Script Cron (.sh ou .ts)
    ↓ cron_start() → cron_complete()
Database (cron_executions)
```

## 🚀 Installation Production

### 1. Déployer les fichiers

```bash
# Push vers GitHub (déploiement automatique via GHA)
git add .
git commit -m "feat(monitoring): Phase 6 - Manual Trigger UI"
git push origin main

# Attendre déploiement Tier 2 Docker (~8-10min)
gh run list --workflow="Deploy to VPS Contabo" --limit 1
```

### 2. Installer le Cron Trigger Server

SSH vers le VPS :

```bash
ssh root@84.247.165.187

# Vérifier que les fichiers sont déployés
ls -lh /opt/qadhya/scripts/cron-trigger-server.py
ls -lh /opt/qadhya/scripts/cron-trigger-server.service
ls -lh /opt/qadhya/scripts/install-cron-trigger-server.sh

# Rendre les scripts exécutables
chmod +x /opt/qadhya/scripts/cron-trigger-server.py
chmod +x /opt/qadhya/scripts/install-cron-trigger-server.sh

# Installer le service systemd
bash /opt/qadhya/scripts/install-cron-trigger-server.sh
```

Le script d'installation va :
- ✅ Copier le script Python
- ✅ Créer le fichier log
- ✅ Installer le service systemd
- ✅ Activer et démarrer le service
- ✅ Afficher le statut

### 3. Vérifier l'installation

```bash
# Vérifier le service systemd
systemctl status cron-trigger-server

# Output attendu:
# ● cron-trigger-server.service - Qadhya Cron Trigger Server
#    Loaded: loaded (/etc/systemd/system/cron-trigger-server.service; enabled)
#    Active: active (running) since ...
#    Main PID: ...

# Tester le health check
curl http://localhost:9998/health | jq .

# Output attendu:
# {
#   "status": "healthy",
#   "service": "cron-trigger-server",
#   "port": 9998,
#   "available_crons": 7
# }

# Voir les logs
tail -f /var/log/qadhya/cron-trigger-server.log

# Voir les logs systemd
journalctl -u cron-trigger-server -f
```

### 4. Configurer Next.js

Ajouter la variable d'environnement dans `/opt/qadhya/.env.production.local` :

```bash
# Cron Trigger Server URL (depuis conteneur nextjs)
CRON_TRIGGER_SERVER_URL=http://host.docker.internal:9998/trigger
```

**Important** : `host.docker.internal` permet au conteneur nextjs d'accéder au host.

Redémarrer le conteneur Next.js :

```bash
docker compose restart nextjs
```

### 5. Tester depuis le dashboard

1. Ouvrir https://qadhya.tn/super-admin/monitoring?tab=crons
2. Section "Déclenchement Manuel" devrait apparaître en haut
3. Cliquer sur un bouton (ex: "monitor-openai")
4. Modal de confirmation s'ouvre
5. Cliquer "Exécuter Maintenant"
6. Message de succès après 1-2 secondes
7. Rafraîchir la page → Nouvelle exécution dans la table

## 🧪 Tests

### Test 1: Health Check Server

```bash
curl http://localhost:9998/health
```

Résultat attendu :
```json
{
  "status": "healthy",
  "service": "cron-trigger-server",
  "port": 9998,
  "available_crons": 7
}
```

### Test 2: Trigger Manual via API

```bash
# Depuis le host
curl -X POST http://localhost:9998/trigger \
  -H "Content-Type: application/json" \
  -d '{"cronName": "monitor-openai"}'
```

Résultat attendu :
```json
{
  "success": true,
  "cronName": "monitor-openai",
  "description": "Monitoring Budget OpenAI",
  "message": "Cron execution started in background",
  "logFile": "/var/log/qadhya/monitor-openai.log"
}
```

Vérifier l'exécution :

```bash
# Voir les logs du cron
tail -20 /var/log/qadhya/monitor-openai.log

# Vérifier dans la base
docker exec 275ce01791bf_qadhya-postgres psql -U moncabinet -d qadhya -c \
  "SELECT cron_name, status, duration_ms, started_at
   FROM cron_executions
   WHERE cron_name = 'monitor-openai'
   ORDER BY started_at DESC LIMIT 3;"
```

### Test 3: Trigger depuis Dashboard UI

1. Ouvrir https://qadhya.tn/super-admin/monitoring?tab=crons
2. Cliquer sur bouton "check-alerts" (le plus rapide ~2s)
3. Modal s'ouvre avec :
   - Nom : `check-alerts`
   - Description : `Vérification Alertes Système`
   - Durée estimée : `2s`
4. Cliquer "Exécuter Maintenant"
5. Spinner "Démarrage..." pendant 1-2s
6. Message "✅ Cron démarré avec succès !"
7. Modal se ferme automatiquement après 2s
8. Rafraîchir la page (ou attendre 30s auto-refresh)
9. Nouvelle ligne dans la table "Historique Exécutions"

### Test 4: Prévention Double Exécution

1. Déclencher `index-kb-progressive` (long, ~45s)
2. Pendant qu'il tourne, essayer de le re-déclencher
3. Modal devrait afficher erreur : "Ce cron est déjà en cours d'exécution. Attendez sa fin."

### Test 5: Service Restart Auto

```bash
# Tuer le process
pkill -f cron-trigger-server.py

# Vérifier qu'il redémarre automatiquement (RestartSec=10s)
sleep 15
systemctl status cron-trigger-server

# Devrait afficher "active (running)"
```

## 📊 Monitoring

### Logs Serveur

```bash
# Logs en temps réel
tail -f /var/log/qadhya/cron-trigger-server.log

# Logs systemd
journalctl -u cron-trigger-server -f

# Logs avec filtrage
journalctl -u cron-trigger-server --since "1 hour ago"
```

### Logs Crons Déclenchés

Chaque cron écrit ses logs dans `/var/log/qadhya/{cron-name}.log` :

```bash
tail -f /var/log/qadhya/monitor-openai.log
tail -f /var/log/qadhya/check-alerts.log
tail -f /var/log/qadhya/index-kb.log
```

### Métriques Dashboard

Le dashboard affiche automatiquement :
- ✅ **Badge "En cours"** pendant l'exécution
- 🔄 **Auto-refresh 30s** pour voir les résultats
- 📊 **Nouvelle ligne** dans la table avec durée réelle
- ⚡ **KPIs mis à jour** (total exécutions, succès rate)

## 🔧 Maintenance

### Redémarrer le Service

```bash
systemctl restart cron-trigger-server
```

### Voir les Statuts

```bash
# Service systemd
systemctl status cron-trigger-server

# Processus Python
ps aux | grep cron-trigger-server

# Port 9998 listening
netstat -tulpn | grep 9998
```

### Changer le Port

Si le port 9998 est déjà utilisé :

1. Éditer `scripts/cron-trigger-server.py` :
   ```python
   PORT = 9999  # Nouveau port
   ```

2. Mettre à jour `.env.production.local` :
   ```env
   CRON_TRIGGER_SERVER_URL=http://host.docker.internal:9999/trigger
   ```

3. Redéployer :
   ```bash
   systemctl restart cron-trigger-server
   docker compose restart nextjs
   ```

### Désinstaller

```bash
# Arrêter et désactiver le service
systemctl stop cron-trigger-server
systemctl disable cron-trigger-server

# Supprimer les fichiers
rm /etc/systemd/system/cron-trigger-server.service
rm /var/log/qadhya/cron-trigger-server.log

# Reload systemd
systemctl daemon-reload
```

## 🔒 Sécurité

### Accès Réseau

- **Port 9998** : Écoute uniquement sur `0.0.0.0` (tous interfaces)
- **Accessible** : Host + conteneurs Docker via `host.docker.internal`
- **Non exposé** : Pas de mapping dans docker-compose (pas accessible depuis Internet)
- **Firewall** : Règles UFW bloquent accès externe

### Permissions

- **Service** : Exécuté en tant que `root` (nécessaire pour exécuter scripts cron)
- **Scripts** : Tous en `chmod +x` avec owner `root`
- **Logs** : Fichiers `chmod 644` (lecture seule pour autres users)

### Authentication

**Aucune authentication** sur le trigger server car :
- Accessible uniquement depuis localhost (host + conteneurs)
- L'API Next.js vérifie déjà la session admin avant d'appeler le trigger
- Pas exposé sur Internet

Si besoin de sécuriser davantage, ajouter un token secret :

```python
# Dans cron-trigger-server.py
TRIGGER_SECRET = os.getenv("CRON_TRIGGER_SECRET", "change-me")

# Vérifier le header
auth_header = self.headers.get("X-Trigger-Secret")
if auth_header != TRIGGER_SECRET:
    self.send_error(401, "Unauthorized")
    return
```

## 📚 Références

### Fichiers Créés

**Backend** :
- `scripts/cron-trigger-server.py` - Serveur HTTP Python
- `scripts/cron-trigger-server.service` - Service systemd
- `scripts/install-cron-trigger-server.sh` - Script installation

**API** :
- `app/api/admin/cron-executions/trigger/route.ts` - Endpoint trigger

**UI** :
- `components/super-admin/monitoring/CronQuickTrigger.tsx` - Grille boutons
- `components/super-admin/monitoring/CronTriggerModal.tsx` - Modal confirmation
- `components/super-admin/monitoring/CronsAndBatchesTab.tsx` - Intégration

**Documentation** :
- `docs/CRON_MANUAL_TRIGGER.md` - Ce fichier

### Variables d'Environnement

```env
# .env.production.local
CRON_TRIGGER_SERVER_URL=http://host.docker.internal:9998/trigger
```

### Commandes Essentielles

```bash
# Installation
bash /opt/qadhya/scripts/install-cron-trigger-server.sh

# Gestion service
systemctl status cron-trigger-server
systemctl restart cron-trigger-server
systemctl stop cron-trigger-server

# Logs
tail -f /var/log/qadhya/cron-trigger-server.log
journalctl -u cron-trigger-server -f

# Tests
curl http://localhost:9998/health
curl -X POST http://localhost:9998/trigger -H "Content-Type: application/json" -d '{"cronName": "monitor-openai"}'
```

## 🎯 Roadmap Futures Améliorations

### Phase 6.1 : Scheduling Custom (Planifié)

Permettre de planifier une exécution future :
- Modal avec date/time picker
- Stockage dans table `scheduled_triggers`
- Cron job qui vérifie et exécute

### Phase 6.2 : Paramètres Cron (Future)

Passer des paramètres aux crons :
- UI avec formulaire dynamique par cron
- Exemples : nombre de docs à indexer, catégories spécifiques
- Transmission via variables d'environnement ou args

### Phase 6.3 : Notifications Temps Réel (Future)

- WebSocket pour notifier fin d'exécution
- Toast notification dans le dashboard
- Pas besoin de rafraîchir la page

---

**Version** : 1.0
**Date** : 14 février 2026
**Statut** : ⏳ Prêt pour déploiement
**Auteur** : Système de monitoring Qadhya
