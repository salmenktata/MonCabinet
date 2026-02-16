#!/bin/bash
# Diagnostic RAG Complet - Automatisé
# Identifie précisément le blocage "لم أجد وثائق ذات صلة"

set -euo pipefail

SERVER="root@84.247.165.187"
QUERY_SIMPLE="الدفاع الشرعي"
QUERY_COMPLEX="وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا"

echo "🔬 DIAGNOSTIC RAG COMPLET - QADHYA"
echo "===================================="
echo ""
echo "⏱️  Durée estimée: 2 minutes"
echo ""

# =============================================================================
# 1. VALIDATION CONFIGURATION
# =============================================================================

echo "📋 PHASE 1 : Validation Configuration"
echo "-------------------------------------"

# Node ENV
NODE_ENV=$(ssh $SERVER "docker exec qadhya-nextjs env | grep NODE_ENV | cut -d'=' -f2")
echo "  ✓ NODE_ENV: $NODE_ENV"

# OpenAI Key
OPENAI_SET=$(ssh $SERVER "docker exec qadhya-nextjs env | grep -c OPENAI_API_KEY || echo 0")
echo "  $([ "$OPENAI_SET" -eq "1" ] && echo "✓" || echo "✗") OPENAI_API_KEY: $([ "$OPENAI_SET" -eq "1" ] && echo "Configurée" || echo "MANQUANTE")"

# Ollama
OLLAMA_ENABLED=$(ssh $SERVER "docker exec qadhya-nextjs env | grep OLLAMA_ENABLED | cut -d'=' -f2 || echo 'not set'")
echo "  ✓ OLLAMA_ENABLED: $OLLAMA_ENABLED"

# RAG Enabled
RAG_ENABLED=$(ssh $SERVER "docker exec qadhya-nextjs env | grep RAG_ENABLED | cut -d'=' -f2 || echo 'not set'")
echo "  ✓ RAG_ENABLED: $RAG_ENABLED"

# Variables seuils
RAG_THRESHOLD_KB=$(ssh $SERVER "docker exec qadhya-nextjs env | grep RAG_THRESHOLD_KB | cut -d'=' -f2 || echo 'not set'")
echo "  ✓ RAG_THRESHOLD_KB: $RAG_THRESHOLD_KB (défaut: 0.65)"

ENABLE_QUERY_EXPANSION=$(ssh $SERVER "docker exec qadhya-nextjs env | grep ENABLE_QUERY_EXPANSION | cut -d'=' -f2 || echo 'not set'")
echo "  ✓ ENABLE_QUERY_EXPANSION: $ENABLE_QUERY_EXPANSION (défaut: true)"

echo ""

# =============================================================================
# 2. ÉTAT BASE DE CONNAISSANCES
# =============================================================================

echo "📊 PHASE 2 : État Base de Connaissances"
echo "----------------------------------------"

KB_STATS=$(ssh $SERVER "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
  SELECT
    COUNT(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) as openai,
    COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL) as ollama,
    COUNT(*) as total
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true;
\"")

OPENAI_COUNT=$(echo $KB_STATS | cut -d'|' -f1)
OLLAMA_COUNT=$(echo $KB_STATS | cut -d'|' -f2)
TOTAL_COUNT=$(echo $KB_STATS | cut -d'|' -f3)

OPENAI_PCT=$(echo "scale=1; $OPENAI_COUNT * 100 / $TOTAL_COUNT" | bc)
OLLAMA_PCT=$(echo "scale=1; $OLLAMA_COUNT * 100 / $TOTAL_COUNT" | bc)

echo "  ✓ Total chunks actifs: $TOTAL_COUNT"
echo "  ✓ Embeddings OpenAI: $OPENAI_COUNT ($OPENAI_PCT%)"
echo "  ✓ Embeddings Ollama: $OLLAMA_COUNT ($OLLAMA_PCT%)"

# Diagnostic coverage
if (( $(echo "$OPENAI_PCT < 80" | bc -l) )); then
  echo "  ⚠️  WARNING: Coverage OpenAI < 80% en production"
fi

echo ""

