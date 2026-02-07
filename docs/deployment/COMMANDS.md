# 🚀 Commandes Rapides MonCabinet VPS

Guide de référence rapide des commandes les plus utilisées.

---

## 📦 Docker Compose

### Status et Logs

```bash
# Status containers
docker-compose ps

# Logs tous containers (live)
docker-compose logs -f --tail=100

# Logs Next.js uniquement
docker-compose logs -f nextjs

# Logs PostgreSQL
docker-compose logs -f postgres

# Logs MinIO
docker-compose logs -f minio

# Logs des dernières 24h
docker-compose logs --since 24h
```

### Démarrage et Arrêt

```bash
# Démarrer tous containers
docker-compose up -d

# Arrêter tous containers
docker-compose down

# Redémarrer tous containers
docker-compose restart

# Redémarrer Next.js uniquement
docker-compose restart nextjs

# Rebuild et redémarrer
docker-compose build --no-cache
docker-compose up -d --force-recreate
```

### Nettoyage

```bash
# Nettoyer images inutilisées
docker image prune -f

# Nettoyer tout (attention: supprime volumes!)
docker system prune -a --volumes

# Voir espace utilisé
docker system df
```

---

## 🗄️ PostgreSQL

### Connexion

```bash
# Se connecter à PostgreSQL
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Connexion avec mot de passe
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet -W
```

### Requêtes Utiles

```sql
-- Lister tables
\dt

-- Décrire table
\d users

-- Compter lignes
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM clients;
SELECT COUNT(*) FROM documents;

-- Vérifier connexions actives
SELECT pid, usename, application_name, client_addr, state
FROM pg_stat_activity
WHERE state = 'active';

-- Taille base de données
SELECT pg_size_pretty(pg_database_size('moncabinet'));

-- Taille tables
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Vérifier cronjobs
SELECT * FROM cron.job;

-- Logs cronjobs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Quitter
\q
```

### Backup et Restore

```bash
# Backup manuel
docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > backup.sql

# Backup compressé
docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet | gzip > backup.sql.gz

# Restore
gunzip -c backup.sql.gz | docker exec -i moncabinet-postgres psql -U moncabinet moncabinet

# Restore non compressé
docker exec -i moncabinet-postgres psql -U moncabinet moncabinet < backup.sql
```

---

## 📁 MinIO

### Console Web

Accès : `https://moncabinet.tn/minio/`

Login : `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (depuis .env.production)

### CLI MinIO Client (mc)

```bash
# Entrer dans container
docker exec -it moncabinet-minio bash

# Configurer alias
mc alias set myminio http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Lister buckets
mc ls myminio

# Lister fichiers dans bucket documents
mc ls myminio/documents

# Lister récursivement
mc ls -r myminio/documents

# Taille totale bucket
mc du myminio/documents

# Copier fichier local vers MinIO
mc cp /path/to/file.pdf myminio/documents/

# Télécharger fichier depuis MinIO
mc cp myminio/documents/file.pdf /tmp/

# Supprimer fichier
mc rm myminio/documents/file.pdf

# Mirror backup
mc mirror myminio/documents /backup/minio/

# Sortir
exit
```

---

## 🔧 Déploiement

### Déploiement Standard

```bash
cd /opt/moncabinet
./deploy.sh
```

### Déploiement Manuel

```bash
cd /opt/moncabinet

# Pull code
git pull origin main

# Backup DB
docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > /opt/backups/moncabinet/db_$(date +%Y%m%d_%H%M%S).sql

# Rebuild
export $(grep -v '^#' .env.production | xargs)
docker-compose build --no-cache nextjs

# Redémarrer
docker-compose down
docker-compose up -d

# Health check
sleep 30
curl http://localhost:3000/api/health | jq
```

---

## 💾 Backups

### Backup Manuel

```bash
cd /opt/moncabinet
./backup.sh
```

### Vérifier Backups

```bash
# Lister backups
ls -lh /opt/backups/moncabinet/

