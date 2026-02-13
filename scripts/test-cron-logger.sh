#!/bin/bash
# Script de test pour la library cron-logger
# Usage: ./scripts/test-cron-logger.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Configuration pour dev local
export CRON_API_BASE="http://localhost:7002"
export CRON_SECRET="${CRON_SECRET:-test-secret}"

echo "=========================================="
echo "Test Cron Logger Library"
echo "=========================================="
echo ""

# Test 1: Success flow
echo "Test 1: Success flow"
echo "---------------------"
cron_start "test-cron" "manual"
sleep 1
cron_complete '{"processed": 10, "errors": 0}'
echo ""

# Test 2: Failure flow
echo "Test 2: Failure flow"
echo "---------------------"
cron_start "test-cron-fail" "manual"
sleep 1
cron_fail "Simulated error for testing" 1
echo ""

# Test 3: Wrap success
echo "Test 3: Wrap function (success)"
echo "--------------------------------"
test_success() {
  echo "Processing data..."
  sleep 1
  echo '{"status": "ok", "items": 42}'
}
cron_wrap "test-wrap-success" "manual" test_success
echo ""

# Test 4: Wrap failure
echo "Test 4: Wrap function (failure)"
echo "--------------------------------"
test_failure() {
  echo "Starting process..."
  sleep 1
  echo "Error occurred!" >&2
  return 1
}
cron_wrap "test-wrap-failure" "manual" test_failure || echo "Failure handled correctly"
echo ""

echo "=========================================="
echo "✅ Tests terminés"
echo "=========================================="
echo ""
echo "Vérifiez les exécutions dans:"
echo "  - Dashboard: http://localhost:7002/super-admin/monitoring?tab=crons"
echo "  - API: curl http://localhost:7002/api/admin/cron-executions/list"
