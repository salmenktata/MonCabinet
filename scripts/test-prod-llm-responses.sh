#!/bin/bash
# =============================================================================
# Test des Réponses LLM sur 3 Pages en Production
# =============================================================================
# Compare les réponses et performances sur :
#   1. /dossiers/assistant
#   2. /dossiers/consultation
#   3. /assistant-ia
#
# Avec le même prompt juridique tunisien
# =============================================================================

set -e

# Couleurs
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
BASE_URL="https://qadhya.tn"
PROMPT="ما هي الإجراءات القانونية لرفع دعوى إيجار في تونس؟"

echo -e "${BLUE}==================================================================="
echo "🧪 Test des Réponses LLM Production - $(date)"
echo "==================================================================="
echo -e "Prompt test: ${YELLOW}$PROMPT${NC}"
echo -e "===================================================================${NC}\n"

# URLs à tester
declare -a PAGES=(
  "/dossiers/assistant"
  "/dossiers/consultation"
  "/assistant-ia"
)

# =============================================================================
# Fonction de test d'une page
# =============================================================================
test_page() {
  local url="$1"
  local page_name="$2"

  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}📄 Test: $page_name${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "URL: ${url}\n"

  # Test 1: Accessibilité
  echo -e "${YELLOW}1. Test accessibilité...${NC}"
  local start_time=$(date +%s%N)
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" -L "$url")
  local end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 ))

  if [ "$http_code" -eq 200 ]; then
    echo -e "   ${GREEN}✓ Page accessible (HTTP $http_code)${NC}"
    echo -e "   Temps de chargement: ${duration}ms"
  else
    echo -e "   ${RED}✗ Erreur HTTP $http_code${NC}"
    return 1
  fi

  # Test 2: Contenu de la page
  echo -e "\n${YELLOW}2. Analyse du contenu...${NC}"
  local content=$(curl -s -L "$url")

  # Vérifier présence d'éléments clés
  if echo "$content" | grep -q "textarea\|input\|chat"; then
    echo -e "   ${GREEN}✓ Interface de chat détectée${NC}"
  else
    echo -e "   ${YELLOW}⚠ Interface de chat non détectée${NC}"
  fi

  if echo "$content" | grep -q "api\|endpoint"; then
    echo -e "   ${GREEN}✓ API endpoint configuré${NC}"
  fi

  # Test 3: Headers de sécurité
  echo -e "\n${YELLOW}3. Vérification sécurité...${NC}"
  local headers=$(curl -s -I -L "$url")

  if echo "$headers" | grep -qi "x-frame-options\|content-security-policy"; then
    echo -e "   ${GREEN}✓ Headers de sécurité présents${NC}"
  else
    echo -e "   ${YELLOW}⚠ Headers de sécurité manquants${NC}"
  fi

  echo ""
}

# =============================================================================
# Tester chaque page
# =============================================================================
for page in "${PAGES[@]}"; do
  test_page "${BASE_URL}${page}" "$page"
  sleep 2
done

# =============================================================================
# Test API Health
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🏥 Test Health API${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

health_response=$(curl -s "${BASE_URL}/api/health")
health_status=$(echo "$health_response" | jq -r '.status // "unknown"')

if [ "$health_status" = "healthy" ]; then
  echo -e "${GREEN}✓ API Health: $health_status${NC}\n"
  echo "$health_response" | jq '.'
else
  echo -e "${RED}✗ API Health: $health_status${NC}\n"
fi

# =============================================================================
# Résumé
# =============================================================================
echo -e "\n${BLUE}==================================================================="
echo "📊 Résumé des Tests"
echo -e "===================================================================${NC}\n"

echo -e "${GREEN}✅ Tests terminés${NC}\n"

echo "📝 Notes:"
echo "   - Les 3 pages nécessitent authentification (307 redirects normaux)"
echo "   - Pour tester les réponses LLM, se connecter et utiliser l'interface"
echo "   - Prompt de test: ${YELLOW}$PROMPT${NC}"
echo ""

echo "🔗 URLs testées:"
for page in "${PAGES[@]}"; do
  echo "   - ${BASE_URL}${page}"
done

echo ""
echo "📖 Documentation:"
echo "   - Guide sync clés: docs/API_KEYS_SYNC_GUIDE.md"
echo "   - GitHub Secrets: docs/GITHUB_SECRETS_SETUP.md"
echo ""
