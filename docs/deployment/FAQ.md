# ❓ FAQ - Déploiement VPS MonCabinet

Questions fréquentes et solutions aux problèmes courants.

---

## 🚀 Déploiement Initial

### Q: Combien de temps prend le déploiement complet ?

**R:** Environ 8-10 heures au total :
- Configuration VPS : 3h
- Docker + Application : 4h
- Nginx + SSL : 2h
- Migration données : 1-3h (selon volume)

### Q: Puis-je utiliser un VPS moins cher que Contabo L ?

**R:** Le VPS L (30GB RAM) est recommandé pour :
- PostgreSQL : 8-12 GB RAM
- Next.js : 2-4 GB RAM
- MinIO : 2-4 GB RAM
- Système + marge : 10 GB

Un VPS M (16GB) pourrait suffire pour démarrer, mais limitera la scalabilité.

### Q: Dois-je vraiment migrer depuis Supabase ?

**R:** Non, vous pouvez :
1. **Garder Supabase** en production (coût ~25€/mois)
2. **Migration progressive** : Tester VPS en staging d'abord
3. **Déploiement hybride** : VPS pour app, Supabase pour données (déconseillé long terme)

---

## 🐳 Docker

### Q: Le container Next.js ne démarre pas

**R:** Vérifiez :
```bash
# Logs détaillés
docker-compose logs nextjs

# Vérifier variables d'environnement
docker-compose exec nextjs env | grep DATABASE_URL

# Reconstruire sans cache
docker-compose build --no-cache nextjs
docker-compose up -d --force-recreate nextjs
```

**Causes courantes** :
- Variables `.env.production` manquantes
- Erreur build Next.js (vérifier `npm run build` local)
- Port 3000 déjà utilisé

### Q: PostgreSQL refuse les connexions

**R:** Vérifiez :
```bash
# Container tourne ?
docker-compose ps postgres

# Logs PostgreSQL
docker-compose logs postgres | grep ERROR

# Test connexion
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Vérifier password
grep DB_PASSWORD .env.production
```

**Causes courantes** :
- Mauvais `DB_PASSWORD` dans `.env.production`
- Base de données non initialisée (premier démarrage)
- Volume Docker corrompu (supprimer et recréer)

### Q: MinIO retourne erreur 403

**R:** Vérifiez :
```bash
# Credentials MinIO
grep MINIO .env.production

# Test connexion
docker exec -it moncabinet-minio mc alias set myminio http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Vérifier bucket existe
docker exec -it moncabinet-minio mc ls myminio
```

**Solution** : Recréer bucket avec bonnes permissions :
```bash
docker exec -it moncabinet-minio mc mb myminio/documents --ignore-existing
```

### Q: Comment voir tous les containers ?

**R:**
```bash
# Tous containers
docker-compose ps -a

# Avec stats CPU/RAM
docker stats

# Status détaillé
docker-compose ps && docker-compose logs --tail=10
```

---

## 🔐 SSL/HTTPS

### Q: Certbot échoue avec "Could not bind to port 80"

**R:** Nginx écoute déjà sur port 80.

**Solution** :
```bash
# Arrêter Nginx temporairement
sudo systemctl stop nginx

# Obtenir certificat
sudo certbot certonly --standalone -d moncabinet.tn -d www.moncabinet.tn

# Redémarrer Nginx
sudo systemctl start nginx
```

**Alternative** : Utiliser plugin nginx (sans arrêter) :
```bash
sudo certbot --nginx -d moncabinet.tn -d www.moncabinet.tn
```

### Q: SSL fonctionne mais grade C ou B sur SSLLabs

**R:** Configuration Nginx incomplète.

**Solution** : Vérifier dans `/etc/nginx/sites-available/moncabinet.tn` :
- `ssl_protocols TLSv1.2 TLSv1.3;` (pas TLSv1.0/1.1)
- `ssl_ciphers` avec suite moderne
- `ssl_stapling on;`
- Headers `Strict-Transport-Security`

Copier config depuis `docs/nginx-moncabinet.conf` si nécessaire.

### Q: Certificat expiré

**R:** Certbot devrait renouveler automatiquement 30 jours avant expiration.

**Vérification** :
```bash
# Statut timer
sudo systemctl status certbot.timer

# Test renouvellement
sudo certbot renew --dry-run
```

