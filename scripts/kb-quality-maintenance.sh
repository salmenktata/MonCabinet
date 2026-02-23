#!/bin/bash
#
# Script de maintenance qualité KB — exécuté chaque jour à 6h30 CET
# Cron: 30 6 * * * /opt/qadhya/scripts/kb-quality-maintenance.sh
#
# Phases:
#   1. fill-quality-scores   — 20×50 docs/jour (was 10×50)
#   2. rechunk-large         — 3×5  docs/jour
#   3. reindex-articles      — 2×3  docs/jour (code + jort)
#   4. extract-metadata      — 2×10 docs/jour (jurisprudence cassation)
#

API_URL="${APP_URL:-https://qadhya.tn}"
LOG_FILE="/var/log/qadhya/kb-quality-maintenance.log"
CRON_SECRET="${CRON_SECRET:-}"
START_TS=$(date +%s)
SCRIPT_NAME="kb-quality-maintenance"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ─── Vérifications préalables ────────────────────────────────────────────────

if [ -z "$CRON_SECRET" ]; then
  log "ERREUR: CRON_SECRET non défini"
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"

log "═══════════════════════════════════════════════════════"
log "  KB Quality Maintenance — début"
log "═══════════════════════════════════════════════════════"

# Enregistrer début en DB
curl -sf -X POST "$API_URL/api/admin/monitoring/cron-executions" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"cronName\":\"$SCRIPT_NAME\",\"status\":\"running\",\"triggeredBy\":\"cron\"}" \
  > /dev/null 2>&1 || true

TOTAL_SUCCESS=0
TOTAL_FAIL=0

# ─── Phase 1 : Quality scores (10×50 = 500 docs max) ────────────────────────

log ""
log "── Phase 1 : Quality scores (20 batches × 50 docs) ──"

for i in $(seq 1 20); do
  log "  [P1] Batch $i/20..."
  RESP=$(curl -sf -m 300 \
    -X POST "$API_URL/api/admin/kb/analyze-quality" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"batchSize":50,"skipAnalyzed":true}')

  if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "  [P1] Réponse non-JSON (deploy en cours?) — pause 30s"
    sleep 30
    continue
  fi

  SUCCESS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('succeeded',0))" 2>/dev/null || echo "0")
  FAILED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('failed',0))" 2>/dev/null || echo "0")
  ANALYZED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('analyzed',0))" 2>/dev/null || echo "0")

  TOTAL_SUCCESS=$((TOTAL_SUCCESS + SUCCESS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAILED))

  log "  [P1] Batch $i: analyzed=$ANALYZED succeeded=$SUCCESS failed=$FAILED"

  # Plus rien à analyser
  if [ "$ANALYZED" = "0" ] || [ "$SUCCESS" = "0" ] && [ "$FAILED" = "0" ]; then
    log "  [P1] Tous les docs ont un score — phase terminée"
    break
  fi

  sleep 5
done

log "  [P1] Total: succeeded=$TOTAL_SUCCESS failed=$TOTAL_FAIL"

# ─── Phase 2 : Rechunk large docs (3×5) ─────────────────────────────────────

log ""
log "── Phase 2 : Rechunk large docs (3 batches × 5 docs) ──"

RECHUNK_TOTAL=0
for i in $(seq 1 3); do
  log "  [P2] Batch $i/3..."
  RESP=$(curl -sf -m 180 \
    -X POST "$API_URL/api/admin/kb/rechunk-large" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"batchSize":5}')

  if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "  [P2] Réponse non-JSON — skip"
    continue
  fi

  PROCESSED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))" 2>/dev/null || echo "0")
  REMAINING=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remainingDocs',0))" 2>/dev/null || echo "0")

  RECHUNK_TOTAL=$((RECHUNK_TOTAL + PROCESSED))
  log "  [P2] Batch $i: processed=$PROCESSED remaining=$REMAINING"

  if [ "$REMAINING" = "0" ] || [ "$PROCESSED" = "0" ]; then
    log "  [P2] Plus de docs à rechunker — phase terminée"
    break
  fi

  sleep 10
done

log "  [P2] Total rechunked: $RECHUNK_TOTAL"

# ─── Phase 3 : Reindex articles code + jort (2×3 chacun) ────────────────────

log ""
log "── Phase 3 : Reindex articles (code + jort) ──"

for CAT in "codes" "jort"; do
  log "  [P3] Catégorie: $CAT"
  for i in $(seq 1 2); do
    RESP=$(curl -sf -m 180 \
      -X POST "$API_URL/api/admin/kb/reindex-articles" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"category\":\"$CAT\",\"batchSize\":3}")

    if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      log "  [P3][$CAT] Réponse non-JSON — skip"
      break
    fi

    PROCESSED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))" 2>/dev/null || echo "0")
    log "  [P3][$CAT] Batch $i: processed=$PROCESSED"

    if [ "$PROCESSED" = "0" ]; then
      break
    fi
    sleep 10
  done
done

# ─── Phase 4 : Extract metadata jurisprudence (2×10) ────────────────────────

log ""
log "── Phase 4 : Extract metadata jurisprudence cassation (2 batches × 10) ──"

META_TOTAL=0
for i in $(seq 1 2); do
  log "  [P4] Batch $i/2..."
  RESP=$(curl -sf -m 300 \
    -X POST "$API_URL/api/admin/kb/extract-metadata" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"batchSize":10,"category":"jurisprudence","sourceUrl":"cassation.tn"}')

  if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "  [P4] Réponse non-JSON — skip"
    continue
  fi

  SUCCEEDED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('succeeded',0))" 2>/dev/null || echo "0")
  FAILED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('failed',0))" 2>/dev/null || echo "0")
  PROCESSED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))" 2>/dev/null || echo "0")

  META_TOTAL=$((META_TOTAL + SUCCEEDED))
  log "  [P4] Batch $i: processed=$PROCESSED succeeded=$SUCCEEDED failed=$FAILED"

  if [ "$PROCESSED" = "0" ]; then
    log "  [P4] Plus de docs sans métadonnées — phase terminée"
    break
  fi

  sleep 10
done

log "  [P4] Total métadonnées extraites: $META_TOTAL"

# ─── Enregistrer fin en DB ───────────────────────────────────────────────────

END_TS=$(date +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

OUTPUT="Phase1: ${TOTAL_SUCCESS} docs quality-scored | Phase2: ${RECHUNK_TOTAL} rechunked | Phase4: ${META_TOTAL} metadata extracted"

curl -sf -X POST "$API_URL/api/admin/monitoring/cron-executions" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"cronName\":\"$SCRIPT_NAME\",\"status\":\"completed\",\"durationMs\":$DURATION_MS,\"output\":\"$OUTPUT\"}" \
  > /dev/null 2>&1 || true

log ""
log "═══════════════════════════════════════════════════════"
log "  KB Quality Maintenance — terminé en $((DURATION_MS/1000))s"
log "  $OUTPUT"
log "═══════════════════════════════════════════════════════"
