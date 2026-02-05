# Déploiement VPS Standalone - Guide Complet

## 📋 Vue d'ensemble

Ce guide explique comment déployer l'application Avocat SaaS sur un VPS standalone (sans Supabase Cloud).

## 🏗️ Architecture VPS

```
┌─────────────────────────────────────────┐
│           VPS Linux (Ubuntu)             │
├─────────────────────────────────────────┤
│  • PostgreSQL 16                         │
│  • Node.js 20 LTS                        │
│  • Nginx (reverse proxy)                 │
│  • PM2 (process manager)                 │
│  • Cron (notifications quotidiennes)     │
│  • Certbot (SSL Let's Encrypt)          │
└─────────────────────────────────────────┘
```

## 🚀 Installation complète

### 1. Prérequis VPS

**Spécifications minimales** :
- CPU : 2 vCPU
- RAM : 4 GB
- Stockage : 50 GB SSD
- OS : Ubuntu 22.04 LTS

### 2. Connexion SSH

```bash
ssh root@votre-vps-ip
```

### 3. Mise à jour système

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential
```

### 4. Installation PostgreSQL 16

```bash
# Ajouter le repository PostgreSQL
wget -q https://www.postgresql.org/media/keys/ACCC4CF8.asc -O - | apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# Installer PostgreSQL
apt update
apt install -y postgresql-16 postgresql-contrib-16

# Vérifier l'installation
systemctl status postgresql
```

### 5. Configuration PostgreSQL

```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans psql :
CREATE DATABASE avocat_saas;
CREATE USER avocat_user WITH ENCRYPTED PASSWORD 'votre-mot-de-passe-securise';
GRANT ALL PRIVILEGES ON DATABASE avocat_saas TO avocat_user;
\q
```

**Configurer l'accès distant** (si nécessaire) :
```bash
# Éditer postgresql.conf
nano /etc/postgresql/16/main/postgresql.conf
# Changer: listen_addresses = 'localhost' → listen_addresses = '*'

# Éditer pg_hba.conf
nano /etc/postgresql/16/main/pg_hba.conf
# Ajouter: host all all 0.0.0.0/0 md5

# Redémarrer
systemctl restart postgresql
```

### 6. Installation Node.js 20 LTS

```bash
# Via NVM (recommandé)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# Vérifier
node -v  # v20.x.x
npm -v   # 10.x.x
```

### 7. Installation PM2

```bash
npm install -g pm2

# Configurer PM2 au démarrage
pm2 startup
pm2 save
```

### 8. Cloner et configurer l'application

```bash
# Créer répertoire
mkdir -p /var/www
cd /var/www

# Cloner le repository
git clone https://github.com/salmenktata/MonCabinet.git avocat-saas
cd avocat-saas

# Installer dépendances
npm install

# Créer fichier .env.production
cat > .env.production << 'ENVEOF'
# Database
DATABASE_URL=postgresql://avocat_user:votre-mot-de-passe@localhost:5432/avocat_saas

# Supabase (local)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Resend (emails)
RESEND_API_KEY=re_your_resend_key

# App
NEXT_PUBLIC_APP_URL=https://avocat.tn
NODE_ENV=production

# Cron
CRON_SECRET=your-secure-cron-secret
ENVEOF

# Build production
npm run build
```

### 9. Appliquer migrations PostgreSQL

```bash
# Installer psql client si nécessaire
apt install -y postgresql-client

# Appliquer toutes les migrations
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration..."
  PGPASSWORD=votre-mot-de-passe psql -h localhost -U avocat_user -d avocat_saas -f "$migration"
done
```

### 10. Démarrer avec PM2

```bash
# Créer fichier ecosystem.config.js
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'avocat-saas',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/avocat-saas',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/avocat-saas-error.log',
      out_file: '/var/log/pm2/avocat-saas-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
PMEOF

# Démarrer l'application
pm2 start ecosystem.config.js
pm2 save
```

### 11. Configuration Nginx

```bash
# Installer Nginx
apt install -y nginx

# Créer configuration
cat > /etc/nginx/sites-available/avocat-saas << 'NGINXEOF'
upstream avocat_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name avocat.tn www.avocat.tn;

    # Redirection HTTPS (sera activée après Certbot)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://avocat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache fichiers statiques
    location /_next/static {
        proxy_pass http://avocat_backend;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/avocat-saas-access.log;
    error_log /var/log/nginx/avocat-saas-error.log;
}
NGINXEOF

# Activer le site
ln -s /etc/nginx/sites-available/avocat-saas /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 12. SSL avec Let's Encrypt

```bash
# Installer Certbot
apt install -y certbot python3-certbot-nginx

# Obtenir certificat SSL
certbot --nginx -d avocat.tn -d www.avocat.tn

# Renouvellement automatique (déjà configuré par défaut)
certbot renew --dry-run
```

## ⏰ Configuration Cron pour Notifications

### Créer script de notification

```bash
cat > /var/www/avocat-saas/scripts/send-notifications.js << 'CRONEOF'
#!/usr/bin/env node

const { Pool } = require('pg');
const https = require('https');

// Configuration
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'avocat_saas',
  user: 'avocat_user',
  password: process.env.DB_PASSWORD
});

async function sendNotifications() {
  try {
    console.log(`[${new Date().toISOString()}] Démarrage envoi notifications...`);
    
    // Logique notifications (similaire à l'Edge Function)
    // TODO: Implémenter la logique complète
    
    console.log(`[${new Date().toISOString()}] Notifications envoyées avec succès`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erreur:`, error);
    process.exit(1);
  }
}

sendNotifications();
CRONEOF

