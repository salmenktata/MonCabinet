# ✅ Checklist Déploiement VPS MonCabinet

Cette checklist permet de suivre étape par étape le déploiement sur VPS Contabo.

---

## 📋 Préparation (Avant J-1)

- [ ] **Commander VPS Contabo L** (30GB RAM, 600GB SSD)
- [ ] **Recevoir email avec IP VPS** et credentials root
- [ ] **Configurer DNS** (A records pour moncabinet.tn et www)
- [ ] **Attendre propagation DNS** (24-48h)
- [ ] **Générer clé SSH** : `ssh-keygen -t ed25519 -C "admin@moncabinet.tn"`
- [ ] **Tester connexion SSH** : `ssh root@<IP_VPS>`

---

## 🔧 Phase 1: Configuration VPS (3h)

### Étape 1.1: Sécurité de base

- [ ] Connexion : `ssh root@<IP_VPS>`
- [ ] Mise à jour : `apt update && apt upgrade -y`
- [ ] Créer utilisateur : `adduser moncabinet`
- [ ] Ajouter sudo : `usermod -aG sudo moncabinet`
- [ ] Copier clé SSH vers moncabinet
- [ ] Désactiver login root dans `/etc/ssh/sshd_config`
- [ ] Redémarrer SSH : `systemctl restart sshd`
- [ ] **TESTER** nouvelle connexion : `ssh moncabinet@<IP_VPS>`

### Étape 1.2: Firewall

- [ ] Configurer UFW :
  ```bash
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw enable
  ufw status
  ```

### Étape 1.3: Fail2Ban

- [ ] Installer : `apt install -y fail2ban`
- [ ] Configurer `/etc/fail2ban/jail.local`
- [ ] Démarrer : `systemctl enable fail2ban && systemctl start fail2ban`

### Étape 1.4: Stack logicielle

- [ ] Installer Docker : `curl -fsSL https://get.docker.com | sh`
- [ ] Ajouter user au groupe docker : `usermod -aG docker moncabinet`
- [ ] Installer Node.js 18 via nvm
- [ ] Installer Nginx : `apt install -y nginx`
- [ ] Installer Certbot : `apt install -y certbot python3-certbot-nginx`
- [ ] Installer outils : `apt install -y git curl wget htop vim`

---

## 🐳 Phase 2: Déploiement Docker (4h)

### Étape 2.1: Code source

- [ ] Créer dossier : `mkdir -p /opt/moncabinet`
- [ ] Changer owner : `chown -R moncabinet:moncabinet /opt/moncabinet`
- [ ] Cloner repo : `git clone <repo> /opt/moncabinet`
- [ ] Aller dans dossier : `cd /opt/moncabinet`

### Étape 2.2: Configuration

- [ ] Copier template : `cp .env.production.example .env.production`
- [ ] Générer secrets :
  ```bash
  # DB_PASSWORD
  openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

  # MINIO_SECRET_KEY
  openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

  # NEXTAUTH_SECRET
  openssl rand -base64 32

  # CRON_SECRET
  openssl rand -base64 32
  ```
- [ ] Éditer `.env.production` avec tous les secrets
- [ ] Sécuriser : `chmod 600 .env.production`

### Étape 2.3: Build et démarrage

- [ ] Charger variables : `export $(grep -v '^#' .env.production | xargs)`
- [ ] Installer dépendances : `npm ci`
- [ ] Build images : `docker-compose build`
- [ ] Démarrer : `docker-compose up -d`
- [ ] Vérifier status : `docker-compose ps`
- [ ] Vérifier logs : `docker-compose logs -f --tail=50`

### Étape 2.4: Health check

- [ ] Attendre 30s
- [ ] Tester : `curl http://localhost:3000/api/health | jq`
- [ ] Vérifier status: `"status": "healthy"`

---

## 🔐 Phase 3: SSL & Nginx (2h)

### Étape 3.1: Certificat SSL

