#!/bin/bash
# Cron - Crawl codes juridiques IORT (iort.tn)
# Lance le crawl de TOUS les codes disponibles (52 codes)
# Usage: ./cron-crawl-iort-codes.sh [--resume]

LOGFILE="/var/log/qadhya/iort-codes-crawl.log"
CJS="/opt/moncabinet/crawl-iort-codes.cjs"
LOCKFILE="/tmp/iort-codes-crawl.lock"

export DATABASE_URL="postgresql://moncabinet:prod_secure_password_2026@localhost:5433/qadhya"
export MINIO_ENDPOINT="localhost"
export MINIO_PORT="9000"
export MINIO_ACCESS_KEY="moncabinet"
export MINIO_SECRET_KEY="minio_secure_password_2026"
export MINIO_BUCKET="documents"
export MINIO_USE_SSL="false"
export REDIS_URL="redis://localhost:6379"
export OLLAMA_ENABLED="true"
export OLLAMA_BASE_URL="http://localhost:11434"
export OLLAMA_EMBEDDING_MODEL="qwen3-embedding:0.6b"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }

mkdir -p "$(dirname "$LOGFILE")"

if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if kill -0 "$PID" 2>/dev/null; then
    log "SKIP — crawl codes déjà en cours (PID $PID)"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi

if [ ! -f "$CJS" ]; then
  log "ERREUR — $CJS introuvable"
  exit 1
fi

ARGS="--all --resume"
[ "$1" = "--resume" ] && ARGS="--all --resume"
[ "$1" = "--force" ] && ARGS="--all"

log "START — crawl tous les codes IORT ($ARGS)"

nohup node "$CJS" $ARGS >> "$LOGFILE" 2>&1 &
CRAWL_PID=$!
echo "$CRAWL_PID" > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT
log "Crawl lancé (PID=$CRAWL_PID)"

# Attendre la fin (max 6h pour 52 codes)
TIMEOUT=21600
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep 60
  ELAPSED=$((ELAPSED + 60))
  if ! kill -0 $CRAWL_PID 2>/dev/null; then
    log "Crawl terminé après ${ELAPSED}s"
    break
  fi
done

[ $ELAPSED -ge $TIMEOUT ] && log "TIMEOUT 6h — kill PID $CRAWL_PID" && kill $CRAWL_PID 2>/dev/null
log "END"
