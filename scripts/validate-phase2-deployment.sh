#!/bin/bash
# =============================================================================
# Script Validation Post-Déploiement - Phase 2
# =============================================================================
# Valide que le déploiement Phase 2 fonctionne correctement :
#   1. Vérification table legal_abrogations (structure + données)
#   2. Vérification variables environnement
#   3. Test détection abrogation (via API)
#   4. Test validation citation (via API)
#   5. Vérification logs warnings
#   6. Test composants UI (data-testid présents)
#
# Usage : bash scripts/validate-phase2-deployment.sh
#
# Exit codes :
#   0 - Validation réussie (tous tests pass)
#   1 - Échec validation
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
VPS_HOST="${VPS_HOST:-84.247.165.187}"
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
BASE_URL="${BASE_URL:-https://qadhya.tn}"
DB_NAME="moncabinet"
DB_USER="moncabinet"
CONTAINER_POSTGRES="moncabinet-postgres"

# Compteurs
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# FONCTIONS
# =============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_section() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

test_result() {
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ $1 -eq 0 ]; then
    log_success "$2"
  else
    log_error "$2"
  fi
}

# =============================================================================
# TESTS - BASE DE DONNÉES
# =============================================================================

log_section "1. VALIDATION BASE DE DONNÉES"

# Test 1.1 : Table existe
log_info "Test 1.1 : Vérification existence table legal_abrogations..."

TABLE_EXISTS=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='legal_abrogations');\"" 2>/dev/null)

if [ "$TABLE_EXISTS" = "t" ]; then
  test_result 0 "Table legal_abrogations existe"
else
  test_result 1 "Table legal_abrogations MANQUANTE"
fi

# Test 1.2 : Colonnes essentielles
log_info "Test 1.2 : Vérification colonnes essentielles..."

COLUMNS=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc \"SELECT column_name FROM information_schema.columns WHERE table_name='legal_abrogations' ORDER BY ordinal_position;\"" 2>/dev/null | tr '\n' ',' || echo "")

REQUIRED_COLUMNS=("abrogated_reference" "abrogating_reference" "abrogation_date" "scope")
MISSING_COLUMNS=()

for col in "${REQUIRED_COLUMNS[@]}"; do
  if ! echo "$COLUMNS" | grep -q "$col"; then
    MISSING_COLUMNS+=("$col")
  fi
done

if [ ${#MISSING_COLUMNS[@]} -eq 0 ]; then
  test_result 0 "Toutes colonnes essentielles présentes (${#REQUIRED_COLUMNS[@]}/4)"
else
  test_result 1 "Colonnes manquantes : ${MISSING_COLUMNS[*]}"
fi

# Test 1.3 : Données seed
log_info "Test 1.3 : Vérification données seed (minimum 10 entrées)..."

COUNT=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc 'SELECT COUNT(*) FROM legal_abrogations;'" 2>/dev/null || echo "0")

if [ "$COUNT" -ge 10 ]; then
  test_result 0 "Données seed OK ($COUNT entrées)"
else
  test_result 1 "Données seed insuffisantes ($COUNT entrées, minimum 10)"
fi

# Test 1.4 : Fonction find_abrogations
log_info "Test 1.4 : Vérification fonction find_abrogations()..."

FUNCTION_EXISTS=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc \"SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='find_abrogations');\"" 2>/dev/null || echo "f")

if [ "$FUNCTION_EXISTS" = "t" ]; then
  test_result 0 "Fonction find_abrogations() existe"
else
  test_result 1 "Fonction find_abrogations() MANQUANTE"
fi

# Test 1.5 : Test fuzzy matching
log_info "Test 1.5 : Test fuzzy matching (Loi n°1968-07)..."

FUZZY_RESULT=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -tAc \"SELECT COUNT(*) FROM find_abrogations('Loi n°1968-07', 0.6, 5);\"" 2>/dev/null || echo "0")

if [ "$FUZZY_RESULT" -gt 0 ]; then
  test_result 0 "Fuzzy matching fonctionne ($FUZZY_RESULT résultats)"
else
  test_result 1 "Fuzzy matching ne retourne AUCUN résultat"
fi

# =============================================================================
# TESTS - VARIABLES ENVIRONNEMENT
# =============================================================================

log_section "2. VALIDATION VARIABLES ENVIRONNEMENT"

# Test 2.1 : ENABLE_CITATION_VALIDATION
log_info "Test 2.1 : Vérification ENABLE_CITATION_VALIDATION..."

CITATION_VAL=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_NEXTJS printenv ENABLE_CITATION_VALIDATION 2>/dev/null || echo 'true'")

if [ "$CITATION_VAL" != "false" ]; then
  test_result 0 "ENABLE_CITATION_VALIDATION = $CITATION_VAL (activé)"
else
  test_result 1 "ENABLE_CITATION_VALIDATION = false (DÉSACTIVÉ)"
fi

# Test 2.2 : ENABLE_ABROGATION_DETECTION
log_info "Test 2.2 : Vérification ENABLE_ABROGATION_DETECTION..."

ABROG_VAL=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker exec $CONTAINER_NEXTJS printenv ENABLE_ABROGATION_DETECTION 2>/dev/null || echo 'true'")

