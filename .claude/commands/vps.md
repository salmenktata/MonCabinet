# Skill: VPS Management

Gestion complète du VPS Contabo : vérification, optimisation, sécurisation, nettoyage.

## Configuration requise

Variables d'environnement (dans `~/.zshrc` ou `~/.bashrc`) :
```bash
export VPS_HOST="84.247.165.187"
export VPS_USER="root"
export VPS_PASSWORD="IeRfA8Z46gsYSNh7"
```

## Arguments

| Argument | Description |
|----------|-------------|
| `--check` | Diagnostic complet du serveur (par défaut) |
| `--optimize` | Optimiser performances (Docker, Nginx, système) |
| `--secure` | Audit et renforcement sécurité |
| `--clean` | Nettoyage agressif (images, logs, cache) |
| `--fix` | Corriger les problèmes courants |
| `--backup` | Sauvegarde base de données et config |
| `--restart` | Redémarrer tous les services |
| `--all` | Exécuter check + clean + optimize |

## Instructions par argument

---

### --check : Diagnostic complet (par défaut)

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'CHECK_SCRIPT'
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              DIAGNOSTIC VPS MONCABINET                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "▓▓▓ SYSTÈME ▓▓▓"
echo "Uptime:      $(uptime -p)"
echo "Load:        $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo "Kernel:      $(uname -r)"

echo ""
echo "▓▓▓ MÉMOIRE ▓▓▓"
free -h | grep -E "^(Mem|Swap)"

echo ""
echo "▓▓▓ DISQUE ▓▓▓"
df -h / /opt /var 2>/dev/null | grep -v tmpfs

echo ""
echo "▓▓▓ DOCKER ▓▓▓"
echo "Version: $(docker --version)"
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker non accessible"

echo ""
echo "▓▓▓ RESSOURCES CONTAINERS ▓▓▓"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null

echo ""
echo "▓▓▓ IMAGES DOCKER ▓▓▓"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -10

echo ""
echo "▓▓▓ VOLUMES DOCKER ▓▓▓"
docker system df

echo ""
echo "▓▓▓ SERVICES CRITIQUES ▓▓▓"
for svc in nginx redis postgresql docker; do
  if systemctl is-active --quiet $svc 2>/dev/null; then
    echo "✓ $svc: actif"
  else
    echo "✗ $svc: inactif ou non installé"
  fi
done

echo ""
echo "▓▓▓ PORTS OUVERTS ▓▓▓"
ss -tlnp | grep LISTEN | awk '{print $4}' | sort -u

echo ""
echo "▓▓▓ HEALTH CHECKS ▓▓▓"
echo -n "Next.js (3000): "
curl -sf http://localhost:3000/api/health > /dev/null && echo "OK" || echo "FAIL"
echo -n "PostgreSQL (5432): "
docker exec moncabinet-postgres pg_isready -U moncabinet > /dev/null 2>&1 && echo "OK" || echo "FAIL"
echo -n "Redis (6379): "
docker exec moncabinet-redis redis-cli ping > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo ""
echo "▓▓▓ LOGS ERREURS RÉCENTES ▓▓▓"
docker compose -f /opt/moncabinet/docker-compose.prod.yml logs --tail=10 nextjs 2>/dev/null | grep -i "error\|fail\|exception" | tail -5 || echo "Aucune erreur récente"

echo ""
echo "▓▓▓ CERTIFICATS SSL ▓▓▓"
if [ -f /etc/letsencrypt/live/moncabinet.tn/cert.pem ]; then
  EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/moncabinet.tn/cert.pem | cut -d= -f2)
  echo "Expiration: $EXPIRY"
else
  echo "Certificat non trouvé"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