# =============================================================================
# 3. TEST BM25 (Contenu Disponible)
# =============================================================================

echo "🔍 PHASE 3 : Test Disponibilité Contenu (BM25)"
echo "-----------------------------------------------"

BM25_COUNT=$(ssh $SERVER "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
  SELECT COUNT(*)
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
    AND kbc.content_tsvector @@ plainto_tsquery('simple', '$QUERY_SIMPLE');
\"")

echo "  ✓ Query: '$QUERY_SIMPLE'"
echo "  ✓ Chunks matchant (BM25): $BM25_COUNT"

if [ "$BM25_COUNT" -eq "0" ]; then
  echo "  ❌ CRITIQUE: Aucun contenu trouvé en BM25"
  echo "     → Vérifier contenu KB ou indexation BM25"
else
  echo "  ✅ Contenu disponible en KB"
fi

# Répartition par catégorie
echo ""
echo "  Répartition par catégorie:"
ssh $SERVER "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
  SELECT kb.category, COUNT(*) as chunks
  FROM knowledge_base kb
  JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  WHERE kb.is_active = true
    AND kbc.content_tsvector @@ plainto_tsquery('simple', '$QUERY_SIMPLE')
  GROUP BY kb.category
  ORDER BY chunks DESC
  LIMIT 5;
\"" | while IFS='|' read -r category count; do
  echo "    - $category: $count chunks"
done

echo ""

# =============================================================================
# 4. TEST EMBEDDINGS OPENAI (Query)
# =============================================================================

echo "🧪 PHASE 4 : Test Génération Embedding Query"
echo "--------------------------------------------"

# Vérifier si OpenAI API fonctionne
echo "  ⏳ Test connexion OpenAI API..."

OPENAI_TEST=$(ssh $SERVER "docker exec qadhya-nextjs curl -s -X POST https://api.openai.com/v1/embeddings \
  -H 'Authorization: Bearer '\$(docker exec qadhya-nextjs env | grep OPENAI_API_KEY | cut -d'=' -f2) \
  -H 'Content-Type: application/json' \
  -d '{
    \"input\": \"test\",
    \"model\": \"text-embedding-3-small\"
  }' | jq -r '.data[0].embedding | length // \"error\"' 2>/dev/null || echo 'error'")

if [ "$OPENAI_TEST" = "1536" ]; then
  echo "  ✅ OpenAI API fonctionnelle (dimension: 1536)"
elif [ "$OPENAI_TEST" = "error" ]; then
  echo "  ❌ CRITIQUE: OpenAI API échoue"
  echo "     → Vérifier OPENAI_API_KEY ou quota"
else
  echo "  ⚠️  WARNING: Réponse inattendue: $OPENAI_TEST"
fi

echo ""

# =============================================================================
# 5. TEST RECHERCHE HYBRIDE DIRECTE SQL
# =============================================================================

echo "🎯 PHASE 5 : Test Recherche Hybride SQL (Query Simple)"
echo "-------------------------------------------------------"

# On ne peut pas facilement générer un embedding depuis bash, donc on va tester
# la recherche BM25 seule et vérifier que des résultats existent

echo "  ⏳ Simulation recherche hybride..."
echo "  Note: Test BM25 uniquement (embedding nécessite appel API)"

# Compter combien de chunks matchent BM25 + ont embedding OpenAI
HYBRID_POTENTIAL=$(ssh $SERVER "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
  SELECT COUNT(*)
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
    AND kbc.content_tsvector @@ plainto_tsquery('simple', '$QUERY_SIMPLE')
    AND kbc.embedding_openai IS NOT NULL;
\"")

echo "  ✓ Chunks BM25 matchant + embedding OpenAI: $HYBRID_POTENTIAL"
echo "  ✓ Potentiel résultats recherche hybride: $HYBRID_POTENTIAL"

if [ "$HYBRID_POTENTIAL" -eq "0" ]; then
  echo "  ❌ CRITIQUE: Aucun chunk avec BM25 + embedding OpenAI"
  echo "     → Réindexation embeddings OpenAI requise"
fi

echo ""

# =============================================================================
# 6. ANALYSE SEUILS ET CONFIGURATION RAG
# =============================================================================