- [ ] Arrêter Nginx : `systemctl stop nginx`
- [ ] Obtenir certificat :
  ```bash
  certbot certonly --standalone \
    -d moncabinet.tn \
    -d www.moncabinet.tn \
    --agree-tos \
    --email admin@moncabinet.tn
  ```
- [ ] Vérifier certificats dans `/etc/letsencrypt/live/moncabinet.tn/`

### Étape 3.2: Configuration Nginx

- [ ] Copier config : `cp docs/nginx-moncabinet.conf /etc/nginx/sites-available/moncabinet.tn`
- [ ] Tester : `nginx -t`
- [ ] Créer symlink : `ln -s /etc/nginx/sites-available/moncabinet.tn /etc/nginx/sites-enabled/`
- [ ] Supprimer default : `rm /etc/nginx/sites-enabled/default`
- [ ] Redémarrer : `systemctl start nginx`
- [ ] Recharger : `systemctl reload nginx`

### Étape 3.3: Tests

- [ ] Tester HTTP → HTTPS : `curl -I http://moncabinet.tn`
- [ ] Tester HTTPS : `curl -I https://moncabinet.tn`
- [ ] Ouvrir dans navigateur : `https://moncabinet.tn`
- [ ] Vérifier SSL grade : https://www.ssllabs.com/ssltest/

---

## 📦 Phase 4: Migration Données (3h)

### Étape 4.1: Préparer

- [ ] Installer tsx : `npm install -g tsx`
- [ ] Vérifier variables Supabase dans `.env.production` :
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Étape 4.2: Migration

- [ ] Exécuter : `tsx scripts/migrate-from-supabase.ts`
- [ ] Attendre fin (peut prendre 10-30 min selon volume)
- [ ] Vérifier rapport : `cat migration-report.json | jq`

### Étape 4.3: Vérification

- [ ] PostgreSQL :
  ```bash
  docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet
  SELECT COUNT(*) FROM users;
  SELECT COUNT(*) FROM clients;
  SELECT COUNT(*) FROM documents;
  \q
  ```
- [ ] MinIO :
  ```bash
  docker exec -it moncabinet-minio mc ls myminio/documents
  ```

### Étape 4.4: pg_cron

- [ ] Installer extension dans container
- [ ] Créer cronjobs SQL (voir `docs/DEPLOYMENT_VPS.md`)
- [ ] Définir `app.cron_secret`
- [ ] Vérifier : `SELECT * FROM cron.job;`

---

## 📊 Phase 5: Monitoring (1h)

### Étape 5.1: Netdata

- [ ] Installer : `bash <(curl -Ss https://my-netdata.io/kickstart.sh)`
- [ ] Vérifier : Ouvrir `http://<IP_VPS>:19999`

### Étape 5.2: UptimeRobot

- [ ] Créer compte : https://uptimerobot.com
- [ ] Ajouter monitor :
  - Type: HTTPS
  - URL: `https://moncabinet.tn/api/health`
  - Interval: 5 minutes
- [ ] Configurer alertes email

### Étape 5.3: Backups

- [ ] Tester backup : `./backup.sh`
- [ ] Vérifier fichiers dans `/opt/backups/moncabinet/`
- [ ] Configurer crontab : `crontab -e`
  ```
  0 3 * * * /opt/moncabinet/backup.sh >> /var/log/moncabinet-backup.log 2>&1
  ```

---

## 🚀 Phase 6: CI/CD GitHub Actions (30 min)

### Étape 6.1: Secrets GitHub

Dans GitHub repo → Settings → Secrets → Actions :

- [ ] `VPS_HOST` = IP ou domaine VPS
- [ ] `VPS_USER` = `moncabinet`
- [ ] `VPS_SSH_KEY` = Contenu clé privée SSH
- [ ] `VPS_PORT` = `22` (optionnel)

### Étape 6.2: Test

- [ ] Faire un push sur `main`
- [ ] Vérifier workflow dans Actions
- [ ] Vérifier déploiement automatique

---

## ✅ Phase 7: Tests Post-Déploiement

