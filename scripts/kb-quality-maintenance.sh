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
#   5. enrich-metadata       — 3×10 docs/jour (completeness < 70)
#   6. deactivate-short-docs — 1×200 docs/jour (full_text < 50 chars)
#   7. detect-contradictions — 2×3  pages/jour (non encore vérifiées)
#

API_URL="${APP_URL:-http://localhost:3000}"
LOG_FILE="/var/log/qadhya/kb-quality-maintenance.log"
START_TS=$(date +%s)
SCRIPT_NAME="kb-quality-maintenance"

# Récupérer CRON_SECRET depuis le container Docker (disponible même sans env cron)
if [ -z "$CRON_SECRET" ]; then
  CRON_SECRET=$(docker exec qadhya-nextjs printenv CRON_SECRET 2>/dev/null | tr -d '\n\r')
fi

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

# ─── Phase 5 : Enrichissement métadonnées (completeness < 70) ───────────────

log ""
log "── Phase 5 : Enrich metadata (completeness < 70, 3 batches × 10) ──"

ENRICH_TOTAL=0
for i in $(seq 1 3); do
  log "  [P5] Batch $i/3..."
  RESP=$(curl -sf -m 300 \
    -X POST "$API_URL/api/admin/kb/enrich-metadata" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"batchSize":10,"maxCompletenessScore":70,"reanalyzeAfter":true}')

  if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "  [P5] Réponse non-JSON — skip"
    continue
  fi

  SUCCEEDED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('succeeded',0))" 2>/dev/null || echo "0")
  FAILED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('failed',0))" 2>/dev/null || echo "0")
  PROCESSED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))" 2>/dev/null || echo "0")

  ENRICH_TOTAL=$((ENRICH_TOTAL + SUCCEEDED))
  log "  [P5] Batch $i: processed=$PROCESSED succeeded=$SUCCEEDED failed=$FAILED"

  if [ "$PROCESSED" = "0" ]; then
    log "  [P5] Plus de docs à enrichir — phase terminée"
    break
  fi

  sleep 30
done

log "  [P5] Total enrichis: $ENRICH_TOTAL"

# ─── Phase 6 : Désactivation docs trop courts (< 50 chars) ──────────────────

log ""
log "── Phase 6 : Désactivation docs trop courts (< 50 chars) ──"

RESP=$(curl -sf -m 120 \
  -X POST "$API_URL/api/admin/kb/analyze-quality" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":200,"skipAnalyzed":false,"deactivateShortDocs":true}')

if echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  DEACTIVATED=$(echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
n = sum(1 for r in d.get('results', []) if 'Désactivé' in (r.get('error') or ''))
print(n)
" 2>/dev/null || echo "0")
  log "  [P6] Docs désactivés (< 50 chars): $DEACTIVATED"
else
  log "  [P6] Réponse non-JSON — skip"
  DEACTIVATED=0
fi

# ─── Phase 7 : Détection contradictions (2×3 pages) ─────────────────────────

log ""
log "── Phase 7 : Détection contradictions (2 batches × 3 pages) ──"

CONTRA_TOTAL=0
for i in $(seq 1 2); do
  log "  [P7] Batch $i/2..."
  RESP=$(curl -sf -m 300 \
    -X POST "$API_URL/api/admin/kb/detect-contradictions" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"batchSize":3}')

  if ! echo "$RESP" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "  [P7] Réponse non-JSON — skip"
    continue
  fi

  PROCESSED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))" 2>/dev/null || echo "0")
  FOUND=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalFound',0))" 2>/dev/null || echo "0")
  REMAINING=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remaining',0))" 2>/dev/null || echo "0")

  CONTRA_TOTAL=$((CONTRA_TOTAL + FOUND))
  log "  [P7] Batch $i: processed=$PROCESSED found=$FOUND remaining=$REMAINING"

  if [ "$PROCESSED" = "0" ]; then
    log "  [P7] Toutes les pages ont été vérifiées — phase terminée"
    break
  fi

  sleep 15
done

log "  [P7] Total contradictions détectées: $CONTRA_TOTAL"

# ─── Enregistrer fin en DB ───────────────────────────────────────────────────

END_TS=$(date +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

OUTPUT="Phase1: ${TOTAL_SUCCESS} quality-scored | Phase2: ${RECHUNK_TOTAL} rechunked | Phase4: ${META_TOTAL} metadata | Phase5: ${ENRICH_TOTAL} enriched | Phase6: ${DEACTIVATED} deactivated | Phase7: ${CONTRA_TOTAL} contradictions"

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