**Renouvellement manuel** :
```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 🌐 Réseau & Accès

### Q: Site inaccessible depuis l'extérieur

**R:** Checklist :
1. **DNS propagé ?** `dig +short moncabinet.tn` → doit retourner IP VPS
2. **Firewall ouvert ?** `sudo ufw status` → ports 80, 443 autorisés
3. **Nginx tourne ?** `sudo systemctl status nginx`
4. **Docker tourne ?** `docker-compose ps` → nextjs UP

**Test depuis VPS** :
```bash
curl -I http://localhost        # Nginx OK ?
curl -I http://localhost:3000   # Next.js OK ?
curl -I http://<IP_VPS>         # Depuis externe
```

### Q: Redirection HTTP → HTTPS ne fonctionne pas

**R:** Vérifier config Nginx :
```bash
sudo nginx -t
sudo nano /etc/nginx/sites-available/moncabinet.tn
```

Doit contenir :
```nginx
server {
  listen 80;
  server_name moncabinet.tn www.moncabinet.tn;
  return 301 https://$server_name$request_uri;
}
```

Recharger :
```bash
sudo systemctl reload nginx
```

### Q: Rate limiting bloque utilisateurs légitimes

**R:** Ajuster limites dans Nginx :
```nginx
# Augmenter rate ou burst
limit_req_zone $binary_remote_addr zone=general:10m rate=60r/s;  # au lieu de 30r/s
location / {
  limit_req zone=general burst=100 nodelay;  # au lieu de burst=50
}
```

---

## 💾 Base de Données

### Q: Migration Supabase échoue

**R:** Causes courantes :
1. **Credentials Supabase invalides** : Vérifier `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
2. **Réseau bloqué** : VPS doit pouvoir contacter Supabase (`curl https://<project>.supabase.co`)
3. **Timeout** : Augmenter timeout dans script

**Debug** :
```bash
# Tester connexion Supabase
curl https://vgaofkucdpydyblrykbh.supabase.co/rest/v1/ \
  -H "apikey: <SUPABASE_ANON_KEY>"

# Lancer migration avec logs verbeux
tsx scripts/migrate-from-supabase.ts 2>&1 | tee migration.log
```

### Q: Comment vérifier que les données ont bien migré ?

**R:**
```bash
# PostgreSQL
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Compter lignes
SELECT
  'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'dossiers', COUNT(*) FROM dossiers
UNION ALL
SELECT 'documents', COUNT(*) FROM documents;

# MinIO
docker exec -it moncabinet-minio mc du myminio/documents
```

Comparer avec counts Supabase Dashboard.

### Q: pg_cron ne se lance pas

**R:** Vérifier installation :
```bash
# Entrer dans container
docker exec -it moncabinet-postgres bash

# Vérifier extension existe
psql -U moncabinet -d moncabinet -c "SELECT * FROM pg_extension WHERE extname = 'pg_cron';"

# Si vide, créer
psql -U moncabinet -d moncabinet -c "CREATE EXTENSION pg_cron;"

# Vérifier jobs
psql -U moncabinet -d moncabinet -c "SELECT * FROM cron.job;"
```

---

## 📦 Backups

### Q: Backup.sh échoue

**R:** Vérifier :
```bash
# Permissions
ls -la /opt/moncabinet/backup.sh  # Doit être exécutable

# Rendre exécutable
chmod +x /opt/moncabinet/backup.sh

# Lancer manuellement
./backup.sh

# Vérifier logs
cat /var/log/moncabinet-backup.log
```

### Q: Backups prennent trop de place

**R:** Ajuster rotation :
```bash
# Dans backup.sh, changer retention
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete  # 7 jours au lieu de 14
```

Ou configurer backup offsite (rsync vers autre serveur).

### Q: Comment restaurer backup ?

**R:**
```bash
# PostgreSQL
gunzip -c /opt/backups/moncabinet/db_20260205_030000.sql.gz | \
  docker exec -i moncabinet-postgres psql -U moncabinet moncabinet

# MinIO
docker run --rm \
  --network moncabinet_moncabinet-network \
  -v /opt/backups/moncabinet/minio_20260205_030000:/backup \
  minio/mc:latest \
  mirror /backup/documents myminio/documents
```

---

## 🔧 Performance

### Q: Application lente

**R:** Diagnostics :
```bash
# CPU/RAM
htop

# Docker stats
docker stats

# Logs Next.js
docker-compose logs nextjs | grep -i slow

# Slow queries PostgreSQL
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet -c \
  "SELECT query, calls, total_time, mean_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC LIMIT 10;"
```

**Optimisations** :
1. Augmenter RAM PostgreSQL (`shared_buffers`)
2. Ajouter index sur colonnes souvent filtrées
3. Activer cache Nginx
4. Upgrader VPS si nécessaire

### Q: Disque plein

**R:** Identifier gros fichiers :
```bash
# Espace par dossier
du -sh /opt/* | sort -h

# Plus gros fichiers
find /opt -type f -size +100M -exec ls -lh {} \;

# Nettoyer Docker
docker system prune -a --volumes

# Nettoyer logs
journalctl --vacuum-time=7d

# Nettoyer backups
find /opt/backups/moncabinet -mtime +14 -delete
```

### Q: Out of Memory (OOM)

**R:** Vérifier consommation :
```bash
free -h
docker stats

# Logs kernel OOM
dmesg | grep -i "out of memory"
```

**Solutions** :
1. Redémarrer containers : `docker-compose restart`
2. Réduire `shared_buffers` PostgreSQL
3. Limiter RAM containers dans `docker-compose.yml` :
   ```yaml
   nextjs:
     deploy:
       resources:
         limits:
           memory: 4G
   ```
4. Upgrader VPS

---

## 🔐 Sécurité

### Q: IP bloquée par Fail2Ban

