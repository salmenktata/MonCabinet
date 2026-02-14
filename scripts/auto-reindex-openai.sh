#!/bin/bash
#
# Script automatique de réindexation OpenAI
# Attend les déploiements puis lance la réindexation en boucle
#
# Usage: ./scripts/auto-reindex-openai.sh
#

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
VPS_HOST="root@84.247.165.187"
API_URL="https://qadhya.tn/api/admin/reindex-kb-openai"
BATCH_SIZE=10
MAX_RETRIES=3

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Réindexation Automatique KB → OpenAI Embeddings${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# ÉTAPE 1: Attendre déploiement GHA
# ============================================================================

echo -e "${YELLOW}⏳ ÉTAPE 1/5${NC}: Attente fin déploiement GitHub Actions..."
echo ""

DEPLOY_TIMEOUT=600  # 10 minutes max
DEPLOY_START=$(date +%s)

while true; do
  # Récupérer statut dernier run
  RUN_STATUS=$(gh run list --workflow="Deploy to VPS Contabo" --limit 1 --json status,conclusion --jq '.[0]')
  STATUS=$(echo "$RUN_STATUS" | jq -r '.status')
  CONCLUSION=$(echo "$RUN_STATUS" | jq -r '.conclusion')

  if [ "$STATUS" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
      echo -e "${GREEN}✅ Déploiement GHA terminé avec succès${NC}"
      break
    else
      echo -e "${RED}❌ Déploiement GHA échoué: $CONCLUSION${NC}"
      exit 1
    fi
  fi

  # Vérifier timeout
  ELAPSED=$(($(date +%s) - DEPLOY_START))
  if [ $ELAPSED -gt $DEPLOY_TIMEOUT ]; then
    echo -e "${RED}❌ Timeout déploiement GHA (>10min)${NC}"
    exit 1
  fi

  echo -e "   Status: $STATUS... (${ELAPSED}s)"
  sleep 10
done

echo ""

# ============================================================================
# ÉTAPE 2: Vérifier API est accessible
# ============================================================================

echo -e "${YELLOW}⏳ ÉTAPE 2/5${NC}: Vérification API déployée..."
echo ""

# Récupérer CRON_SECRET depuis VPS
CRON_SECRET=$(ssh $VPS_HOST "grep '^CRON_SECRET=' /opt/qadhya/.env.production.local | cut -d= -f2")

if [ -z "$CRON_SECRET" ]; then
  echo -e "${RED}❌ CRON_SECRET introuvable${NC}"
  exit 1
fi

# Test API health
API_HEALTH=$(curl -s -X GET "$API_URL" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -w "\n%{http_code}" | tail -1)

if [ "$API_HEALTH" != "200" ]; then
  echo -e "${RED}❌ API non accessible (HTTP $API_HEALTH)${NC}"
  exit 1
fi

echo -e "${GREEN}✅ API accessible${NC}"
echo ""

# ============================================================================
# ÉTAPE 3: Récupérer statistiques initiales
# ============================================================================

echo -e "${YELLOW}⏳ ÉTAPE 3/5${NC}: Récupération statistiques KB..."
echo ""

STATS=$(curl -s -X GET "$API_URL" -H "Authorization: Bearer $CRON_SECRET")
TOTAL=$(echo "$STATS" | jq -r '.total')
OPENAI_INDEXED=$(echo "$STATS" | jq -r '.embeddings.openai.indexed')
REMAINING=$(echo "$STATS" | jq -r '.embeddings.openai.remaining')

echo "   Total chunks: $TOTAL"
echo "   OpenAI indexés: $OPENAI_INDEXED"
echo "   Restant: $REMAINING"
echo ""

if [ "$REMAINING" -eq 0 ]; then
  echo -e "${GREEN}✅ Aucun chunk à réindexer !${NC}"
  exit 0
fi

# Estimation temps
BATCHES=$((REMAINING / BATCH_SIZE + 1))
EST_TIME=$((BATCHES * 3 / 60))  # 3s par batch, converti en minutes

echo -e "${BLUE}📊 Estimation: $BATCHES batches × 3s = ~${EST_TIME}min${NC}"
echo ""

# ============================================================================
# ÉTAPE 4: Réindexation en boucle
# ============================================================================

echo -e "${YELLOW}⏳ ÉTAPE 4/5${NC}: Réindexation en cours..."
echo ""

BATCH_NUM=0
TOTAL_INDEXED=0
TOTAL_ERRORS=0
START_TIME=$(date +%s)

while true; do
  BATCH_NUM=$((BATCH_NUM + 1))

  echo -e "${BLUE}📦 Batch #$BATCH_NUM${NC}"

  # Appel API avec retry logic
  RETRY=0
  SUCCESS=false

  while [ $RETRY -lt $MAX_RETRIES ]; do
    RESULT=$(curl -s -X POST "$API_URL?batch_size=$BATCH_SIZE" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -w "\n%{http_code}")

    HTTP_CODE=$(echo "$RESULT" | tail -1)
    BODY=$(echo "$RESULT" | head -n -1)

    if [ "$HTTP_CODE" = "200" ]; then
      SUCCESS=true
      break
    fi

    RETRY=$((RETRY + 1))
    echo -e "   ${YELLOW}⚠️  Retry $RETRY/$MAX_RETRIES (HTTP $HTTP_CODE)${NC}"
    sleep 5
  done

  if [ "$SUCCESS" = false ]; then
    echo -e "${RED}❌ Échec batch après $MAX_RETRIES tentatives${NC}"
    TOTAL_ERRORS=$((TOTAL_ERRORS + BATCH_SIZE))

    # Continuer malgré l'erreur
    sleep 10
    continue
  fi

  # Parser résultats
  BATCH_INDEXED=$(echo "$BODY" | jq -r '.batch.indexed // 0')
  BATCH_ERRORS=$(echo "$BODY" | jq -r '.batch.errors // 0')
  PROGRESS_INDEXED=$(echo "$BODY" | jq -r '.progress.indexed // 0')
  PROGRESS_REMAINING=$(echo "$BODY" | jq -r '.progress.remaining // 0')
  PROGRESS_PCT=$(echo "$BODY" | jq -r '.progress.percentage // 0')

  TOTAL_INDEXED=$((TOTAL_INDEXED + BATCH_INDEXED))
  TOTAL_ERRORS=$((TOTAL_ERRORS + BATCH_ERRORS))

  # Afficher progression
  ELAPSED=$(($(date +%s) - START_TIME))
  echo "   Indexés: $BATCH_INDEXED/$BATCH_SIZE (erreurs: $BATCH_ERRORS)"
  echo "   Global: $PROGRESS_INDEXED/$TOTAL ($PROGRESS_PCT%) - Reste: $PROGRESS_REMAINING"
  echo "   Temps écoulé: ${ELAPSED}s"
  echo ""

  # Vérifier si terminé
  if [ "$PROGRESS_REMAINING" -eq 0 ]; then
    echo -e "${GREEN}✅ Réindexation terminée !${NC}"
    break
  fi

  # Pause entre batches (rate limit)
  sleep 3
done

# ============================================================================
# ÉTAPE 5: Statistiques finales
# ============================================================================

echo ""
echo -e "${YELLOW}⏳ ÉTAPE 5/5${NC}: Statistiques finales..."
echo ""

FINAL_STATS=$(curl -s -X GET "$API_URL" -H "Authorization: Bearer $CRON_SECRET")
FINAL_OPENAI=$(echo "$FINAL_STATS" | jq -r '.embeddings.openai.indexed')
FINAL_PCT=$(echo "$FINAL_STATS" | jq -r '.embeddings.openai.percentage')

TOTAL_TIME=$(($(date +%s) - START_TIME))
TOTAL_MIN=$((TOTAL_TIME / 60))
TOTAL_SEC=$((TOTAL_TIME % 60))

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ RÉINDEXATION TERMINÉE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📊 Résultats:"
echo "   • Total indexés: $FINAL_OPENAI/$TOTAL ($FINAL_PCT%)"
echo "   • Succès: $TOTAL_INDEXED"
echo "   • Erreurs: $TOTAL_ERRORS"
echo "   • Batches: $BATCH_NUM"
echo "   • Temps: ${TOTAL_MIN}min ${TOTAL_SEC}s"
echo ""
echo -e "${BLUE}🎯 Prochaine étape: Tester l'assistant IA${NC}"
echo "   👉 https://qadhya.tn/assistant-ia"
echo ""
