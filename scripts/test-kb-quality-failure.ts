import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'

const docId = 'c2a05de6-6ef7-495e-a836-92895e2547da' // Fصل 109 - 201 chars

console.log('🧪 Test analyse qualité doc court legislation arabe...')
console.log('Doc ID:', docId)

analyzeKBDocumentQuality(docId)
  .then(result => {
    console.log('\n✅ Résultat:', JSON.stringify(result, null, 2))
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  })