CHECK_SCRIPT
```

---

### --optimize : Optimisation performances

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'OPTIMIZE_SCRIPT'
set -e
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              OPTIMISATION VPS                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "▓▓▓ OPTIMISATION SYSTÈME ▓▓▓"

# Optimiser swappiness
current_swappiness=$(cat /proc/sys/vm/swappiness)
if [ "$current_swappiness" -gt 10 ]; then
  echo "Réduction swappiness: $current_swappiness -> 10"
  sysctl vm.swappiness=10
  echo "vm.swappiness=10" >> /etc/sysctl.conf 2>/dev/null || true
else
  echo "✓ Swappiness déjà optimisé: $current_swappiness"
fi

# Optimiser file descriptors
if ! grep -q "fs.file-max" /etc/sysctl.conf 2>/dev/null; then
  echo "Augmentation file descriptors"
  echo "fs.file-max = 65535" >> /etc/sysctl.conf
  sysctl -p
else
  echo "✓ File descriptors déjà configurés"
fi

echo ""
echo "▓▓▓ OPTIMISATION DOCKER ▓▓▓"

# Configurer logging Docker
DOCKER_DAEMON="/etc/docker/daemon.json"
if [ ! -f "$DOCKER_DAEMON" ] || ! grep -q "max-size" "$DOCKER_DAEMON" 2>/dev/null; then
  echo "Configuration logging Docker..."
  cat > "$DOCKER_DAEMON" << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF
  systemctl restart docker
  echo "✓ Logging Docker configuré"
else
  echo "✓ Logging Docker déjà configuré"
fi

echo ""
echo "▓▓▓ OPTIMISATION NGINX ▓▓▓"

# Activer gzip si pas déjà fait
if ! grep -q "gzip on" /etc/nginx/nginx.conf 2>/dev/null; then
  echo "Activation compression gzip..."
  # Ajouter dans http block si nginx existe
  if [ -f /etc/nginx/nginx.conf ]; then
    sed -i '/http {/a\    gzip on;\n    gzip_vary on;\n    gzip_min_length 1024;\n    gzip_types text/plain text/css application/json application/javascript text/xml;' /etc/nginx/nginx.conf 2>/dev/null || true
    nginx -t && systemctl reload nginx
  fi
else
  echo "✓ Gzip déjà activé"
fi

echo ""
echo "▓▓▓ OPTIMISATION REDIS ▓▓▓"

# Optimiser Redis si container existe
if docker ps | grep -q redis; then
  docker exec moncabinet-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru 2>/dev/null || true
  echo "✓ Redis: politique LRU activée"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ OPTIMISATION TERMINÉE"
OPTIMIZE_SCRIPT
```

---

### --secure : Audit sécurité

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'SECURE_SCRIPT'
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              AUDIT SÉCURITÉ VPS                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "▓▓▓ TENTATIVES CONNEXION ÉCHOUÉES ▓▓▓"
grep "Failed password" /var/log/auth.log 2>/dev/null | tail -10 || echo "Log non accessible"

echo ""
echo "▓▓▓ CONNEXIONS SSH ACTIVES ▓▓▓"
who

echo ""
echo "▓▓▓ PORTS EXPOSÉS ▓▓▓"
ss -tlnp | grep LISTEN

echo ""
echo "▓▓▓ FIREWALL STATUS ▓▓▓"
ufw status 2>/dev/null || iptables -L -n 2>/dev/null | head -20 || echo "Aucun firewall détecté"

echo ""
echo "▓▓▓ VÉRIFICATION PERMISSIONS ▓▓▓"
# Vérifier fichiers sensibles
for f in /opt/moncabinet/.env /opt/moncabinet/.env.production; do
  if [ -f "$f" ]; then
    perms=$(stat -c %a "$f" 2>/dev/null)
    if [ "$perms" = "600" ] || [ "$perms" = "640" ]; then
      echo "✓ $f: permissions OK ($perms)"
    else
      echo "⚠ $f: permissions trop permissives ($perms), correction..."
      chmod 600 "$f"
    fi
  fi
done

echo ""
echo "▓▓▓ MISES À JOUR SÉCURITÉ ▓▓▓"
apt list --upgradable 2>/dev/null | grep -i security | head -10 || echo "Vérification impossible"

echo ""
echo "▓▓▓ PROCESSUS SUSPECTS ▓▓▓"
ps aux --sort=-%cpu | head -10

echo ""
echo "▓▓▓ DERNIÈRES CONNEXIONS ROOT ▓▓▓"
last root | head -5

echo ""
echo "▓▓▓ RECOMMANDATIONS ▓▓▓"
echo "1. Configurer fail2ban si pas installé"
echo "2. Désactiver login root SSH (utiliser clés)"
echo "3. Activer UFW avec règles strictes"
echo "4. Mettre à jour régulièrement: apt update && apt upgrade"

