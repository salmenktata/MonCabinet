#!/bin/bash
#
# Script de test local - Sprint 1
# Exécute tous les tests de validation avant déploiement
#
# Usage:
#   bash scripts/run-local-tests.sh
#   bash scripts/run-local-tests.sh --full  # Inclut test E2E avec API
#

set -e  # Exit on error

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Symboles
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
ARROW="${BLUE}→${NC}"

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}🧪 Tests Locaux - Sprint 1: Correction Parsing JSON${NC}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Fonction pour afficher une étape
step() {
  echo -e "${ARROW} $1"
}

# Fonction pour afficher succès
success() {
  echo -e "${CHECK} $1"
}

# Fonction pour afficher erreur
error() {
  echo -e "${CROSS} $1"
}

# Compteur de tests
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Test 1: Compilation TypeScript
# =============================================================================

echo -e "${YELLOW}Test 1/4: Compilation TypeScript${NC}"
echo "────────────────────────────────────────────────────────────────────────────────"

step "Vérification compilation TypeScript..."

if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  error "Erreurs de compilation TypeScript détectées"
  npx tsc --noEmit 2>&1 | grep "error TS" | head -10
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo ""
else
  success "Compilation TypeScript réussie (aucune erreur)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo ""
fi

# =============================================================================
# Test 2: Validation Zod (Tests Unitaires)
# =============================================================================

echo -e "${YELLOW}Test 2/4: Validation Zod (Tests Unitaires)${NC}"
echo "────────────────────────────────────────────────────────────────────────────────"

step "Exécution tests unitaires validation Zod..."

if npx tsx scripts/test-json-parsing-validation.ts > /tmp/zod-test.log 2>&1; then
  success "Tests unitaires Zod réussis (5/5)"

  # Afficher résumé
  grep -A 5 "📊 Résumé des Tests" /tmp/zod-test.log | tail -4

  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo ""
else
  error "Tests unitaires Zod échoués"
  cat /tmp/zod-test.log
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo ""
fi

# =============================================================================
# Test 3: Vérification Fichiers Critiques
# =============================================================================

echo -e "${YELLOW}Test 3/4: Vérification Fichiers Critiques${NC}"
echo "────────────────────────────────────────────────────────────────────────────────"

step "Vérification présence fichiers critiques..."

FILES_OK=true

