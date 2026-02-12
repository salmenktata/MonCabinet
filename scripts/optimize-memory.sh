#!/bin/bash

# Script d'optimisation mémoire pour développement Qadhya
# Usage: bash scripts/optimize-memory.sh

set -e

echo "🧹 Optimisation mémoire en cours..."

# 1. Nettoyer les processus zombies
echo "→ Nettoyage des processus tail zombies..."
pkill -f "tail -f /tmp/nextjs-dev.log" 2>/dev/null || true

# 2. Nettoyer les logs Next.js volumineux
if [[ -f /tmp/nextjs-dev.log ]]; then
  echo "→ Rotation des logs Next.js..."
  LOG_SIZE=$(wc -c < /tmp/nextjs-dev.log)
  LOG_SIZE_MB=$((LOG_SIZE / 1048576))
  if [[ $LOG_SIZE -gt 10485760 ]]; then  # > 10MB
    tail -n 1000 /tmp/nextjs-dev.log > /tmp/nextjs-dev.log.tmp
    mv /tmp/nextjs-dev.log.tmp /tmp/nextjs-dev.log
    echo "  ✅ Logs réduits de ${LOG_SIZE_MB}MB à 1k lignes"
  else
    echo "  ✅ Logs OK (${LOG_SIZE_MB}MB)"
  fi
fi

# 3. Nettoyer le cache Next.js
if [[ -d .next ]]; then
  echo "→ Nettoyage du cache Next.js..."
  CACHE_SIZE=$(du -sh .next 2>/dev/null | cut -f1)
  rm -rf .next/cache 2>/dev/null || true
  echo "  ✅ Cache Next.js nettoyé ($CACHE_SIZE)"
fi

# 4. Nettoyer node_modules/.cache si trop gros
if [[ -d node_modules/.cache ]]; then
  CACHE_SIZE=$(du -sh node_modules/.cache 2>/dev/null | cut -f1 || echo "0")
  if [[ "$CACHE_SIZE" != "0" ]]; then
    echo "→ Nettoyage du cache node_modules..."
    rm -rf node_modules/.cache
    echo "  ✅ Cache npm nettoyé ($CACHE_SIZE)"
  fi
fi

# 5. Purger la mémoire inactive (macOS)
echo "→ Purge de la mémoire système..."
sudo purge 2>/dev/null && echo "  ✅ Mémoire purgée" || echo "  ⚠️ Sudo requis pour purge (optionnel)"

# 6. Statistiques finales
echo ""
echo "📊 Utilisation mémoire après optimisation :"
echo "─────────────────────────────────────────"

# Mémoire iTerm2
ITERM_MEM=$(ps aux | grep iTerm2 | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
printf "iTerm2        : %.0f MB\n" $ITERM_MEM

# Mémoire Docker
DOCKER_MEM=$(ps aux | grep docker | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
printf "Docker        : %.0f MB\n" $DOCKER_MEM

# Mémoire totale disponible
FREE_MEM=$(vm_stat | perl -ne '/page size of (\d+)/ and $size=$1; /Pages free:[^\d]+(\d+)/ and printf("%.0f", $1 * $size / 1048576);')
echo "RAM libre     : $FREE_MEM MB"

echo ""
echo "✅ Optimisation terminée !"
echo ""
echo "💡 Pour un gain maximal, suivez les instructions dans :"
echo "   .docs/iterm2-optimization.md"