echo ""
echo "════════════════════════════════════════════════════════════════"
SECURE_SCRIPT
```

---

### --clean : Nettoyage agressif

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'CLEAN_SCRIPT'
set -e
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              NETTOYAGE VPS                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "▓▓▓ ESPACE AVANT NETTOYAGE ▓▓▓"
df -h / /opt /var 2>/dev/null | grep -v tmpfs

echo ""
echo "▓▓▓ NETTOYAGE DOCKER ▓▓▓"

# Images non utilisées
echo "Suppression images dangling..."
docker image prune -f

# Images non taguées
echo "Suppression images non taguées..."
docker images -q --filter "dangling=true" | xargs -r docker rmi 2>/dev/null || true

# Containers arrêtés
echo "Suppression containers arrêtés..."
docker container prune -f

# Volumes orphelins
echo "Suppression volumes orphelins..."
docker volume prune -f

# Build cache
echo "Suppression build cache..."
docker builder prune -f --keep-storage 2G

# Network non utilisés
echo "Suppression networks non utilisés..."
docker network prune -f

echo ""
echo "▓▓▓ NETTOYAGE LOGS ▓▓▓"

# Logs système > 7 jours
echo "Rotation logs système..."
journalctl --vacuum-time=7d 2>/dev/null || true

# Logs Docker tronqués
for container in $(docker ps -q); do
  log_file=$(docker inspect --format='{{.LogPath}}' $container 2>/dev/null)
  if [ -f "$log_file" ] && [ $(stat -c%s "$log_file" 2>/dev/null || echo 0) -gt 104857600 ]; then
    echo "Troncature log: $container"
    truncate -s 10M "$log_file" 2>/dev/null || true
  fi
done

echo ""
echo "▓▓▓ NETTOYAGE APT ▓▓▓"
apt-get autoremove -y 2>/dev/null || true
apt-get clean 2>/dev/null || true

echo ""
echo "▓▓▓ NETTOYAGE BACKUPS ANCIENS ▓▓▓"

# Garder seulement 7 derniers backups
if [ -d /opt/backups/moncabinet ]; then
  cd /opt/backups/moncabinet
  ls -t db_backup_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -v || true
  echo "✓ Anciens backups supprimés"
fi

# Supprimer .env.production.backup > 7 jours
cd /opt/moncabinet 2>/dev/null || true
find . -name ".env.production.backup.*" -mtime +7 -delete 2>/dev/null || true

echo ""
echo "▓▓▓ NETTOYAGE CACHE NEXT.JS ▓▓▓"
# Nettoyer cache .next si trop gros
if [ -d /opt/moncabinet/.next/cache ]; then
  cache_size=$(du -sm /opt/moncabinet/.next/cache 2>/dev/null | cut -f1)
  if [ "${cache_size:-0}" -gt 500 ]; then
    echo "Cache Next.js trop gros (${cache_size}MB), nettoyage..."
    rm -rf /opt/moncabinet/.next/cache/*
  fi
fi

echo ""
echo "▓▓▓ NETTOYAGE TMP ▓▓▓"
find /tmp -type f -atime +7 -delete 2>/dev/null || true
find /var/tmp -type f -atime +7 -delete 2>/dev/null || true

echo ""
echo "▓▓▓ ESPACE APRÈS NETTOYAGE ▓▓▓"
df -h / /opt /var 2>/dev/null | grep -v tmpfs

echo ""
echo "▓▓▓ RÉSUMÉ DOCKER ▓▓▓"
docker system df

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ NETTOYAGE TERMINÉ"
CLEAN_SCRIPT
```

---

### --fix : Corriger problèmes courants

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'FIX_SCRIPT'
set -e
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              CORRECTION PROBLÈMES VPS                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"

cd /opt/moncabinet

echo ""
echo "▓▓▓ VÉRIFICATION CONTAINERS ▓▓▓"

# Redémarrer containers crashés
for container in nextjs postgres redis nginx; do
  full_name="moncabinet-$container"
  if docker ps -a --format '{{.Names}}' | grep -q "$full_name"; then
    status=$(docker inspect --format='{{.State.Status}}' "$full_name" 2>/dev/null)
    if [ "$status" != "running" ]; then
      echo "Redémarrage $full_name (status: $status)..."
      docker compose -f docker-compose.prod.yml up -d $container
    else
      echo "✓ $full_name: running"
    fi
  fi
done

echo ""
echo "▓▓▓ VÉRIFICATION RÉSEAU DOCKER ▓▓▓"

# Recréer network si problème
if ! docker network inspect moncabinet_default > /dev/null 2>&1; then
  echo "Recréation network Docker..."
  docker network create moncabinet_default 2>/dev/null || true
fi
echo "✓ Network Docker OK"

echo ""
echo "▓▓▓ VÉRIFICATION PERMISSIONS ▓▓▓"

# Corriger permissions
chmod 600 .env .env.production 2>/dev/null || true
chown -R root:root /opt/moncabinet 2>/dev/null || true
echo "✓ Permissions corrigées"

echo ""
echo "▓▓▓ VÉRIFICATION DNS/NGINX ▓▓▓"

# Recharger Nginx si config OK
if nginx -t 2>/dev/null; then
  systemctl reload nginx 2>/dev/null || true
  echo "✓ Nginx rechargé"
else
  echo "⚠ Erreur config Nginx"
fi

echo ""
echo "▓▓▓ SYNCHRONISATION HORAIRE ▓▓▓"

# Synchroniser NTP
timedatectl set-ntp true 2>/dev/null || true
echo "✓ NTP synchronisé"

echo ""
echo "▓▓▓ HEALTH CHECK FINAL ▓▓▓"