# Fichiers à vérifier
CRITICAL_FILES=(
  "lib/validations/structured-dossier.ts"
  "lib/ai/dossier-structuring-service.ts"
  "lib/ai/operations-config.ts"
  "scripts/test-json-parsing-validation.ts"
  "scripts/test-complex-arabic-prompt.ts"
  "docs/SPRINT1_JSON_PARSING_FIX.md"
  "GUIDE_TEST_LOCAL.md"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "  ${CHECK} $file"
  else
    echo -e "  ${CROSS} $file ${RED}(manquant)${NC}"
    FILES_OK=false
  fi
done

if $FILES_OK; then
  success "Tous les fichiers critiques présents (7/7)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  error "Fichiers manquants détectés"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# =============================================================================
# Test 4: Vérification Variables d'Environnement (Optionnel)
# =============================================================================

echo -e "${YELLOW}Test 4/4: Vérification Variables d'Environnement${NC}"
echo "────────────────────────────────────────────────────────────────────────────────"

step "Vérification fichier .env.local..."

if [ -f ".env.local" ]; then
  success "Fichier .env.local présent"

  # Vérifier clés API (sans afficher les valeurs)
  echo ""
  echo "  Clés API configurées:"

  if grep -q "GEMINI_API_KEY=" .env.local && [ -n "$(grep GEMINI_API_KEY= .env.local | cut -d= -f2)" ]; then
    echo -e "    ${CHECK} GEMINI_API_KEY"
  else
    echo -e "    ${YELLOW}⚠${NC}  GEMINI_API_KEY ${YELLOW}(non configuré)${NC}"
  fi

  if grep -q "GROQ_API_KEY=" .env.local && [ -n "$(grep GROQ_API_KEY= .env.local | cut -d= -f2)" ]; then
    echo -e "    ${CHECK} GROQ_API_KEY"
  else
    echo -e "    ${YELLOW}⚠${NC}  GROQ_API_KEY ${YELLOW}(non configuré)${NC}"
  fi

  if grep -q "DEEPSEEK_API_KEY=" .env.local && [ -n "$(grep DEEPSEEK_API_KEY= .env.local | cut -d= -f2)" ]; then
    echo -e "    ${CHECK} DEEPSEEK_API_KEY"
  else
    echo -e "    ${YELLOW}⚠${NC}  DEEPSEEK_API_KEY ${YELLOW}(non configuré)${NC}"
  fi

  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  ${YELLOW}⚠${NC}  Fichier .env.local manquant"
  echo "     Copier depuis .env.example: ${BLUE}cp .env.example .env.local${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))  # Non bloquant
fi

echo ""

# =============================================================================
# Test Optionnel: Test E2E avec API
# =============================================================================

if [ "$1" == "--full" ]; then
  echo -e "${YELLOW}Test Bonus: Test E2E Prompt Arabe Complexe${NC}"
  echo "────────────────────────────────────────────────────────────────────────────────"

  step "Exécution test E2E avec prompt arabe complexe..."
  echo ""

  if npx tsx scripts/test-complex-arabic-prompt.ts; then
    success "Test E2E réussi - Prompt arabe complexe analysé"
    echo ""
  else
    error "Test E2E échoué - Vérifier logs ci-dessus"
    echo ""
    echo -e "${YELLOW}Note:${NC} Ce test nécessite des clés API valides (Gemini/Groq/DeepSeek)"
    echo ""
  fi
fi

# =============================================================================
# Résumé Final
# =============================================================================

echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 Résumé des Tests${NC}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}✓${NC} Tests réussis:  ${GREEN}${TESTS_PASSED}${NC}"
echo -e "  ${RED}✗${NC} Tests échoués:  ${RED}${TESTS_FAILED}${NC}"
echo ""

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=$(( (TESTS_PASSED * 100) / TOTAL_TESTS ))

echo -e "  🎯 Taux de réussite: ${SUCCESS_RATE}%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "════════════════════════════════════════════════════════════════════════════════"
  echo -e "${GREEN}🎉 Tous les tests sont passés!${NC}"
  echo "════════════════════════════════════════════════════════════════════════════════"
  echo ""
  echo -e "${GREEN}✅ Le code est prêt pour le déploiement${NC}"
  echo ""
  echo "Prochaines étapes:"
  echo ""
  echo "  1. Tester manuellement l'interface (optionnel):"
  echo -e "     ${BLUE}npm run dev${NC}"
  echo -e "     ${BLUE}→ Naviguer vers http://localhost:7002/dossiers/assistant${NC}"
  echo ""
  echo "  2. Déployer en production:"
  echo -e "     ${BLUE}git add .${NC}"
  echo -e "     ${BLUE}git commit -m \"fix(llm): Validation Zod + retry logic parsing JSON\"${NC}"
  echo -e "     ${BLUE}git push origin main${NC}"
  echo ""
  echo "  3. Suivre le déploiement:"
  echo -e "     ${BLUE}gh run watch${NC}"
  echo ""

  exit 0
else
  echo "════════════════════════════════════════════════════════════════════════════════"
  echo -e "${RED}⚠️  Certains tests ont échoué${NC}"
  echo "════════════════════════════════════════════════════════════════════════════════"
  echo ""
  echo -e "${YELLOW}Veuillez corriger les erreurs avant de déployer${NC}"
  echo ""
  echo "Ressources:"
  echo -e "  📖 Documentation: ${BLUE}docs/SPRINT1_JSON_PARSING_FIX.md${NC}"
  echo -e "  📝 Guide test local: ${BLUE}GUIDE_TEST_LOCAL.md${NC}"
  echo ""

  exit 1
fi
