#!/bin/bash
# Extraction simple abrogations depuis KB via SQL pur
# Usage: bash extract-abrogations-sql.sh

set -e

echo "🚀 Extraction Abrogations depuis KB Qadhya (SQL)"
echo ""

TIMESTAMP=$(date +%s)
OUTPUT_FILE="data/abrogations/kb-abrogations-prod-${TIMESTAMP}.csv"

# Créer répertoire de sortie
mkdir -p data/abrogations

# Exécuter requête SQL
psql -h localhost -p 5434 -U moncabinet -d qadhya -c "
COPY (
  SELECT DISTINCT
    kb.id as kb_id,
    kb.title as kb_title,
    kb.category::text as kb_category,
    LEFT(kbc.content, 500) as chunk_excerpt,
    CASE
      WHEN kbc.content ~* 'abroge\\s+(la\\s+)?loi\\s+n°?\\s*\\d{4}[-‑]\\d+' THEN 'FR'
      WHEN kbc.content ~ 'يلغي|ملغى' THEN 'AR'
      ELSE 'MIXED'
    END as language,
    kb.created_at
  FROM knowledge_base kb
  JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  WHERE (
    kbc.content ILIKE '%abroge%'
    OR kbc.content ILIKE '%abrogée%'
    OR kbc.content ILIKE '%abrogés%'
    OR kbc.content LIKE '%ملغى%'
    OR kbc.content LIKE '%يلغي%'
    OR kbc.content LIKE '%ألغى%'
  )
  AND kb.is_active = true
  ORDER BY kb.category, kb.title
  LIMIT 500
) TO STDOUT WITH CSV HEADER
" > "$OUTPUT_FILE"

# Compter résultats
LINES=$(wc -l < "$OUTPUT_FILE")
RECORDS=$((LINES - 1))

echo "✅ Extraction terminée"
echo ""
echo "📊 Résultats:"
echo "   Total enregistrements: $RECORDS"
echo "   Fichier: $OUTPUT_FILE"
echo ""
echo "📝 Prochaines étapes:"
echo "   1. Analyser le CSV manuellement"
echo "   2. Extraire références lois abrogées"
echo "   3. Compléter traductions AR/FR"
echo "   4. Vérifier sources JORT"