echo "⚙️  PHASE 6 : Analyse Configuration RAG"
echo "---------------------------------------"

# Vérifier operations-config.ts déployé
echo "  ⏳ Vérification opération 'assistant-ia'..."

# On ne peut pas facilement lire la config TypeScript depuis le container
# Donc on infère depuis les variables d'environnement et les stats

if [ "$NODE_ENV" = "production" ] && [ "$OPENAI_SET" -eq "1" ] && (( $(echo "$OPENAI_PCT > 90" | bc -l) )); then
  echo "  ✅ Configuration attendue: assistant-ia → OpenAI embeddings"
  echo "     - Environment: production"
  echo "     - OpenAI key: Configurée"
  echo "     - KB coverage: $OPENAI_PCT% OpenAI"
else
  echo "  ⚠️  WARNING: Configuration incohérente détectée"
  [ "$NODE_ENV" != "production" ] && echo "     - NODE_ENV: $NODE_ENV (attendu: production)"
  [ "$OPENAI_SET" -ne "1" ] && echo "     - OPENAI_API_KEY: Non configurée"
  (( $(echo "$OPENAI_PCT < 90" | bc -l) )) && echo "     - KB coverage: $OPENAI_PCT% OpenAI (attendu: >90%)"
fi

# Seuils
echo ""
echo "  Seuils configurés:"
if [ "$RAG_THRESHOLD_KB" != "not set" ]; then
  echo "    - RAG_THRESHOLD_KB: $RAG_THRESHOLD_KB"
  if (( $(echo "$RAG_THRESHOLD_KB > 0.60" | bc -l) )); then
    echo "      ⚠️  Seuil élevé (>0.60) peut bloquer résultats arabes"
  fi
else
  echo "    - RAG_THRESHOLD_KB: 0.65 (défaut code)"
  echo "      ⚠️  Seuil par défaut élevé, adapté à 0.30 pour arabe dans code"
fi

echo ""

# =============================================================================
# 7. CACHE REDIS EMBEDDINGS
# =============================================================================

echo "💾 PHASE 7 : État Cache Redis Embeddings"
echo "-----------------------------------------"

REDIS_KEYS=$(ssh $SERVER "docker exec qadhya-redis redis-cli KEYS 'embedding:*' | wc -l")
echo "  ✓ Clés embeddings en cache: $REDIS_KEYS"

if [ "$REDIS_KEYS" -gt "100" ]; then
  echo "  ⚠️  WARNING: Cache volumineux ($REDIS_KEYS clés)"
  echo "     → Considérer purge pour forcer régénération avec nouveau provider"
fi

echo ""

# =============================================================================
# 8. DIAGNOSTIC FINAL & RECOMMANDATIONS
# =============================================================================

echo "=========================================="
echo "🎯 DIAGNOSTIC FINAL"
echo "=========================================="
echo ""

# Score de santé
HEALTH_SCORE=0
TOTAL_CHECKS=7

# Check 1: OpenAI configuré
[ "$OPENAI_SET" -eq "1" ] && ((HEALTH_SCORE++))

# Check 2: RAG activé
[ "$RAG_ENABLED" = "true" ] && ((HEALTH_SCORE++))

# Check 3: KB coverage OpenAI > 90%
(( $(echo "$OPENAI_PCT > 90" | bc -l) )) && ((HEALTH_SCORE++))

# Check 4: Contenu disponible (BM25 > 0)
[ "$BM25_COUNT" -gt "0" ] && ((HEALTH_SCORE++))

# Check 5: OpenAI API fonctionne
[ "$OPENAI_TEST" = "1536" ] && ((HEALTH_SCORE++))

# Check 6: Potentiel hybride > 0
[ "$HYBRID_POTENTIAL" -gt "0" ] && ((HEALTH_SCORE++))

# Check 7: Production environment
[ "$NODE_ENV" = "production" ] && ((HEALTH_SCORE++))

HEALTH_PCT=$(echo "scale=1; $HEALTH_SCORE * 100 / $TOTAL_CHECKS" | bc)