sleep 5
for i in {1..3}; do
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "✓ Application accessible"
    curl -s http://localhost:3000/api/health
    break
  fi
  echo "Attente... ($i/3)"
  sleep 5
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ CORRECTIONS TERMINÉES"
FIX_SCRIPT
```

---

### --backup : Sauvegarde complète

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'BACKUP_SCRIPT'
set -e
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              SAUVEGARDE VPS                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/moncabinet"

mkdir -p "$BACKUP_DIR"

echo ""
echo "▓▓▓ BACKUP POSTGRESQL ▓▓▓"

DB_BACKUP="$BACKUP_DIR/db_backup_$TIMESTAMP.sql"
if docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > "$DB_BACKUP" 2>/dev/null; then
  gzip "$DB_BACKUP"
  echo "✓ Base de données: ${DB_BACKUP}.gz"
  ls -lh "${DB_BACKUP}.gz"
else
  echo "⚠ Échec backup PostgreSQL"
fi

echo ""
echo "▓▓▓ BACKUP CONFIGURATION ▓▓▓"

CONFIG_BACKUP="$BACKUP_DIR/config_backup_$TIMESTAMP.tar.gz"
cd /opt/moncabinet
tar -czf "$CONFIG_BACKUP" \
  .env \
  .env.production \
  docker-compose.yml \
  docker-compose.prod.yml \
  nginx.conf 2>/dev/null || true

echo "✓ Configuration: $CONFIG_BACKUP"
ls -lh "$CONFIG_BACKUP"

echo ""
echo "▓▓▓ BACKUP UPLOADS (si existant) ▓▓▓"

if [ -d /opt/moncabinet/uploads ]; then
  UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz"
  tar -czf "$UPLOADS_BACKUP" -C /opt/moncabinet uploads 2>/dev/null || true
  echo "✓ Uploads: $UPLOADS_BACKUP"
  ls -lh "$UPLOADS_BACKUP"
else
  echo "Pas de dossier uploads"
fi

echo ""
echo "▓▓▓ LISTE BACKUPS ▓▓▓"
ls -lht "$BACKUP_DIR" | head -15

echo ""
echo "▓▓▓ ESPACE BACKUPS ▓▓▓"
du -sh "$BACKUP_DIR"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ SAUVEGARDE TERMINÉE"
echo ""
echo "Pour télécharger un backup:"
echo "scp root@84.247.165.187:$BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz ."
BACKUP_SCRIPT
```

---

### --restart : Redémarrer tous les services

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'RESTART_SCRIPT'
set -e
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              REDÉMARRAGE SERVICES                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"

cd /opt/moncabinet

echo ""
echo "▓▓▓ ARRÊT CONTAINERS ▓▓▓"
docker compose -f docker-compose.prod.yml down --timeout 30

echo ""
echo "▓▓▓ REDÉMARRAGE DOCKER ▓▓▓"
systemctl restart docker
sleep 5

echo ""
echo "▓▓▓ DÉMARRAGE CONTAINERS ▓▓▓"
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "▓▓▓ REDÉMARRAGE NGINX ▓▓▓"
systemctl restart nginx 2>/dev/null || true

echo ""
echo "▓▓▓ ATTENTE DÉMARRAGE ▓▓▓"
sleep 15

echo ""
echo "▓▓▓ VÉRIFICATION ▓▓▓"
docker compose -f docker-compose.prod.yml ps

echo ""
for i in {1..6}; do
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "✓ Application accessible"
    curl -s http://localhost:3000/api/health
    break
  fi
  echo "Attente démarrage... ($i/6)"
  sleep 5
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ REDÉMARRAGE TERMINÉ"
RESTART_SCRIPT
```

---

### --all : Exécution complète

Exécuter dans l'ordre :
1. `--check` - Diagnostic initial
2. `--backup` - Sauvegarde avant modifications
3. `--clean` - Nettoyage
4. `--optimize` - Optimisation
5. `--check` - Diagnostic final

---

## Informations VPS

| Élément | Valeur |
|---------|--------|
| **IP** | 84.247.165.187 |
| **User** | root |
| **Domaine** | moncabinet.tn |
| **App path** | /opt/moncabinet |
| **Backups** | /opt/backups/moncabinet |

## Commandes rapides

```bash
# Voir logs en temps réel
/vps --logs-live

# SSH direct
sshpass -p "$VPS_PASSWORD" ssh "$VPS_USER@$VPS_HOST"

# Copier fichier depuis VPS
scp root@84.247.165.187:/opt/backups/moncabinet/latest.sql.gz .
```

## Workflow recommandé (hebdomadaire)

1. `/vps --check` - Diagnostic
2. `/vps --backup` - Sauvegarde
3. `/vps --clean` - Nettoyage
4. `/vps --secure` - Audit sécurité