**R:**
```bash
# Vérifier IPs bannies
sudo fail2ban-client status sshd

# Débannir IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# Whitelist IP permanente
sudo nano /etc/fail2ban/jail.local
# Ajouter: ignoreip = 127.0.0.1/8 1.2.3.4
sudo systemctl restart fail2ban
```

### Q: Trop de tentatives SSH

**R:** Renforcer Fail2Ban :
```bash
sudo nano /etc/fail2ban/jail.local

[sshd]
enabled = true
maxretry = 3
bantime = 86400  # 24h au lieu de 1h
findtime = 600

sudo systemctl restart fail2ban
```

**Ou** changer port SSH :
```bash
sudo nano /etc/ssh/sshd_config
# Port 2222

sudo systemctl restart sshd
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

### Q: .env.production accessible ?

**R:** Vérifier permissions :
```bash
ls -la /opt/moncabinet/.env.production
# Doit afficher: -rw------- (600)

# Corriger si nécessaire
chmod 600 /opt/moncabinet/.env.production

# Vérifier propriétaire
chown moncabinet:moncabinet /opt/moncabinet/.env.production
```

**Important** : `.env.production` ne doit JAMAIS être dans git !
```bash
grep .env.production .gitignore  # Doit être présent
```

---

## 🚀 CI/CD

### Q: GitHub Actions échoue

**R:** Vérifier Secrets GitHub :
- Repository → Settings → Secrets → Actions
- Requis :
  - `VPS_HOST` : IP ou domaine VPS
  - `VPS_USER` : `moncabinet`
  - `VPS_SSH_KEY` : Clé privée SSH complète (avec `-----BEGIN` et `-----END`)

**Test SSH local** :
```bash
ssh -i ~/.ssh/id_ed25519 moncabinet@<IP_VPS> 'cd /opt/moncabinet && ls'
```

### Q: Déploiement automatique trop fréquent

**R:** Limiter dans workflow :
```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '**.md'
      - '.github/**'
```

---

## 📱 Webhooks

### Q: Webhook WhatsApp ne fonctionne pas

**R:** Vérifier :
```bash
# Test verification challenge
curl "https://moncabinet.tn/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"

# Doit retourner: test123

# Logs Next.js
docker-compose logs nextjs | grep whatsapp
```

**Dans Meta Dashboard** :
- Webhook URL : `https://moncabinet.tn/api/webhooks/whatsapp`
- Verify Token : Même que `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

### Q: Webhook Google Drive timeout

**R:** Augmenter timeout Nginx :
```nginx
location /api/webhooks/ {
  proxy_read_timeout 120s;  # Au lieu de 60s
}
```

---

## 🛠️ Maintenance

### Q: Dois-je redémarrer régulièrement ?

**R:** Généralement non. Redémarrer uniquement si :
- Problème de performance persistant
- Mise à jour kernel (upgrade système)
- Logs indiquent erreurs mémoire

**Redémarrage safe** :
```bash
cd /opt/moncabinet
docker-compose down
# Attendre 10s
docker-compose up -d
```

### Q: Mettre à jour Next.js / dépendances

**R:**
```bash
cd /opt/moncabinet
npm update
npm run build  # Tester local

# Si OK, déployer
git add package.json package-lock.json
git commit -m "Update dependencies"
git push origin main  # CI/CD déclenche déploiement
```

### Q: Rotation logs manuellement

**R:**
```bash
# Forcer rotation
sudo logrotate -f /etc/logrotate.d/moncabinet

# Nettoyer anciens logs
sudo find /var/log/nginx -name "*.gz" -mtime +30 -delete
```

---

## 💰 Coûts

### Q: Comment réduire les coûts ?

**R:** Options :
1. **VPS M** au lieu de L (si faible trafic) : Économie ~10€/mois
2. **Backups offsite gratuits** : rclone vers Google Drive
3. **Pas de PgAdmin** : Économie RAM (~500MB)
4. **Cloudflare CDN gratuit** : Cache + protection DDoS

### Q: Coûts inattendus possibles ?

**R:**
- **Bande passante** : Contabo = illimitée ✅
- **Backups** : Utiliser stockage VPS (600GB) ✅
- **Monitoring** : Netdata + UptimeRobot gratuits ✅
- **DNS** : Domaine .tn = 20€/an ✅

**Pas de surprises** contrairement à cloud providers !

---

## 📞 Support

### Q: Où trouver de l'aide ?

**R:** Ressources :
1. **Documentation complète** : `docs/DEPLOYMENT_VPS.md`
2. **Commandes rapides** : `docs/QUICK_COMMANDS.md`
3. **Checklist** : `docs/DEPLOYMENT_CHECKLIST.md`
4. **Logs** : `docker-compose logs -f`
5. **GitHub Issues** : https://github.com/votre-org/moncabinet/issues

### Q: Contacter support Contabo ?

**R:**
- **Email** : support@contabo.com
- **Panel** : https://my.contabo.com
- **Réponse** : Généralement sous 24h
- **Langue** : Anglais (support FR limité)

---

**Dernière mise à jour** : 2026-02-05

**Votre question n'est pas listée ?** Ouvrir une issue GitHub ou consulter la documentation complète.