# Derniers backups
ls -lt /opt/backups/moncabinet/ | head -10

# Taille totale backups
du -sh /opt/backups/moncabinet/

# Nombre de backups
find /opt/backups/moncabinet -name "db_*.sql.gz" | wc -l
```

### Crontab

```bash
# Éditer crontab
crontab -e

# Lister cronjobs
crontab -l

# Vérifier logs backup
tail -f /var/log/moncabinet-backup.log
```

---

## 🌐 Nginx

### Status et Contrôle

```bash
# Status
systemctl status nginx

# Démarrer
systemctl start nginx

# Arrêter
systemctl stop nginx

# Redémarrer
systemctl restart nginx

# Recharger config (sans downtime)
systemctl reload nginx

# Tester configuration
nginx -t

# Voir version
nginx -v
```

### Logs

```bash
# Access logs (live)
tail -f /var/log/nginx/moncabinet_access.log

# Error logs (live)
tail -f /var/log/nginx/moncabinet_error.log

# Dernières 100 lignes
tail -100 /var/log/nginx/moncabinet_access.log

# Filtrer erreurs 5xx
grep " 5[0-9][0-9] " /var/log/nginx/moncabinet_access.log

# Top 10 IPs
awk '{print $1}' /var/log/nginx/moncabinet_access.log | sort | uniq -c | sort -rn | head -10

# Top 10 URLs
awk '{print $7}' /var/log/nginx/moncabinet_access.log | sort | uniq -c | sort -rn | head -10
```

### Configuration

```bash
# Éditer config
sudo nano /etc/nginx/sites-available/moncabinet.tn

# Tester après modification
sudo nginx -t

# Appliquer changements
sudo systemctl reload nginx
```

---

## 🔐 SSL/TLS

### Certbot

```bash
# Vérifier certificats
sudo certbot certificates

# Renouveler manuellement
sudo certbot renew

# Test renouvellement (dry-run)
sudo certbot renew --dry-run

# Forcer renouvellement
sudo certbot renew --force-renewal

# Révoquer certificat
sudo certbot revoke --cert-path /etc/letsencrypt/live/moncabinet.tn/cert.pem
```

### Vérifier SSL

```bash
# Dates expiration
echo | openssl s_client -servername moncabinet.tn -connect moncabinet.tn:443 2>/dev/null | openssl x509 -noout -dates

# Infos certificat
echo | openssl s_client -servername moncabinet.tn -connect moncabinet.tn:443 2>/dev/null | openssl x509 -noout -text

# Tester SSL Labs
# https://www.ssllabs.com/ssltest/analyze.html?d=moncabinet.tn
```

---

## 🔥 Firewall UFW

```bash
# Status
sudo ufw status verbose

# Lister règles numérotées
sudo ufw status numbered

# Autoriser port
sudo ufw allow 80/tcp

# Refuser port
sudo ufw deny 3306/tcp

# Supprimer règle (par numéro)
sudo ufw delete 3

# Réinitialiser
sudo ufw reset

# Désactiver
sudo ufw disable

# Activer
sudo ufw enable
```

---

## 🛡️ Fail2Ban

```bash
# Status
sudo systemctl status fail2ban

# Jails actives
sudo fail2ban-client status

# Status jail SSH
sudo fail2ban-client status sshd

# IPs bannies
sudo fail2ban-client status sshd | grep "Banned IP"

# Débannir IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# Logs
sudo tail -f /var/log/fail2ban.log
```

---

## 📊 Monitoring

### Système

```bash
# CPU et RAM
htop

# Disk usage
df -h

