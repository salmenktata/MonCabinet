#!/bin/bash
# Test rapide threshold KB avec différentes valeurs

cd /Users/salmenktata/Projets/GitHub/Avocat

echo "🧪 Test KB Threshold - Reproduire problème production"
echo "======================================================"
echo ""

# Prompt utilisateur en arabe (légitime défense)
PROMPT="قع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة"

echo "📝 Prompt: $PROMPT"
echo ""

# Test avec threshold 0.5
echo "🔍 Test threshold 0.5 (endpoint debug)..."
curl -s http://localhost:7002/api/test/kb-debug | jq -r '.kbSearch.resultsCount'

# Test direct avec threshold 0.65
echo "🔍 Test threshold 0.65 (production)..."
npx tsx -e "
import { searchKnowledgeBase } from './lib/ai/knowledge-base-service.js'

searchKnowledgeBase('$PROMPT', { limit: 5, threshold: 0.65 })
  .then(results => {
    console.log('Résultats:', results.length)
    if (results.length === 0) {
      console.log('❌ AUCUN RÉSULTAT - C\\'est le problème !')
    } else {
      results.forEach((r, i) => {
        console.log(\`  \${i+1}. [\${(r.similarity*100).toFixed(1)}%] \${r.title.substring(0, 40)}\`)
      })
    }
  })
  .catch(err => console.error('Erreur:', err.message))
"

