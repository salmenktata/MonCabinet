#!/bin/bash
# Test direct de la fonction SQL search_knowledge_base_hybrid

echo "🔍 Test recherche KB SQL direct - Légitime défense"
echo ""

# Texte simple pour test
QUERY="الدفاع الشرعي"

echo "Query: $QUERY"
echo "Threshold: 0.20 (très permissif)"
echo ""

# Test 1: Chercher des chunks qui contiennent le texte (BM25)
echo "📊 Test 1: Recherche BM25 full-text (content_tsvector)"
ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"
  SELECT
    kbc.id,
    kb.title,
    kb.category,
    SUBSTRING(kbc.content, 1, 100) as content_preview,
    ts_rank(kbc.content_tsvector, plainto_tsquery('arabic', '$QUERY')) as bm25_rank
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
    AND kbc.content_tsvector @@ plainto_tsquery('arabic', '$QUERY')
  ORDER BY bm25_rank DESC
  LIMIT 5;
\""

echo ""
echo "📊 Test 2: Compter chunks avec embeddings"
ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c \"
  SELECT
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    COUNT(*) FILTER (WHERE embedding_openai IS NOT NULL) as with_openai,
    COUNT(*) as total_chunks
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true;
\""

echo ""
echo "📊 Test 3: Recherche simple par mots-clés dans content"
ssh root@84.247.165.187 "docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -c \"
  SELECT
    kb.id,
    kb.category,
    kb.title,
    COUNT(kbc.id) as matching_chunks
  FROM knowledge_base kb
  JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  WHERE kb.is_active = true
    AND (kbc.content ILIKE '%دفاع%' OR kbc.content ILIKE '%شرعي%')
  GROUP BY kb.id, kb.category, kb.title
  ORDER BY matching_chunks DESC
  LIMIT 10;
\""

echo ""
echo "✅ Test terminé"