echo "📊 Score Santé RAG: $HEALTH_SCORE/$TOTAL_CHECKS ($HEALTH_PCT%)"
echo ""

if [ "$HEALTH_SCORE" -eq "$TOTAL_CHECKS" ]; then
  echo "✅ Configuration OPTIMALE détectée"
  echo ""
  echo "🔍 Hypothèses de blocage (par ordre de probabilité):"
  echo ""
  echo "1. 🎯 CLASSIFICATION QUERY INCORRECTE (Probabilité: 60%)"
  echo "   Symptôme: Query classifier retourne catégories incorrectes"
  echo "   Impact: Filtrage par catégorie vide → 0 résultats"
  echo "   Test: Voir logs '[RAG Search] Filtrage KB par catégories:'"
  echo "   Fix: docs/ACTION_PLAN_RAG_FIX.md → Fix B"
  echo ""
  echo "2. 📏 SEUIL SIMILARITÉ TROP ÉLEVÉ (Probabilité: 25%)"
  echo "   Symptôme: Scores embeddings < 0.30 pour texte arabe"
  echo "   Impact: Tous résultats filtrés par seuil"
  echo "   Test: Voir logs scores de similarité"
  echo "   Fix: docs/ACTION_PLAN_RAG_FIX.md → Fix A"
  echo ""
  echo "3. 🔄 CONDENSATION QUERY DÉGRADE QUALITÉ (Probabilité: 10%)"
  echo "   Symptôme: Query longue (>200 chars) condensée agressivement"
  echo "   Impact: Perte concepts clés → embedding générique"
  echo "   Test: Voir logs '[RAG Search] Query condensée:'"
  echo "   Fix: docs/ACTION_PLAN_RAG_FIX.md → Fix C"
  echo ""
  echo "4. 🚫 FALLBACK RECHERCHE GLOBALE NE DÉCLENCHE PAS (Probabilité: 5%)"
  echo "   Symptôme: 0 résultats filtrés mais pas de fallback"
  echo "   Impact: Classification confiante mais incorrecte"
  echo "   Fix: docs/ACTION_PLAN_RAG_FIX.md → Fix D"
  echo ""
else
  echo "⚠️  Configuration INCOMPLÈTE détectée"
  echo ""
  echo "🔧 Actions Correctives REQUISES:"
  echo ""

  [ "$OPENAI_SET" -ne "1" ] && echo "❌ Configurer OPENAI_API_KEY dans .env.production.local"
  [ "$RAG_ENABLED" != "true" ] && echo "❌ Activer RAG: RAG_ENABLED=true"
  (( $(echo "$OPENAI_PCT < 90" | bc -l) )) && echo "⚠️  Réindexer KB avec OpenAI embeddings ($OPENAI_PCT% → >90%)"
  [ "$BM25_COUNT" -eq "0" ] && echo "❌ CRITIQUE: Aucun contenu en KB pour cette query"
  [ "$OPENAI_TEST" != "1536" ] && echo "❌ OpenAI API échoue - vérifier clé ou quota"
  [ "$HYBRID_POTENTIAL" -eq "0" ] && echo "❌ Réindexation complète requise"
  [ "$NODE_ENV" != "production" ] && echo "⚠️  NODE_ENV=$NODE_ENV (attendu: production)"

  echo ""
fi

echo "=========================================="
echo "📋 PROCHAINE ÉTAPE"
echo "=========================================="
echo ""
echo "🔴 ACTION IMMÉDIATE : Test Manuel avec Logs"
echo ""
echo "Terminal 1 - Logs temps réel:"
echo "  ssh $SERVER 'docker logs -f qadhya-nextjs 2>&1 | grep -E \"RAG|KB Hybrid|similarity|catégories\"'"
echo ""
echo "Navigateur - Test Assistant IA:"
echo "  1. Ouvrir: https://qadhya.tn/assistant-ia"
echo "  2. Tester: $QUERY_SIMPLE"
echo "  3. Observer logs Terminal 1"
echo ""
echo "📖 Guide détaillé: docs/ACTION_PLAN_RAG_FIX.md"
echo ""
echo "✅ Diagnostic complet terminé"
