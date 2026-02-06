#!/bin/bash
# ============================================================================
# Script d'optimisation VPS pour MonCabinet
# Exécuter une fois après l'installation initiale
# Usage: sudo bash optimize-vps.sh
# ============================================================================

set -e

echo "=== Optimisation VPS MonCabinet ==="
echo ""

# Vérifier root
if [[ $EUID -ne 0 ]]; then
   echo "Ce script doit être exécuté en tant que root (sudo)"
   exit 1
fi

# ============================================================================
# 1. OPTIMISATIONS KERNEL (sysctl)
# ============================================================================
echo "[1/7] Configuration sysctl pour performances réseau..."

cat > /etc/sysctl.d/99-moncabinet.conf << 'EOF'
# MonCabinet VPS Optimizations

# Réseau - TCP
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15

# TCP Fast Open
net.ipv4.tcp_fastopen = 3

# Buffers réseau
net.core.rmem_default = 262144
net.core.rmem_max = 16777216
net.core.wmem_default = 262144
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 262144 16777216
net.ipv4.tcp_wmem = 4096 262144 16777216

# Connexions TIME_WAIT
net.ipv4.tcp_tw_reuse = 1

# Protection contre les attaques
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Mémoire virtuelle
vm.swappiness = 10
vm.dirty_ratio = 60
vm.dirty_background_ratio = 2
vm.overcommit_memory = 1

# Limites fichiers
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
EOF

sysctl -p /etc/sysctl.d/99-moncabinet.conf > /dev/null
echo "   ✓ sysctl configuré"

# ============================================================================
# 2. LIMITES SYSTÈME (ulimit)
# ============================================================================
echo "[2/7] Configuration limites système..."

cat > /etc/security/limits.d/99-moncabinet.conf << 'EOF'
# MonCabinet - Limites système
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
root soft nofile 65535
root hard nofile 65535
EOF
echo "   ✓ limites configurées"

# ============================================================================
# 3. SWAP (si pas déjà configuré)
# ============================================================================
echo "[3/7] Vérification swap..."

if [ ! -f /swapfile ]; then
    echo "   Création swap de 4GB..."
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "   ✓ swap 4GB créé"
else
    echo "   ✓ swap déjà configuré"
fi

# ============================================================================
# 4. NGINX - Worker processes
# ============================================================================
echo "[4/7] Optimisation Nginx workers..."

if [ -f /etc/nginx/nginx.conf ]; then
    # Obtenir nombre de CPU
    CPU_COUNT=$(nproc)

    # Backup
    cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak

    # Modifier worker_processes
    sed -i "s/worker_processes.*/worker_processes $CPU_COUNT;/" /etc/nginx/nginx.conf

    # Ajouter worker_connections si pas présent
    if ! grep -q "worker_connections 4096" /etc/nginx/nginx.conf; then
        sed -i '/events {/,/}/ s/worker_connections.*/worker_connections 4096;/' /etc/nginx/nginx.conf
    fi

    # Créer dossier cache si nécessaire
    mkdir -p /var/cache/nginx/moncabinet
    chown -R www-data:www-data /var/cache/nginx

    nginx -t && systemctl reload nginx
    echo "   ✓ Nginx optimisé ($CPU_COUNT workers)"
else
    echo "   ⚠ Nginx non trouvé"
fi

# ============================================================================
# 5. LOGROTATE pour Docker
# ============================================================================
echo "[5/7] Configuration logrotate Docker..."

cat > /etc/logrotate.d/docker-containers << 'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    missingok
    delaycompress
    copytruncate
    maxsize 100M
}
EOF

# Docker daemon.json pour limiter les logs
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "50m",
        "max-file": "3"
    },
    "storage-driver": "overlay2"
}
EOF

systemctl restart docker 2>/dev/null || true
echo "   ✓ logrotate Docker configuré"

# ============================================================================
# 6. FAIL2BAN
# ============================================================================
echo "[6/7] Configuration Fail2ban..."

if ! command -v fail2ban-client &> /dev/null; then
    apt-get install -y fail2ban > /dev/null
fi

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/moncabinet_error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/moncabinet_error.log
maxretry = 10
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "   ✓ Fail2ban configuré"

# ============================================================================
# 7. NETTOYAGE
# ============================================================================
echo "[7/7] Nettoyage système..."

# Nettoyer apt cache
apt-get autoremove -y > /dev/null 2>&1
apt-get clean > /dev/null 2>&1

# Nettoyer Docker (images inutilisées)
docker system prune -f > /dev/null 2>&1 || true

# Journaux systemd (garder 7 jours)
journalctl --vacuum-time=7d > /dev/null 2>&1

echo "   ✓ Nettoyage terminé"

# ============================================================================
# RÉSUMÉ
# ============================================================================
echo ""
echo "=== Optimisation terminée ==="
echo ""
echo "Changements appliqués:"
echo "  - sysctl: TCP/réseau optimisés, swappiness=10"
echo "  - ulimit: 65535 fichiers ouverts"
echo "  - swap: 4GB configuré"
echo "  - Nginx: $(nproc) workers, 4096 connexions"
echo "  - Docker: logs limités à 50MB x 3 fichiers"
echo "  - Fail2ban: protection SSH et Nginx"
echo ""
echo "Redémarrage recommandé pour appliquer tous les changements:"
echo "  sudo reboot"
echo ""