# Disk usage par dossier
du -sh /opt/* | sort -h

# Espace disque disponible
df -h /opt

# RAM disponible
free -h

# Uptime
uptime

# Processus utilisant le plus de CPU
ps aux --sort=-%cpu | head -10

# Processus utilisant le plus de RAM
ps aux --sort=-%mem | head -10
```

### Réseau

```bash
# Ports ouverts
netstat -tulpn

# Connexions actives
netstat -an | grep ESTABLISHED

# Trafic réseau temps réel
iftop

# Bande passante par processus
nethogs
```

### Docker

```bash
# Stats temps réel
docker stats

# Espace utilisé
docker system df

# Containers en cours
docker ps

# Tous containers (même arrêtés)
docker ps -a

# Images
docker images

# Volumes
docker volume ls

# Inspecter container
docker inspect moncabinet-nextjs
```

---

## 🩺 Health Checks

### Application

```bash
# Health endpoint
curl http://localhost:3000/api/health | jq

# Health HTTPS
curl https://moncabinet.tn/api/health | jq

# Simple check
curl -f http://localhost:3000/api/health && echo "OK" || echo "FAIL"

# Temps réponse
time curl -s http://localhost:3000/api/health > /dev/null
```

### Services

```bash
# PostgreSQL
docker exec moncabinet-postgres pg_isready -U moncabinet

# MinIO
curl -f http://localhost:9000/minio/health/live && echo "OK" || echo "FAIL"

# Next.js
curl -f http://localhost:3000/api/health && echo "OK" || echo "FAIL"

# Nginx
curl -I http://localhost && echo "OK" || echo "FAIL"
```

---

## 🔍 Troubleshooting

### Logs Système

```bash
# Logs système
journalctl -xe

# Logs service spécifique
journalctl -u nginx -f

# Logs kernel
dmesg | tail -50

# Erreurs récentes
journalctl -p err -n 50
```

### Diagnostic Rapide

```bash
# Vérifier tout d'un coup
echo "=== Docker ===" && docker-compose ps && \
echo "=== Health ===" && curl -s http://localhost:3000/api/health | jq '.status' && \
echo "=== Disk ===" && df -h / && \
echo "=== RAM ===" && free -h && \
echo "=== Nginx ===" && systemctl is-active nginx && \
echo "=== UFW ===" && ufw status | grep Status
```

### Redémarrage Complet

```bash
# Redémarrer tout (dernier recours)
cd /opt/moncabinet
docker-compose down
docker-compose up -d
systemctl restart nginx
```

---

## 🔑 Secrets

### Générer Secrets

```bash
# Secret 32 caractères
openssl rand -base64 32

# Secret 32 chars alphanumeric
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# Secret hex 16 bytes
openssl rand -hex 16

# Secret hex 10 bytes
openssl rand -hex 10

# UUID
uuidgen
```

### Éditer .env.production

```bash
cd /opt/moncabinet
nano .env.production

# Vérifier permissions
chmod 600 .env.production
ls -la .env.production
```

---

## 🚀 CI/CD

### GitHub Actions

```bash
# Forcer redéploiement
git commit --allow-empty -m "Trigger deploy"
git push origin main
```

### Local

```bash
# Déployer depuis local (SSH)
ssh moncabinet@<IP_VPS> 'cd /opt/moncabinet && ./deploy.sh'

# Copier fichiers via SCP
scp -r ./dist/* moncabinet@<IP_VPS>:/opt/moncabinet/
```

---

## 📞 Support

### Informations Système

```bash
# Version OS
cat /etc/os-release

# Version Docker
docker --version

# Version Node.js
node --version

# Version Nginx
nginx -v

# Uptime
uptime

# Hostname
hostname

# IP publique
curl ifconfig.me
```

### Rapports

```bash
# Générer rapport complet
{
  echo "=== SYSTEM INFO ==="
  uname -a
  uptime
  df -h
  free -h

  echo ""
  echo "=== DOCKER ==="
  docker-compose ps
  docker stats --no-stream

  echo ""
  echo "=== SERVICES ==="
  systemctl is-active nginx
  systemctl is-active fail2ban
  systemctl is-active certbot.timer

  echo ""
  echo "=== HEALTH ==="
  curl -s http://localhost:3000/api/health | jq
} > /tmp/system-report.txt

cat /tmp/system-report.txt
```

---

**Dernière mise à jour** : 2026-02-05
