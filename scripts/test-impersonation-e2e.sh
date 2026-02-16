#!/bin/bash

# Script de test E2E pour le système d'impersonnalisation
# Date : 2026-02-16

set -e

echo "========================================"
echo "Tests E2E - Système d'Impersonnalisation"
echo "========================================"
echo ""

PASSED=0
FAILED=0

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction de test
test_case() {
  local name=$1
  local command=$2
  local expected=$3

  echo -n "Test: $name... "

  if result=$(eval "$command" 2>&1); then
    if [[ "$result" == *"$expected"* ]] || [[ -z "$expected" ]]; then
      echo -e "${GREEN}✓ PASS${NC}"
      ((PASSED++))
      return 0
    else
      echo -e "${RED}✗ FAIL${NC}"
      echo "  Expected: $expected"
      echo "  Got: $result"
      ((FAILED++))
      return 1
    fi
  else
    echo -e "${RED}✗ ERROR${NC}"
    echo "  $result"
    ((FAILED++))
    return 1
  fi
}

# Test 1: Health Check
echo -e "${YELLOW}[1/8] Tests Santé Système${NC}"
test_case "API Health Check" \
  "curl -s https://qadhya.tn/api/health | jq -r '.status'" \
  "healthy"

test_case "RAG Status" \
  "curl -s https://qadhya.tn/api/health | jq -r '.rag.status'" \
  "ok"

echo ""

# Test 2: Database Tables
echo -e "${YELLOW}[2/8] Tests Base de Données${NC}"
test_case "Table active_impersonations existe" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\dt active_impersonations\" 2>&1'" \
  "active_impersonations"

test_case "Colonnes audit logs is_impersonation" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\d admin_audit_logs\" 2>&1'" \
  "is_impersonation"

test_case "Colonnes audit logs impersonated_user_id" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\d admin_audit_logs\" 2>&1'" \
  "impersonated_user_id"

echo ""

# Test 3: API Routes Compilées
echo -e "${YELLOW}[3/8] Tests Routes API${NC}"
test_case "Route /api/super-admin/impersonations/active compilée" \
  "ssh root@84.247.165.187 'docker exec qadhya-nextjs ls /app/.next/server/app/api/super-admin/impersonations/active/route.js 2>&1'" \
  "route.js"

test_case "Route /api/admin/alerts/check-impersonations compilée" \
  "ssh root@84.247.165.187 'docker exec qadhya-nextjs ls /app/.next/server/app/api/admin/alerts/check-impersonations/route.js 2>&1'" \
  "route.js"

echo ""

# Test 4: Cron Configuration
echo -e "${YELLOW}[4/8] Tests Cron${NC}"
test_case "Script cron-check-impersonations existe" \
  "ssh root@84.247.165.187 'ls /opt/qadhya/scripts/cron-check-impersonations.sh 2>&1'" \
  "cron-check-impersonations.sh"

test_case "Script cron est exécutable" \
  "ssh root@84.247.165.187 'test -x /opt/qadhya/scripts/cron-check-impersonations.sh && echo \"executable\"'" \
  "executable"

test_case "Cron configuré dans crontab" \
  "ssh root@84.247.165.187 'crontab -l | grep impersonation'" \
  "cron-check-impersonations"

echo ""

# Test 5: Script Cron Exécution
echo -e "${YELLOW}[5/8] Test Exécution Cron${NC}"
test_case "Exécution manuelle du cron" \
  "ssh root@84.247.165.187 'bash /opt/qadhya/scripts/cron-check-impersonations.sh 2>&1'" \
  "Aucune impersonation longue"

echo ""

# Test 6: Index Database
echo -e "${YELLOW}[6/8] Tests Index DB${NC}"
test_case "Index idx_audit_logs_impersonation existe" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\di idx_audit_logs_impersonation\" 2>&1'" \
  "idx_audit_logs_impersonation"

test_case "Index idx_active_impersonations_active existe" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\di idx_active_impersonations_active\" 2>&1'" \
  "idx_active_impersonations_active"

echo ""

# Test 7: Foreign Keys
echo -e "${YELLOW}[7/8] Tests Contraintes${NC}"
test_case "Foreign key admin_id sur active_impersonations" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\d active_impersonations\" 2>&1'" \
  "admin_id_fkey"

test_case "Foreign key target_user_id sur active_impersonations" \
  "ssh root@84.247.165.187 'docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"\\d active_impersonations\" 2>&1'" \
  "target_user_id_fkey"

echo ""

# Test 8: Logs Directory
echo -e "${YELLOW}[8/8] Tests Logs${NC}"
test_case "Dossier logs existe" \
  "ssh root@84.247.165.187 'test -d /var/log/qadhya && echo \"exists\"'" \
  "exists"

test_case "Fichier log impersonation créé ou créable" \
  "ssh root@84.247.165.187 'test -f /var/log/qadhya/impersonation-checks.log || touch /var/log/qadhya/impersonation-checks.log && echo \"ok\"'" \
  "ok"

echo ""
echo "========================================"
echo -e "${GREEN}Tests Passés: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Tests Échoués: $FAILED${NC}"
else
  echo -e "${GREEN}Tests Échoués: 0${NC}"
fi
echo "========================================"
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Certains tests ont échoué${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Tous les tests sont passés !${NC}"
  echo ""
  echo "Prochaines étapes :"
  echo "  1. Tester manuellement le dashboard : https://qadhya.tn/super-admin/monitoring?tab=impersonations"
  echo "  2. Tester le dialog de confirmation d'impersonation"
  echo "  3. Vérifier les audit logs : https://qadhya.tn/super-admin/audit-logs"
  exit 0
fi