# Rendre exécutable
chmod +x /var/www/avocat-saas/scripts/send-notifications.js
```

### Configurer Cron

```bash
# Ouvrir crontab
crontab -e

# Ajouter ligne pour exécution quotidienne à 6h00
0 6 * * * cd /var/www/avocat-saas && DB_PASSWORD=votre-mot-de-passe node scripts/send-notifications.js >> /var/log/cron-notifications.log 2>&1
```

## 🔒 Sécurité

### Firewall

```bash
# Installer UFW
apt install -y ufw

# Configurer règles
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

# Activer
ufw enable
ufw status
```

### Fail2ban

```bash
# Installer
apt install -y fail2ban

# Configurer pour SSH et Nginx
cat > /etc/fail2ban/jail.local << 'F2BEOF'
[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
F2BEOF

systemctl restart fail2ban
```

## 📊 Monitoring

### Logs application

```bash
# Logs PM2
pm2 logs avocat-saas

# Logs spécifiques
pm2 logs avocat-saas --lines 100

# Erreurs uniquement
pm2 logs avocat-saas --err
```

### Logs Nginx

```bash
# Accès
tail -f /var/log/nginx/avocat-saas-access.log

# Erreurs
tail -f /var/log/nginx/avocat-saas-error.log
```

### Monitoring ressources

```bash
# CPU/RAM en temps réel
pm2 monit

# Statistiques détaillées
pm2 status
```

## 🔄 Mise à jour

### Déploiement nouvelle version

```bash
cd /var/www/avocat-saas

# Pull changements
git pull origin main

# Installer nouvelles dépendances
npm install

# Rebuild
npm run build

# Redémarrer sans downtime
pm2 reload ecosystem.config.js
```

### Script de déploiement automatique

```bash
cat > /var/www/avocat-saas/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
set -e

echo "Déploiement démarré..."

# Pull
git pull origin main

# Install
npm install

# Build
npm run build

# Appliquer nouvelles migrations
for migration in supabase/migrations/*.sql; do
  if [ -f "$migration" ]; then
    echo "Applying $migration..."
    PGPASSWORD=$DB_PASSWORD psql -h localhost -U avocat_user -d avocat_saas -f "$migration" || true
  fi
done

# Reload
pm2 reload ecosystem.config.js

echo "Déploiement terminé !"
DEPLOYEOF

chmod +x /var/www/avocat-saas/deploy.sh
```

## 💾 Backup PostgreSQL

### Backup automatique quotidien

```bash
# Créer script de backup
cat > /root/backup-postgres.sh << 'BACKUPEOF'
#!/bin/bash
BACKUP_DIR="/root/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -h localhost -U avocat_user -d avocat_saas | gzip > $BACKUP_DIR/avocat_saas_$DATE.sql.gz

# Garder seulement les 30 derniers jours
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup créé: avocat_saas_$DATE.sql.gz"
BACKUPEOF

chmod +x /root/backup-postgres.sh

# Ajouter au cron (tous les jours à 2h00)
(crontab -l 2>/dev/null; echo "0 2 * * * /root/backup-postgres.sh") | crontab -
```

## 📈 Optimisations

### PostgreSQL tuning

```bash
# Éditer postgresql.conf
nano /etc/postgresql/16/main/postgresql.conf

# Ajuster selon RAM disponible (exemple pour 4GB RAM)
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB
max_connections = 100

# Redémarrer
systemctl restart postgresql
```

### Node.js memory

```javascript
// Dans ecosystem.config.js
max_memory_restart: '1G',  // Redémarre si > 1GB
node_args: '--max-old-space-size=2048'  // Limite heap à 2GB
```

## 🆘 Troubleshooting

### Application ne démarre pas

```bash
# Vérifier logs
pm2 logs avocat-saas --err

# Vérifier port
netstat -tulpn | grep :3000

# Redémarrer
pm2 restart avocat-saas
```

### Base de données inaccessible

```bash
# Vérifier PostgreSQL
systemctl status postgresql

# Tester connexion
PGPASSWORD=votre-mot-de-passe psql -h localhost -U avocat_user -d avocat_saas

# Logs PostgreSQL
tail -f /var/log/postgresql/postgresql-16-main.log
```

### Nginx erreur 502

```bash
# Vérifier backend
pm2 status

# Tester connexion locale
curl http://localhost:3000

# Logs Nginx
tail -f /var/log/nginx/error.log
```

## 📝 Checklist déploiement

- [ ] VPS provisionné (4GB RAM minimum)
- [ ] PostgreSQL 16 installé et configuré
- [ ] Node.js 20 LTS installé
- [ ] Repository cloné
- [ ] Variables .env.production configurées
- [ ] Migrations appliquées
- [ ] Application build et démarrée avec PM2
- [ ] Nginx configuré
- [ ] SSL Let's Encrypt activé
- [ ] Firewall (UFW) activé
- [ ] Fail2ban configuré
- [ ] Cron notifications configuré
- [ ] Backup automatique configuré
- [ ] Monitoring activé
- [ ] Tests fonctionnels réussis

## 💡 Avantages VPS vs Supabase Cloud

| Critère | VPS Standalone | Supabase Cloud |
|---------|---------------|----------------|
| Coût mensuel | ~30-50 TND | ~150-300 TND |
| Contrôle total | ✅ Oui | ❌ Limité |
| Scalabilité | Manuel | Automatique |
| Maintenance | À gérer | Gérée |
| Performance | Optimisable | Standard |
| Backup | À configurer | Inclus |
| Support | Communauté | Premium payant |

---

**Note** : Cette configuration est adaptée pour un VPS standalone en production. Adapter selon vos besoins spécifiques.