### Tests Fonctionnels

- [ ] **Homepage** : `https://moncabinet.tn`
- [ ] **Login** : Test authentification
- [ ] **Dashboard** : Accès après login
- [ ] **Upload document** : Test upload vers MinIO
- [ ] **Download document** : Test download depuis MinIO
- [ ] **Création client** : Persistence PostgreSQL
- [ ] **Recherche** : Test full-text search
- [ ] **Switch langue** : FR ↔ AR

### Tests Webhooks

- [ ] **WhatsApp webhook** :
  ```bash
  curl "https://moncabinet.tn/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test123"
  ```
- [ ] **Google Drive webhook** :
  ```bash
  curl "https://moncabinet.tn/api/webhooks/google-drive?token=TOKEN"
  ```

### Tests Sécurité

- [ ] **SSL Grade** : A ou A+ sur SSLLabs
- [ ] **Headers sécurité** : https://securityheaders.com
- [ ] **Rate limiting** : Tester avec ab ou wrk
- [ ] **Firewall** : `ufw status`
- [ ] **Fail2Ban** : `fail2ban-client status sshd`

### Tests Performance

- [ ] **Temps chargement** : < 2s (LCP)
- [ ] **API response** : < 500ms
- [ ] **Health check** : < 100ms
- [ ] **Docker containers** : `docker ps` (tous healthy)
- [ ] **Disk usage** : < 50% (`df -h`)
- [ ] **RAM usage** : < 70% (`free -h`)

---

## 🎯 Checklist Finale

### Validation Production

- [ ] ✅ Application accessible publiquement
- [ ] ✅ HTTPS fonctionne (SSL valide)
- [ ] ✅ Authentification fonctionne
- [ ] ✅ Upload/Download fichiers OK
- [ ] ✅ Base de données accessible
- [ ] ✅ Webhooks configurés et testés
- [ ] ✅ Cronjobs PostgreSQL actifs
- [ ] ✅ Backups automatiques configurés
- [ ] ✅ Monitoring actif (Netdata + UptimeRobot)
- [ ] ✅ CI/CD GitHub Actions fonctionnel
- [ ] ✅ Documentation à jour

### Sécurité

- [ ] ✅ Firewall UFW actif
- [ ] ✅ Fail2Ban actif
- [ ] ✅ SSL Grade A+
- [ ] ✅ Headers sécurité OK
- [ ] ✅ Login root SSH désactivé
- [ ] ✅ Fichier `.env.production` sécurisé (chmod 600)
- [ ] ✅ Secrets forts (32+ chars)
- [ ] ✅ Rate limiting Nginx actif

### Performance

- [ ] ✅ Containers Docker healthy
- [ ] ✅ Health check répond < 100ms
- [ ] ✅ Temps chargement < 2s
- [ ] ✅ RAM usage < 70%
- [ ] ✅ Disk usage < 50%

---

## 📞 Support

### En Cas de Problème

1. **Logs** : `docker-compose logs -f`
2. **Health** : `curl http://localhost:3000/api/health`
3. **Documentation** : `docs/DEPLOYMENT_VPS.md`
4. **Troubleshooting** : Section troubleshooting dans docs

### Ressources

- 📖 Guide complet : `docs/DEPLOYMENT_VPS.md`
- 🔧 Config Nginx : `docs/nginx-moncabinet.conf`
- 📧 Contact : admin@moncabinet.tn

---

## 🎉 Déploiement Terminé !

Si tous les items sont cochés ✅, félicitations !

Votre application MonCabinet est maintenant en production sur VPS Contabo.

**Prochaines étapes** :

1. Surveiller logs pendant 24h
2. Vérifier emails notifications quotidiennes (6h matin)
3. Tester webhooks en conditions réelles
4. Configurer offsite backups (optionnel)
5. Documenter credentials et accès (coffre-fort sécurisé)

**Bonne utilisation ! 🚀**

---

**Créé le** : 2026-02-05
**Version** : 1.0
