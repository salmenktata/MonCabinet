#!/bin/bash
# Librairie anti-double-run et contrôle charge — crons Qadhya
#
# Usage dans chaque script lourd :
#   source "$SCRIPT_DIR/lib/cron-lock.sh"
#   renice -n 15 $$ 2>/dev/null || true
#   wait_for_low_load 180 5
#   acquire_lock "$(basename "${BASH_SOURCE[0]}" .sh)" 3600 || exit 0
#   trap 'release_lock' EXIT INT TERM

LOCK_DIR="/tmp/qadhya-cron-locks"
mkdir -p "$LOCK_DIR"
_LOCK_FILE=""
_LOCK_NAME=""

# Acquiert un lock exclusif par script.
# Retourne 1 (skip) si le script tourne déjà depuis moins de max_age secondes.
acquire_lock() {
  local name="$1" max_age="${2:-3600}"
  _LOCK_NAME="$name"
  _LOCK_FILE="${LOCK_DIR}/${name}.lock"

  if [ -f "$_LOCK_FILE" ]; then
    local age=$(( $(date +%s) - $(stat -c %Y "$_LOCK_FILE" 2>/dev/null || echo 0) ))
    if [ "$age" -lt "$max_age" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏭️  $name déjà en cours (lock: ${age}s/${max_age}s) — skip"
      return 1
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Lock périmé (${age}s > ${max_age}s) — nettoyage"
    rm -f "$_LOCK_FILE"
  fi

  touch "$_LOCK_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔒 Lock acquis: $name"
  return 0
}

# Relâche le lock (appeler via trap EXIT INT TERM).
release_lock() {
  if [ -n "$_LOCK_FILE" ] && [ -f "$_LOCK_FILE" ]; then
    rm -f "$_LOCK_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔓 Lock releasé: $_LOCK_NAME"
  fi
}

# Attend que le load average 1min soit sous le seuil avant de démarrer.
# $1 = max_wait en secondes (défaut 180)
# $2 = seuil load (défaut 5 = 62% sur 8 vCPUs)
wait_for_low_load() {
  local max_wait="${1:-180}" threshold="${2:-5}" start
  start=$(date +%s)

  while true; do
    local load
    load=$(awk '{print int($1)}' /proc/loadavg 2>/dev/null || echo 0)
    [ "${load:-0}" -lt "$threshold" ] && return 0

    local elapsed=$(( $(date +%s) - start ))
    if [ "$elapsed" -ge "$max_wait" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  Load élevé (${load}) après ${elapsed}s — lancement quand même"
      return 0
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏳ Load CPU ${load} — attente (${elapsed}/${max_wait}s)..."
    sleep 30
  done
}
