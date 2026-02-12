#!/bin/bash
#
# Script de monitoring en temps réel de l'extraction de métadonnées
# Affiche la progression toutes les 30 secondes
#

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
ORANGE='\033[0;33m'
NC='\033[0m' # No Color

SOURCE_ID="4319d2d1-569c-4107-8f52-d71e2a2e9fe9"
INTERVAL=30 # secondes

# Variables pour calculer la vitesse
PREV_COUNT=0
PREV_TIME=0
START_TIME=$(date +%s)
START_COUNT=0

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     MONITORING EXTRACTION MÉTADONNÉES - 9ANOUN.TN             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}Source ID:${NC} $SOURCE_ID"
echo -e "${BLUE}Intervalle:${NC} ${INTERVAL}s"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""
echo "────────────────────────────────────────────────────────────────"

while true; do
  CURRENT_TIME=$(date +%s)

  # Récupérer les stats via SSH
  STATS=$(ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c \"
    SELECT
      COUNT(*),
      COUNT(wpsm.web_page_id),
      COUNT(*) - COUNT(wpsm.web_page_id),
      ROUND(100.0 * COUNT(wpsm.web_page_id) / NULLIF(COUNT(*), 0), 2)
    FROM web_pages wp
    LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
    WHERE wp.web_source_id = '$SOURCE_ID';
  \"" 2>/dev/null)

  # Parser les résultats
  TOTAL=$(echo "$STATS" | awk '{print $1}')
  WITH_METADATA=$(echo "$STATS" | awk '{print $3}')
  WITHOUT_METADATA=$(echo "$STATS" | awk '{print $5}')
  COVERAGE=$(echo "$STATS" | awk '{print $7}')

  # Initialiser start_count au premier passage
  if [ $START_COUNT -eq 0 ]; then
    START_COUNT=$WITH_METADATA
    PREV_COUNT=$WITH_METADATA
    PREV_TIME=$CURRENT_TIME
  fi

  # Calculer la progression depuis le début
  TOTAL_PROGRESS=$((WITH_METADATA - START_COUNT))
  ELAPSED_TIME=$((CURRENT_TIME - START_TIME))

  # Calculer la vitesse instantanée (depuis dernière mesure)
  TIME_DIFF=$((CURRENT_TIME - PREV_TIME))
  if [ $TIME_DIFF -gt 0 ]; then
    COUNT_DIFF=$((WITH_METADATA - PREV_COUNT))
    SPEED=$(echo "scale=2; $COUNT_DIFF / ($TIME_DIFF / 60.0)" | bc)
  else
    SPEED="0.00"
  fi

  # Calculer la vitesse moyenne globale
  if [ $ELAPSED_TIME -gt 0 ]; then
    AVG_SPEED=$(echo "scale=2; $TOTAL_PROGRESS / ($ELAPSED_TIME / 60.0)" | bc)
  else
    AVG_SPEED="0.00"
  fi

  # Estimer le temps restant
  if [ $(echo "$AVG_SPEED > 0" | bc) -eq 1 ]; then
    REMAINING_MINUTES=$(echo "scale=0; $WITHOUT_METADATA / $AVG_SPEED" | bc)
    REMAINING_HOURS=$(echo "scale=1; $REMAINING_MINUTES / 60" | bc)
  else
    REMAINING_MINUTES="∞"
    REMAINING_HOURS="∞"
  fi

  # Formater la durée écoulée
  ELAPSED_HOURS=$(echo "scale=1; $ELAPSED_TIME / 3600" | bc)
  ELAPSED_MINUTES=$(echo "scale=0; $ELAPSED_TIME / 60" | bc)

  # Afficher les stats
  TIMESTAMP=$(date '+%H:%M:%S')
  echo ""
  echo -e "${BLUE}[$TIMESTAMP]${NC} ────────────────────────────────────────────────"
  echo -e "  ${GREEN}✅ Organisées:${NC}    ${WITH_METADATA} / ${TOTAL} pages (${COVERAGE}%)"
  echo -e "  ${ORANGE}⏳ Restantes:${NC}     ${WITHOUT_METADATA} pages"
  echo -e "  ${BLUE}📈 Progression:${NC}   +${TOTAL_PROGRESS} pages depuis le début"
  echo ""
  echo -e "  ${YELLOW}⚡ Vitesse:${NC}"
  echo -e "     - Instantanée:  ${SPEED} pages/min"
  echo -e "     - Moyenne:      ${AVG_SPEED} pages/min"
  echo ""
  echo -e "  ${BLUE}⏱️  Temps:${NC}"
  echo -e "     - Écoulé:       ${ELAPSED_MINUTES} min (${ELAPSED_HOURS}h)"
  if [ "$REMAINING_MINUTES" != "∞" ]; then
    echo -e "     - Restant (est): ${REMAINING_MINUTES} min (${REMAINING_HOURS}h)"
  else
    echo -e "     - Restant (est): En attente de données..."
  fi

  # Barre de progression visuelle
  PROGRESS_WIDTH=50
  FILLED=$(echo "scale=0; $COVERAGE * $PROGRESS_WIDTH / 100" | bc)
  EMPTY=$((PROGRESS_WIDTH - FILLED))

  echo ""
  echo -n "  ["
  for ((i=0; i<FILLED; i++)); do echo -n "█"; done
  for ((i=0; i<EMPTY; i++)); do echo -n "░"; done
  echo "] ${COVERAGE}%"

  # Sauvegarder pour le prochain cycle
  PREV_COUNT=$WITH_METADATA
  PREV_TIME=$CURRENT_TIME

  # Vérifier si terminé
  if [ $WITHOUT_METADATA -eq 0 ]; then
    echo ""
    echo "────────────────────────────────────────────────────────────────"
    echo -e "${GREEN}✨ EXTRACTION TERMINÉE !${NC}"
    echo -e "${GREEN}   Toutes les ${WITH_METADATA} pages ont été organisées${NC}"
    echo -e "${GREEN}   Durée totale: ${ELAPSED_MINUTES} min (${ELAPSED_HOURS}h)${NC}"
    echo ""
    exit 0
  fi

  # Attendre avant la prochaine vérification
  sleep $INTERVAL
done
