#!/bin/bash
# ============================================================================
# Script de monitoring VPS MonCabinet
# Usage: bash monitor-vps.sh
# ============================================================================

echo "=============================================="
echo "   MonCabinet VPS - Rapport de Performance"
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# ============================================================================
# 1. UTILISATION CPU/RAM
# ============================================================================
echo "=== RESSOURCES SYSTÈME ==="
echo ""

# CPU
echo "CPU:"
top -bn1 | grep "Cpu(s)" | awk '{print "  Utilisé: " 100-$8 "%"}'
echo "  Cores: $(nproc)"
echo ""

# RAM
echo "MÉMOIRE:"
free -h | awk '/^Mem:/ {print "  Total: " $2 "\n  Utilisé: " $3 "\n  Disponible: " $7}'
echo ""

# Swap
echo "SWAP:"
free -h | awk '/^Swap:/ {print "  Total: " $2 "\n  Utilisé: " $3}'
echo ""

# Disque
echo "DISQUE:"
df -h / | awk 'NR==2 {print "  Total: " $2 "\n  Utilisé: " $3 " (" $5 ")\n  Disponible: " $4}'
echo ""

# ============================================================================
# 2. CONTENEURS DOCKER
# ============================================================================
echo "=== CONTENEURS DOCKER ==="
echo ""

docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "Docker non disponible"
echo ""

# Health des conteneurs
echo "SANTÉ DES CONTENEURS:"
docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null | while read line; do
    if echo "$line" | grep -q "healthy"; then
        echo "  ✓ $line"
    elif echo "$line" | grep -q "unhealthy"; then
        echo "  ✗ $line"
    else
        echo "  ? $line"
    fi
done
echo ""

# ============================================================================
# 3. NGINX
# ============================================================================
echo "=== NGINX ==="
echo ""

if systemctl is-active --quiet nginx; then
    echo "  Status: ✓ Actif"
    echo "  Workers: $(ps aux | grep 'nginx: worker' | grep -v grep | wc -l)"
    echo "  Connexions actives: $(curl -s http://localhost/nginx_status 2>/dev/null | grep 'Active' | awk '{print $3}' || echo 'N/A')"
else
    echo "  Status: ✗ Inactif"
fi
echo ""

# ============================================================================
# 4. POSTGRESQL
# ============================================================================
echo "=== POSTGRESQL ==="
echo ""

if docker exec moncabinet-postgres pg_isready -U moncabinet > /dev/null 2>&1; then
    echo "  Status: ✓ Actif"

    # Connexions actives
    CONN=$(docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' ')
    echo "  Connexions actives: ${CONN:-N/A}"

    # Taille DB
    SIZE=$(docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -t -c "SELECT pg_size_pretty(pg_database_size('moncabinet'));" 2>/dev/null | tr -d ' ')
    echo "  Taille DB: ${SIZE:-N/A}"
else
    echo "  Status: ✗ Inactif"
fi
echo ""

# ============================================================================
# 5. REDIS (si présent)
# ============================================================================
echo "=== REDIS ==="
echo ""

if docker exec moncabinet-redis redis-cli ping > /dev/null 2>&1; then
    echo "  Status: ✓ Actif"

    # Mémoire utilisée
    MEM=$(docker exec moncabinet-redis redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
    echo "  Mémoire: ${MEM:-N/A}"

    # Clés
    KEYS=$(docker exec moncabinet-redis redis-cli dbsize 2>/dev/null | awk '{print $2}')
    echo "  Clés: ${KEYS:-N/A}"
else
    echo "  Status: Non configuré"
fi
echo ""

# ============================================================================
# 6. MINIO
# ============================================================================
echo "=== MINIO (Stockage) ==="
echo ""

if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "  Status: ✓ Actif"

    # Espace utilisé (approximatif)
    docker exec moncabinet-minio du -sh /data 2>/dev/null | awk '{print "  Stockage utilisé: " $1}' || echo "  Stockage: N/A"
else
    echo "  Status: ✗ Inactif"
fi
echo ""

# ============================================================================
# 7. APPLICATION NEXT.JS
# ============================================================================
echo "=== APPLICATION ==="
echo ""

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null)
if [ "$HEALTH" == "200" ]; then
    echo "  Status: ✓ Actif"

    # Temps de réponse
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:3000/api/health 2>/dev/null)
    echo "  Temps réponse health: ${RESPONSE_TIME}s"
else
    echo "  Status: ✗ Inactif (HTTP $HEALTH)"
fi
echo ""

# ============================================================================
# 8. RÉSEAU
# ============================================================================
echo "=== RÉSEAU ==="
echo ""

# Connexions établies
echo "  Connexions TCP établies: $(ss -t state established | wc -l)"
echo "  Connexions TIME_WAIT: $(ss -t state time-wait | wc -l)"
echo ""

# ============================================================================
# 9. LOGS ERREURS RÉCENTES
# ============================================================================
echo "=== ERREURS RÉCENTES (24h) ==="
echo ""

# Nginx errors
NGINX_ERRORS=$(tail -1000 /var/log/nginx/moncabinet_error.log 2>/dev/null | grep -c "error" || echo "0")
echo "  Nginx errors: $NGINX_ERRORS"

# Docker logs errors
DOCKER_ERRORS=$(docker logs moncabinet-nextjs --since 24h 2>&1 | grep -ci "error" || echo "0")
echo "  App errors: $DOCKER_ERRORS"
echo ""

# ============================================================================
# RECOMMANDATIONS
# ============================================================================
echo "=== RECOMMANDATIONS ==="
echo ""

# Vérifier RAM
RAM_USED_PCT=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$RAM_USED_PCT" -gt 85 ]; then
    echo "  ⚠ RAM > 85% - Envisager upgrade ou optimisation"
fi

# Vérifier disque
DISK_USED_PCT=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
if [ "$DISK_USED_PCT" -gt 80 ]; then
    echo "  ⚠ Disque > 80% - Nettoyage recommandé"
fi

# Vérifier swap usage
SWAP_USED=$(free | awk '/^Swap:/ {print $3}')
if [ "$SWAP_USED" -gt 1073741824 ]; then
    echo "  ⚠ Swap > 1GB utilisé - RAM insuffisante"
fi

echo "  ✓ Rapport terminé"
echo ""