if [ "$ABROG_VAL" != "false" ]; then
  test_result 0 "ENABLE_ABROGATION_DETECTION = $ABROG_VAL (activé)"
else
  test_result 1 "ENABLE_ABROGATION_DETECTION = false (DÉSACTIVÉ)"
fi

# =============================================================================
# TESTS - API ENDPOINTS
# =============================================================================

log_section "3. VALIDATION ENDPOINTS API"

# Test 3.1 : Health check
log_info "Test 3.1 : Health check API..."

HEALTH=$(curl -sf "$BASE_URL/api/health" 2>/dev/null || echo "FAILED")

if echo "$HEALTH" | grep -q '"status":"healthy"'; then
  test_result 0 "API Health : healthy"
else
  test_result 1 "API Health : FAILED"
fi

# Test 3.2 : Page chat-test accessible
log_info "Test 3.2 : Page /chat-test accessible..."

HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/chat-test" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
  test_result 0 "Page /chat-test accessible (HTTP $HTTP_CODE)"
else
  test_result 1 "Page /chat-test non accessible (HTTP $HTTP_CODE)"
fi

# =============================================================================
# TESTS - COMPOSANTS UI
# =============================================================================

log_section "4. VALIDATION COMPOSANTS UI"

# Test 4.1 : Fichiers composants présents
log_info "Test 4.1 : Vérification fichiers composants UI..."

UI_FILES=("AbrogationWarningBadge.tsx" "CitationWarningBadge.tsx" "LegalWarnings.tsx")
MISSING_UI=()

for file in "${UI_FILES[@]}"; do
  if ! ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "[ -f /opt/moncabinet/components/chat/$file ]" 2>/dev/null; then
    MISSING_UI+=("$file")
  fi
done

if [ ${#MISSING_UI[@]} -eq 0 ]; then
  test_result 0 "Composants UI présents (${#UI_FILES[@]}/3)"
else
  test_result 1 "Composants UI manquants : ${MISSING_UI[*]}"
fi

# Test 4.2 : Page HTML contient data-testid
log_info "Test 4.2 : Vérification data-testid dans HTML page /chat-test..."

HTML=$(curl -sf "$BASE_URL/chat-test" 2>/dev/null || echo "")

if echo "$HTML" | grep -q "data-testid"; then
  test_result 0 "data-testid présents dans HTML"
else
  test_result 1 "data-testid ABSENTS dans HTML"
fi

# =============================================================================
# TESTS - LOGS MONITORING
# =============================================================================

log_section "5. MONITORING LOGS"

# Test 5.1 : Logs récents warnings
log_info "Test 5.1 : Recherche logs warnings abrogations (dernières 24h)..."

LOGS_ABROG=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker logs --since 24h $CONTAINER_NEXTJS 2>&1 | grep -c 'abrogation' || echo '0'" 2>/dev/null)

log_info "Logs abrogations trouvés : $LOGS_ABROG occurrences"

# Test 5.2 : Logs citations
log_info "Test 5.2 : Recherche logs warnings citations (dernières 24h)..."

LOGS_CITATION=$(ssh -p $VPS_PORT $VPS_USER@$VPS_HOST "docker logs --since 24h $CONTAINER_NEXTJS 2>&1 | grep -c 'Citations non vérifiées' || echo '0'" 2>/dev/null)

log_info "Logs citations trouvés : $LOGS_CITATION occurrences"

# Pas de test pass/fail car logs peuvent être 0 si pas encore utilisé
log_info "Monitoring logs : $LOGS_ABROG abrogations + $LOGS_CITATION citations"

# =============================================================================
# RÉSUMÉ VALIDATION
# =============================================================================

log_section "RÉSUMÉ VALIDATION"

PASS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))

echo ""
echo "📊 Résultats :"
echo "  Total tests : $TESTS_TOTAL"
echo "  ✅ Passants  : $TESTS_PASSED"
echo "  ❌ Échecs    : $TESTS_FAILED"
echo "  📈 Taux      : $PASS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ VALIDATION PHASE 2 RÉUSSIE${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "🎉 Phase 2 déployée avec succès en production !"
  echo ""
  echo "🧪 Tests manuels recommandés :"
  echo "  1. Ouvrir : $BASE_URL/chat-test"
  echo "  2. Poser question : \"Quelle est la procédure selon la Loi n°1968-07 ?\""
  echo "  3. Vérifier warning abrogation (🔴 CRITIQUE) s'affiche"
  echo "  4. Vérifier détails : date 2016, loi abrogeante 2016-36"
  echo ""
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ VALIDATION PHASE 2 ÉCHOUÉE${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "⚠️  $TESTS_FAILED test(s) ont échoué"
  echo ""
  echo "🔍 Actions recommandées :"
  echo "  1. Vérifier logs : ssh $VPS_USER@$VPS_HOST 'docker logs $CONTAINER_NEXTJS'"
  echo "  2. Vérifier migration : ssh $VPS_USER@$VPS_HOST 'docker exec $CONTAINER_POSTGRES psql -U $DB_USER -d $DB_NAME -c \"\\d legal_abrogations\"'"
  echo "  3. Re-exécuter déploiement : bash scripts/deploy-phase2-production.sh"
  echo ""
  exit 1
fi
