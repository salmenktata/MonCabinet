#!/bin/bash
set -euo pipefail

# =============================================================================
# Vérification Complète Clés API Production
#
# Teste:
#   - Existence et permissions fichiers .env
#   - Déchiffrement DB ↔ .env
#   - Fonctionnalité réelle de chaque provider (appels API)
#   - Cascade fallback opérationnelle
#   - Génère rapport Markdown avec recommandations
#
# Usage:
#   bash scripts/verify-api-keys-prod.sh
#
# Variables environnement requises:
#   VPS_HOST       - IP/hostname VPS (défaut: 84.247.165.187)
#   ADMIN_SECRET   - Secret pour API /admin/api-keys/health
# =============================================================================

# Variables
VPS_HOST="${VPS_HOST:-84.247.165.187}"
RESULTS_FILE="/tmp/api-keys-verification-$(date +%s).json"

# Couleurs pour output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# FONCTIONS UTILITAIRES
# =============================================================================

print_header() {
  echo ""
  echo "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
  echo "┃ Vérification Clés API Production         ┃"
  echo "┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫"
  echo ""
}

print_phase() {
  local phase=$1
  local description=$2
  echo ""
  echo -e "${BLUE}Phase $phase:${NC} $description"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

print_success() {
  echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠️ ${NC} $1"
}

print_error() {
  echo -e "${RED}❌${NC} $1"
}

# =============================================================================
# PHASE 1 : VÉRIFICATION FICHIERS VPS
# =============================================================================

check_vps_env_file() {
  print_phase "1/5" "Vérification fichiers .env sur VPS"

  local env_file="/opt/qadhya/.env.production.local"

  # Vérifier existence
  if ssh root@$VPS_HOST "test -f $env_file" 2>/dev/null; then
    print_success "Fichier .env.production.local existe"
  else
    print_error "Fichier .env.production.local introuvable"
    echo ""
    echo "Action requise:"
    echo "  1. SSH: ssh root@$VPS_HOST"
    echo "  2. Vérifier: ls -la /opt/qadhya/.env*"
    echo ""
    exit 1
  fi

  # Vérifier permissions
  local perms=$(ssh root@$VPS_HOST "stat -c %a $env_file" 2>/dev/null || echo "000")
  if [ "$perms" == "600" ]; then
    print_success "Permissions 600 validées (sécurité OK)"
  else
    print_warning "Permissions $perms (attendu: 600)"
    echo "  Action: ssh root@$VPS_HOST \"chmod 600 $env_file\""
  fi

  # Compter variables définies
  local var_count=$(ssh root@$VPS_HOST "grep -c '^[A-Z].*=' $env_file 2>/dev/null" || echo "0")
  print_success "$var_count variables définies dans .env"

  echo ""
}

# =============================================================================
# PHASE 2 : TEST DÉCHIFFREMENT
# =============================================================================

check_decryption() {
  print_phase "2/5" "Test déchiffrement DB ↔ .env"

  if [ -z "${ADMIN_SECRET:-}" ]; then
    print_warning "ADMIN_SECRET non défini, skip test API health check"
    echo "  Définir: export ADMIN_SECRET=<secret>"
    echo ""
    return
  fi

  # Appeler API health check
  local health_file="/tmp/health-check-$(date +%s).json"

  if curl -s -H "X-Admin-Secret: ${ADMIN_SECRET}" \
       https://qadhya.tn/api/admin/api-keys/health > "$health_file" 2>/dev/null; then

    if jq -e '.success' "$health_file" >/dev/null 2>&1; then
      local keys_count=$(jq -r '.keys_count // 0' "$health_file")
      print_success "$keys_count/6 clés déchiffrables"
    else
      print_error "Échec déchiffrement"
      echo "  Détails: cat $health_file"
    fi
  else
    print_warning "API health check inaccessible (vérifier ADMIN_SECRET)"
  fi

  rm -f "$health_file" 2>/dev/null || true
  echo ""
}

# =============================================================================
# PHASE 3 : TEST FONCTIONNEL
# =============================================================================

test_functional() {
  print_phase "3/5" "Test fonctionnel providers (appels API réels)"

  # Exécuter script Node.js
  if npx tsx scripts/test-api-keys-functional.ts --output="$RESULTS_FILE"; then
    print_success "Tests fonctionnels réussis"
  else
    print_error "Échec tests fonctionnels"
    echo "  Voir détails: cat $RESULTS_FILE"
  fi

  echo ""
}

# =============================================================================
# PHASE 4 : TEST CASCADE FALLBACK
# =============================================================================

test_cascade() {
  print_phase "4/5" "Test cascade fallback (Gemini → DeepSeek → ...)"

  # Exécuter script Node.js
  if npx tsx scripts/test-llm-fallback-cascade.ts; then
    print_success "Cascade fallback validée"
  else
    print_error "Cascade fallback non opérationnelle"
    echo "  Action: Vérifier logs ci-dessus"
  fi

  echo ""
}

# =============================================================================
# PHASE 5 : GÉNÉRATION RAPPORT
# =============================================================================

generate_report() {
  print_phase "5/5" "Génération rapport Markdown"

  if [ ! -f "$RESULTS_FILE" ]; then
    print_warning "Fichier résultats introuvable, skip rapport"
    echo "  Attendu: $RESULTS_FILE"
    echo ""
    return
  fi

  # Exécuter script Node.js
  if npx tsx scripts/generate-api-keys-report.ts --input="$RESULTS_FILE"; then
    print_success "Rapport généré avec succès"
  else
    print_warning "Génération rapport échouée (voir logs)"
  fi

  echo ""
}

# =============================================================================
# FOOTER
# =============================================================================

print_footer() {
  echo "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛"
  echo ""
  echo "📊 Résultats détaillés disponibles dans:"
  echo "   - Tests fonctionnels: $RESULTS_FILE"
  echo "   - Rapport Markdown: /tmp/api-keys-report-*.md"
  echo ""
  echo "📚 Documentation:"
  echo "   - docs/API_KEYS_MANAGEMENT.md"
  echo "   - docs/CRON_MONITORING.md"
  echo ""
}

# =============================================================================
# ORCHESTRATION PRINCIPALE
# =============================================================================

main() {
  print_header

  # Phase 1: Vérification fichiers VPS
  check_vps_env_file

  # Phase 2: Test déchiffrement
  check_decryption

  # Phase 3: Test fonctionnel
  test_functional

  # Phase 4: Test cascade
  test_cascade

  # Phase 5: Génération rapport
  generate_report

  # Footer
  print_footer
}

# Exécution
main "$@"
