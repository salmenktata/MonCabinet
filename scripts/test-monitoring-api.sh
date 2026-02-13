#!/bin/bash

# Script de test API Monitoring après déploiement
# Vérifie que l'API production-monitoring/metrics fonctionne

echo "🧪 Test API Monitoring Production"
echo "=================================="
echo ""

# Test 1: API Metrics
echo "1️⃣ Test /api/admin/production-monitoring/metrics"
METRICS_RESPONSE=$(curl -s https://qadhya.tn/api/admin/production-monitoring/metrics?range=24h)
METRICS_ERROR=$(echo "$METRICS_RESPONSE" | jq -r '.error // "null"')

if [ "$METRICS_ERROR" == "null" ]; then
  QUERIES_PER_HOUR=$(echo "$METRICS_RESPONSE" | jq -r '.metrics.queriesPerHour // "N/A"')
  ACTIVE_USERS=$(echo "$METRICS_RESPONSE" | jq -r '.metrics.activeUsers // "N/A"')
  echo "   ✅ API fonctionnelle"
  echo "   📊 Queries/heure: $QUERIES_PER_HOUR"
  echo "   👥 Utilisateurs actifs: $ACTIVE_USERS"
else
  echo "   ❌ Erreur: $METRICS_ERROR"
  exit 1
fi

echo ""

# Test 2: API TimeSeries
echo "2️⃣ Test /api/admin/production-monitoring/timeseries"
TIMESERIES_RESPONSE=$(curl -s https://qadhya.tn/api/admin/production-monitoring/timeseries?range=24h)
TIMESERIES_ERROR=$(echo "$TIMESERIES_RESPONSE" | jq -r '.error // "null"')

if [ "$TIMESERIES_ERROR" == "null" ]; then
  DATA_POINTS=$(echo "$TIMESERIES_RESPONSE" | jq -r '.data | length')
  echo "   ✅ API fonctionnelle"
  echo "   📈 Points de données: $DATA_POINTS"
else
  echo "   ❌ Erreur: $TIMESERIES_ERROR"
  exit 1
fi

echo ""
echo "✅ Tous les tests passés !"
echo ""
echo "🌐 Dashboard: https://qadhya.tn/super-admin/monitoring?tab=overview"
