// Script de debug KB en production
// À exécuter sur le serveur : node scripts/debug-kb-prod.js

console.log('🔍 Debug Knowledge Base Production\n')

// 1. Vérifier variables environnement
console.log('1️⃣  Variables environnement:')
console.log('   OLLAMA_ENABLED:', process.env.OLLAMA_ENABLED)
console.log('   RAG_ENABLED:', process.env.RAG_ENABLED)
console.log('   OLLAMA_BASE_URL:', process.env.OLLAMA_BASE_URL)
console.log('')

// 2. Tester isSemanticSearchEnabled()
try {
  // Import dynamique pour éviter les problèmes de chemin
  const configPath = './lib/ai/config'
  const config = require(configPath)
  const isEnabled = config.isSemanticSearchEnabled()

  console.log('2️⃣  isSemanticSearchEnabled():', isEnabled)

  if (!isEnabled) {
    console.log('   ❌ Recherche sémantique DÉSACTIVÉE !')
    console.log('   Raison possible:')
    console.log('   - RAG_ENABLED=false OU')
    console.log('   - (OLLAMA_ENABLED=false ET OPENAI_API_KEY manquant)')
  } else {
    console.log('   ✅ Recherche sémantique ACTIVÉE')
  }
} catch (error) {
  console.log('   ❌ Erreur import config:', error.message)
}
console.log('')

// 3. Tester searchKnowledgeBase()
try {
  const kbService = require('./lib/ai/knowledge-base-service')

  console.log('3️⃣  Test searchKnowledgeBase():')

  // Test simple
  kbService.searchKnowledgeBase('test', { limit: 3, threshold: 0.5 })
    .then(results => {
      console.log(`   Résultats: ${results.length} documents trouvés`)
      if (results.length > 0) {
        console.log('   ✅ searchKnowledgeBase() fonctionne')
        console.log(`   Top result: ${results[0].title} (similarity: ${results[0].similarity.toFixed(3)})`)
      } else {
        console.log('   ⚠️  searchKnowledgeBase() retourne 0 résultats')
      }
    })
    .catch(error => {
      console.log('   ❌ Erreur searchKnowledgeBase():', error.message)
    })
} catch (error) {
  console.log('   ❌ Erreur import knowledge-base-service:', error.message)
}
