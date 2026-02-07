# Guide de Déploiement MonCabinet sur VPS Contabo

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Phase 1: Préparation VPS](#phase-1-préparation-vps)
4. [Phase 2: Configuration Docker](#phase-2-configuration-docker)
5. [Phase 3: Configuration Nginx](#phase-3-configuration-nginx)
6. [Phase 4: Migration Données](#phase-4-migration-données)
7. [Phase 5: Monitoring](#phase-5-monitoring)
8. [Maintenance](#maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Vue d'Ensemble

### Architecture Déployée

```
VPS Contabo (30GB RAM, 600GB SSD)
├── Docker Compose
│   ├── PostgreSQL 15 (port 5432)
│   ├── MinIO (ports 9000, 9001)
│   └── Next.js 15 (port 3000)
├── Nginx (reverse proxy + SSL)
├── Certbot (Let's Encrypt)
└── Backups automatiques (cron)
```

### Stack Technique

- **OS**: Ubuntu 22.04 LTS
- **Runtime**: Node.js 18 (via Docker)
- **Database**: PostgreSQL 15
- **Storage**: MinIO (S3-compatible)
- **Web Server**: Nginx
- **SSL**: Let's Encrypt (Certbot)
- **Monitoring**: Netdata + UptimeRobot

### Coûts Mensuels

| Service | Coût |
|---------|------|
| VPS Contabo L | ~25€ |
| Domaine .tn | ~1.67€ |
| Let's Encrypt SSL | Gratuit |
| **TOTAL** | **~27€/mois** |

---

## Prérequis

### 1. VPS Contabo Commandé

- **Plan recommandé**: VPS L (30GB RAM, 600GB SSD)
- **Localisation**: Europe (Nuremberg ou Amsterdam)
- **OS**: Ubuntu 22.04 LTS

### 2. Domaine Configuré

Configurer les enregistrements DNS :

```
Type    Nom              Valeur              TTL
A       @                <IP_VPS>            3600
A       www              <IP_VPS>            3600
CNAME   minio            moncabinet.tn       3600
```

Vérifier propagation DNS :
```bash
dig +short moncabinet.tn
dig +short www.moncabinet.tn
```

### 3. Accès SSH

Générer clé SSH (si pas déjà fait) :
```bash
ssh-keygen -t ed25519 -C "admin@moncabinet.tn"
```

Tester connexion :
```bash
ssh root@<IP_VPS>
```

### 4. Variables d'Environnement

Préparer les secrets (à générer avec `openssl rand -base64 32`) :

- `DB_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

---

## Phase 1: Préparation VPS

### Étape 1.1: Connexion Initiale

```bash
ssh root@<IP_VPS>
```

### Étape 1.2: Mise à Jour Système

```bash
apt update && apt upgrade -y
apt autoremove -y
```

### Étape 1.3: Créer Utilisateur Non-Root

```bash
# Créer utilisateur moncabinet
adduser moncabinet

# Ajouter aux sudoers
usermod -aG sudo moncabinet

# Configurer SSH pour cet utilisateur
mkdir -p /home/moncabinet/.ssh
cp ~/.ssh/authorized_keys /home/moncabinet/.ssh/
chown -R moncabinet:moncabinet /home/moncabinet/.ssh
chmod 700 /home/moncabinet/.ssh
chmod 600 /home/moncabinet/.ssh/authorized_keys
```

### Étape 1.4: Sécuriser SSH

```bash
nano /etc/ssh/sshd_config
```

Modifier :
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Redémarrer SSH :
```bash
systemctl restart sshd
```

**⚠️ IMPORTANT** : Tester connexion avec nouvel utilisateur AVANT de fermer la session root !

```bash
# Dans un nouveau terminal
ssh moncabinet@<IP_VPS>
```

### Étape 1.5: Configurer Firewall UFW

```bash
# Configurer UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Activer
ufw enable

# Vérifier
ufw status verbose
```

Résultat attendu :
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere                   # SSH
80/tcp                     ALLOW       Anywhere                   # HTTP
443/tcp                    ALLOW       Anywhere                   # HTTPS
```

### Étape 1.6: Installer Fail2Ban

```bash
apt install -y fail2ban

# Copier config par défaut
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Éditer config SSH
nano /etc/fail2ban/jail.local
```

Modifier section `[sshd]` :
```ini
[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime = 3600
findtime = 600
```

Démarrer Fail2Ban :
```bash
systemctl enable fail2ban
systemctl start fail2ban
systemctl status fail2ban

# Vérifier jails actives
fail2ban-client status
```

### Étape 1.7: Installer Docker

```bash
# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Ajouter utilisateur au groupe docker
usermod -aG docker moncabinet

# Démarrer Docker
systemctl enable docker
systemctl start docker

# Vérifier installation
docker --version
docker compose version
```

### Étape 1.8: Installer Node.js (pour scripts)

```bash
# Installer nvm
su - moncabinet
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash

# Recharger shell
source ~/.bashrc

# Installer Node.js 18
nvm install 18
nvm use 18
nvm alias default 18

# Vérifier
node --version  # v18.x.x
npm --version   # 9.x.x
```

### Étape 1.9: Installer Nginx

```bash
apt install -y nginx

# Démarrer Nginx
systemctl enable nginx
systemctl start nginx
systemctl status nginx
```

Tester : Ouvrir `http://<IP_VPS>` dans navigateur → Page "Welcome to nginx!"

### Étape 1.10: Installer Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### Étape 1.11: Installer Outils Système

```bash
apt install -y \
  git \
  curl \
  wget \
  htop \
  net-tools \
  unzip \
  vim \
  jq
```

---

## Phase 2: Configuration Docker

### Étape 2.1: Créer Structure Projet

```bash
# Se connecter en tant que moncabinet
su - moncabinet

# Créer dossiers
sudo mkdir -p /opt/moncabinet
sudo chown -R moncabinet:moncabinet /opt/moncabinet
cd /opt/moncabinet

# Cloner repository
git clone https://github.com/votre-org/moncabinet.git .

# Ou copier fichiers via SCP depuis local
# scp -r /local/path/* moncabinet@<IP_VPS>:/opt/moncabinet/
```

### Étape 2.2: Configurer .env.production

```bash
cd /opt/moncabinet
cp .env.production.example .env.production
nano .env.production
```

Remplir toutes les variables (voir fichier `.env.production` créé précédemment).

**Générer secrets** :
```bash
# DB_PASSWORD
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# MINIO_ROOT_PASSWORD
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# NEXTAUTH_SECRET
openssl rand -base64 32

# CRON_SECRET
openssl rand -base64 32

# GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN
openssl rand -hex 16

# WHATSAPP_WEBHOOK_VERIFY_TOKEN
openssl rand -hex 10
```

**Sécuriser** :
```bash
chmod 600 .env.production
ls -la .env.production  # -rw------- 1 moncabinet moncabinet
```

### Étape 2.3: Charger Variables et Build

```bash
# Charger variables
export $(grep -v '^#' .env.production | xargs)

# Installer dépendances
npm ci

# Build Docker images
docker-compose build
```

Sortie attendue :
```
[+] Building 123.4s (23/23) FINISHED
 => [nextjs internal] load build definition from Dockerfile
 => => transferring dockerfile: 1.23kB
 ...
 => [nextjs] exporting to image
 => => exporting layers
 => => writing image sha256:abc123...
```

### Étape 2.4: Démarrer Stack Docker

```bash
docker-compose up -d
```

Vérifier containers :
```bash
docker-compose ps
```

Résultat attendu :
```
NAME                   IMAGE                STATUS         PORTS
moncabinet-nextjs      moncabinet-nextjs    Up 2 minutes   127.0.0.1:3000->3000/tcp
moncabinet-postgres    postgres:15-alpine   Up 2 minutes   127.0.0.1:5432->5432/tcp
moncabinet-minio       minio/minio:latest   Up 2 minutes   127.0.0.1:9000-9001->9000-9001/tcp
```

### Étape 2.5: Vérifier Logs

```bash
# Logs tous containers
docker-compose logs -f --tail=50

# Logs Next.js seulement
docker-compose logs -f nextjs

# Logs PostgreSQL
docker-compose logs -f postgres

# Logs MinIO
docker-compose logs -f minio
```

### Étape 2.6: Health Check

```bash
# Attendre 30s que l'app démarre
sleep 30

# Tester health endpoint
curl http://localhost:3000/api/health | jq
```

Résultat attendu :
```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T10:30:00.000Z",
  "uptime": 123.45,
  "responseTime": "15ms",
  "services": {
    "database": "healthy",
    "storage": "healthy",
    "api": "healthy"
  },
  "version": "1.0.0"
}
```

---

## Phase 3: Configuration Nginx

### Étape 3.1: Obtenir Certificat SSL

```bash
# Arrêter Nginx temporairement
sudo systemctl stop nginx

# Obtenir certificat
sudo certbot certonly --standalone \
  -d moncabinet.tn \
  -d www.moncabinet.tn \
  --agree-tos \
  --email admin@moncabinet.tn \
  --non-interactive

# Redémarrer Nginx
sudo systemctl start nginx
```

Certificats générés dans :
```
/etc/letsencrypt/live/moncabinet.tn/fullchain.pem
/etc/letsencrypt/live/moncabinet.tn/privkey.pem
```

### Étape 3.2: Créer Configuration Nginx

```bash
sudo nano /etc/nginx/sites-available/moncabinet.tn
```

Copier la configuration depuis le plan de déploiement (configuration Nginx complète avec rate limiting, SSL, etc.).

### Étape 3.3: Activer Site

```bash
# Tester configuration
sudo nginx -t

# Créer lien symbolique
sudo ln -s /etc/nginx/sites-available/moncabinet.tn /etc/nginx/sites-enabled/

# Supprimer config par défaut
sudo rm /etc/nginx/sites-enabled/default

# Recharger Nginx
sudo systemctl reload nginx
```

### Étape 3.4: Tester HTTPS

```bash
# Tester redirection HTTP → HTTPS
curl -I http://moncabinet.tn
# Doit retourner: HTTP/1.1 301 Moved Permanently
# Location: https://moncabinet.tn/

# Tester HTTPS
curl -I https://moncabinet.tn
# Doit retourner: HTTP/2 200
```

Ouvrir dans navigateur : `https://moncabinet.tn` → Application doit s'afficher

### Étape 3.5: Tester SSL Grade

Visiter : https://www.ssllabs.com/ssltest/analyze.html?d=moncabinet.tn

Objectif : **Grade A ou A+**

### Étape 3.6: Configurer Auto-Renewal Certbot

```bash
# Vérifier timer systemd
sudo systemctl status certbot.timer

# Tester renewal à sec
sudo certbot renew --dry-run
```

Certbot renouvelle automatiquement les certificats 30 jours avant expiration.

---

## Phase 4: Migration Données

### Étape 4.1: Préparer Migration

```bash
cd /opt/moncabinet

# Installer dépendances TypeScript
npm install -g tsx

# Vérifier que .env contient SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
nano .env.production
```

### Étape 4.2: Exécuter Script Migration

```bash
# Lancer migration
tsx scripts/migrate-from-supabase.ts
```

Sortie attendue :
```
🚀 Migration Supabase → VPS PostgreSQL + MinIO
============================================

🔌 Test connexions...
  ✅ PostgreSQL VPS connecté
  ✅ MinIO VPS connecté

📦 Migration table: users
  📊 5 lignes à migrer
  ✅ 5/5 migrées

📦 Migration table: clients
  📊 123 lignes à migrer
  ✅ 123/123 migrées

...

📦 Migration Storage (Supabase → MinIO)
  📊 456 fichiers à migrer
  ✅ 456/456 fichiers migrés (234.56 MB)

============================================
       RAPPORT DE MIGRATION
============================================

📊 Tables migrées:
  ✅ users: 5/5 (0 erreurs)
  ✅ clients: 123/123 (0 erreurs)
  ✅ dossiers: 87/87 (0 erreurs)
  ✅ documents: 456/456 (0 erreurs)
  ...

Total lignes: 789/789
Erreurs tables: 0

📦 Storage migré:
  Fichiers: 456/456 (234.56 MB)
  Erreurs: 0

⏱️  Durée: 45.23s

✅ Migration réussie!
============================================
```

### Étape 4.3: Vérifier Données Migrées

```bash
# Connexion PostgreSQL
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Vérifier tables
\dt

# Compter lignes
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM clients;
SELECT COUNT(*) FROM documents;

# Quitter
\q
```

```bash
# Vérifier MinIO
docker exec -it moncabinet-minio bash
mc alias set myminio http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc ls myminio/documents
mc du myminio/documents
exit
```

### Étape 4.4: Configurer pg_cron

```bash
# Entrer dans container PostgreSQL
docker exec -it moncabinet-postgres bash

# Installer pg_cron
apt update
apt install -y postgresql-15-cron

# Ajouter à postgresql.conf
echo "shared_preload_libraries = 'pg_cron'" >> /var/lib/postgresql/data/pgdata/postgresql.conf

# Redémarrer container
exit
docker-compose restart postgres

# Créer extension
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet -c "CREATE EXTENSION IF NOT EXISTS pg_cron;"
```

### Étape 4.5: Configurer Cronjobs

```bash
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet
```

Exécuter SQL :
```sql
-- Cron notifications quotidiennes (4h UTC = 6h Tunisie)
SELECT cron.schedule(
  'daily-notifications',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'http://nextjs:3000/api/cron/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Définir secret cron (remplacer par votre CRON_SECRET)
ALTER DATABASE moncabinet SET app.cron_secret = 'VOTRE_CRON_SECRET';

-- Vérifier jobs
SELECT * FROM cron.job;
```

### Étape 4.6: Configurer Backups Automatiques

```bash
# Ajouter backup au crontab
crontab -e
```

Ajouter :
```cron
# Backup quotidien à 3h du matin
0 3 * * * /opt/moncabinet/backup.sh >> /var/log/moncabinet-backup.log 2>&1
```

Tester backup :
```bash
./backup.sh
```

---

## Phase 5: Monitoring

### Étape 5.1: Installer Netdata

```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

Accès : `http://<IP_VPS>:19999`

### Étape 5.2: Configurer UptimeRobot

1. Créer compte : https://uptimerobot.com
2. Ajouter monitor :
   - **Type** : HTTPS
   - **URL** : `https://moncabinet.tn/api/health`
   - **Interval** : 5 minutes
   - **Alert Contacts** : Email admin

### Étape 5.3: Configurer Logs Nginx

```bash
# Créer logrotate config
sudo nano /etc/logrotate.d/moncabinet
```

Ajouter :
```
/var/log/nginx/moncabinet_*.log {
  daily
  rotate 14
  compress
  delaycompress
  notifempty
  create 0640 www-data adm
  sharedscripts
  postrotate
    systemctl reload nginx > /dev/null 2>&1
  endscript
}
```

---

## Maintenance

### Mettre à Jour l'Application

```bash
cd /opt/moncabinet
./deploy.sh
```

### Voir Logs Live

```bash
# Tous containers
docker-compose logs -f --tail=100

# Next.js uniquement
docker-compose logs -f nextjs

# PostgreSQL uniquement
docker-compose logs -f postgres
```

### Redémarrer Services

```bash
# Redémarrer tous containers
docker-compose restart

# Redémarrer Next.js uniquement
docker-compose restart nextjs

# Arrêter tous containers
docker-compose down

# Démarrer tous containers
docker-compose up -d
```

### Backup Manuel

```bash
cd /opt/moncabinet
./backup.sh
```

### Restaurer Backup

```bash
# Restaurer PostgreSQL
gunzip -c /opt/backups/moncabinet/db_20260205_030000.sql.gz | \
  docker exec -i moncabinet-postgres psql -U moncabinet moncabinet

# Restaurer MinIO
docker run --rm \
  --network moncabinet_moncabinet-network \
  -v /opt/backups/moncabinet/minio_20260205_030000:/backup \
  minio/mc:latest \
  mirror /backup/documents myminio/documents
```

---

## Troubleshooting

### Container ne démarre pas

```bash
# Vérifier logs
docker-compose logs nextjs

# Reconstruire image
docker-compose build --no-cache nextjs
docker-compose up -d
```

### Application inaccessible

```bash
# Vérifier status containers
docker-compose ps

# Vérifier health check
curl http://localhost:3000/api/health

# Vérifier Nginx
sudo nginx -t
sudo systemctl status nginx

# Vérifier firewall
sudo ufw status
```

### Erreur PostgreSQL

```bash
# Vérifier logs
docker-compose logs postgres

# Connexion PostgreSQL
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Vérifier connexions actives
SELECT * FROM pg_stat_activity;
```

### Erreur MinIO

```bash
# Vérifier logs
docker-compose logs minio

# Accéder console MinIO
# Ouvrir http://<IP_VPS>:9001 ou https://moncabinet.tn/minio/

# Vérifier bucket
docker exec -it moncabinet-minio mc ls myminio/documents
```

### Disque plein

```bash
# Vérifier espace
df -h

# Nettoyer Docker
docker system prune -a --volumes

# Nettoyer anciens backups
find /opt/backups/moncabinet -mtime +14 -delete

# Nettoyer logs
journalctl --vacuum-time=7d
```

### Certificat SSL expiré

```bash
# Renouveler manuellement
sudo certbot renew

# Recharger Nginx
sudo systemctl reload nginx
```

---

## Commandes Utiles

```bash
# Status général
docker-compose ps
docker-compose logs -f --tail=50
curl https://moncabinet.tn/api/health | jq

# Performance
htop
docker stats

# Disque
df -h
du -sh /opt/moncabinet
du -sh /opt/backups/moncabinet

# Réseau
netstat -tulpn | grep -E ':(80|443|3000|5432|9000)'

# Firewall
sudo ufw status verbose

# Nginx
sudo nginx -t
sudo systemctl status nginx
tail -f /var/log/nginx/moncabinet_access.log

# SSL
sudo certbot certificates
```

---

## Support

Pour toute question ou problème :

- **Documentation** : `/opt/moncabinet/docs/`
- **Logs** : `docker-compose logs -f`
- **GitHub Issues** : https://github.com/votre-org/moncabinet/issues

---

**Dernière mise à jour** : 2026-02-05
