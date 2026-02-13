#!/bin/bash
# =====================================================
# Cron Logger Library
# Utilitaires pour tracker l'exécution des crons
# =====================================================

# Variables globales
CRON_EXECUTION_ID=""
CRON_NAME=""
CRON_START_TIME=""
CRON_API_BASE="${CRON_API_BASE:-http://localhost:7002}"
CRON_SECRET="${CRON_SECRET:-}"

# Couleurs pour logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =====================================================
# Fonction: cron_start
# Déclare le démarrage d'un cron
# Usage: cron_start "monitor-openai" "manual"
# =====================================================
cron_start() {
  CRON_NAME="$1"
  local trigger_type="${2:-scheduled}"
  CRON_START_TIME=$(date +%s%3N) # milliseconds

  if [ -z "$CRON_NAME" ]; then
    echo -e "${RED}[CRON ERROR] cron_start: cron_name is required${NC}" >&2
    return 1
  fi

  if [ -z "$CRON_SECRET" ]; then
    echo -e "${YELLOW}[CRON WARN] CRON_SECRET not set, skipping API call${NC}" >&2
    return 0
  fi

  # Appel API start
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$CRON_API_BASE/api/admin/cron-executions/start" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "{\"cronName\":\"$CRON_NAME\",\"triggerType\":\"$trigger_type\"}")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    echo -e "${RED}[CRON ERROR] Failed to start execution (HTTP $http_code)${NC}" >&2
    echo "$body" >&2
    return 1
  fi

  # Extraire executionId du JSON
  CRON_EXECUTION_ID=$(echo "$body" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$CRON_EXECUTION_ID" ]; then
    echo -e "${RED}[CRON ERROR] Failed to parse executionId from response${NC}" >&2
    return 1
  fi

  echo -e "${GREEN}[CRON START] $CRON_NAME (execution: $CRON_EXECUTION_ID)${NC}"
  return 0
}

# =====================================================
# Fonction: cron_complete
# Déclare la fin réussie d'un cron
# Usage: cron_complete '{"processed": 50, "errors": 0}'
# =====================================================
cron_complete() {
  local output_json="${1:-{}}"
  local end_time=$(date +%s%3N)
  local duration_ms=$((end_time - CRON_START_TIME))

  if [ -z "$CRON_EXECUTION_ID" ]; then
    echo -e "${YELLOW}[CRON WARN] No execution ID, skipping complete call${NC}" >&2
    return 0
  fi

  if [ -z "$CRON_SECRET" ]; then
    echo -e "${YELLOW}[CRON WARN] CRON_SECRET not set, skipping API call${NC}" >&2
    return 0
  fi

  # Construire payload JSON
  local payload
  payload=$(cat <<EOF
{
  "executionId": "$CRON_EXECUTION_ID",
  "status": "completed",
  "durationMs": $duration_ms,
  "output": $output_json,
  "exitCode": 0
}
EOF
)

  # Appel API complete
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$CRON_API_BASE/api/admin/cron-executions/complete" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "$payload")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    echo -e "${RED}[CRON ERROR] Failed to complete execution (HTTP $http_code)${NC}" >&2
    echo "$body" >&2
    return 1
  fi

  echo -e "${GREEN}[CRON COMPLETE] $CRON_NAME (${duration_ms}ms)${NC}"
  return 0
}

# =====================================================
# Fonction: cron_fail
# Déclare l'échec d'un cron
# Usage: cron_fail "Error message" 1
# =====================================================
cron_fail() {
  local error_message="${1:-Unknown error}"
  local exit_code="${2:-1}"
  local end_time=$(date +%s%3N)
  local duration_ms=$((end_time - CRON_START_TIME))

  if [ -z "$CRON_EXECUTION_ID" ]; then
    echo -e "${YELLOW}[CRON WARN] No execution ID, skipping fail call${NC}" >&2
    return 0
  fi

  if [ -z "$CRON_SECRET" ]; then
    echo -e "${YELLOW}[CRON WARN] CRON_SECRET not set, skipping API call${NC}" >&2
    return 0
  fi

  # Échapper les guillemets dans error_message
  error_message=$(echo "$error_message" | sed 's/"/\\"/g')

  # Construire payload JSON
  local payload
  payload=$(cat <<EOF
{
  "executionId": "$CRON_EXECUTION_ID",
  "status": "failed",
  "durationMs": $duration_ms,
  "errorMessage": "$error_message",
  "exitCode": $exit_code
}
EOF
)

  # Appel API complete
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$CRON_API_BASE/api/admin/cron-executions/complete" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -d "$payload")

  local http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" != "200" ]; then
    echo -e "${RED}[CRON ERROR] Failed to record failure (HTTP $http_code)${NC}" >&2
  fi

  echo -e "${RED}[CRON FAIL] $CRON_NAME: $error_message (exit $exit_code, ${duration_ms}ms)${NC}" >&2
  return 0
}

# =====================================================
# Fonction: cron_wrap
# Wrapper intelligent qui gère start/complete/fail automatiquement
# Usage: cron_wrap "monitor-openai" "scheduled" my_function arg1 arg2
# =====================================================
cron_wrap() {
  local cron_name="$1"
  local trigger_type="${2:-scheduled}"
  shift 2

  # Start
  if ! cron_start "$cron_name" "$trigger_type"; then
    echo -e "${RED}[CRON WRAP] Failed to start, aborting${NC}" >&2
    return 1
  fi

  # Trap pour gérer les erreurs
  trap 'cron_fail "Script terminated unexpectedly" $?' EXIT

  # Exécuter la commande
  local output
  local exit_code
  if output=$("$@" 2>&1); then
    exit_code=0
  else
    exit_code=$?
  fi

  # Cleanup trap
  trap - EXIT

  # Complete ou Fail
  if [ $exit_code -eq 0 ]; then
    # Essayer de parser output comme JSON, sinon wrapper
    if echo "$output" | jq . > /dev/null 2>&1; then
      cron_complete "$output"
    else
      local safe_output=$(echo "$output" | head -c 1000 | sed 's/"/\\"/g' | tr '\n' ' ')
      cron_complete "{\"output\":\"$safe_output\"}"
    fi
  else
    local error_msg=$(echo "$output" | tail -n 10 | sed 's/"/\\"/g' | tr '\n' ' ')
    cron_fail "$error_msg" $exit_code
  fi

  return $exit_code
}

# =====================================================
# Export functions pour usage dans autres scripts
# =====================================================
export -f cron_start
export -f cron_complete
export -f cron_fail
export -f cron_wrap
