/**
 * Test des Paramètres Cron (Phase 6.2)
 * Validation des fonctions de validation et conversion
 */

import {
  getCronParameters,
  cronHasParameters,
  validateCronParameters,
  parametersToEnvVars,
} from '../lib/cron/cron-parameters'

console.log('🧪 Test des Paramètres Cron (Phase 6.2)\n')

// Test 1: Récupération paramètres
console.log('📋 Test 1: Récupération paramètres')
const params = getCronParameters('index-kb-progressive')
console.log(`  ✅ ${params.length} paramètres configurés pour index-kb-progressive`)
console.log(`     - ${params.map((p) => p.name).join(', ')}\n`)

// Test 2: Détection présence paramètres
console.log('🔍 Test 2: Détection présence paramètres')
console.log(`  ✅ index-kb-progressive a des paramètres: ${cronHasParameters('index-kb-progressive')}`)
console.log(`  ✅ monitor-openai a des paramètres: ${cronHasParameters('monitor-openai')}\n`)

// Test 3: Validation - Cas valide
console.log('✅ Test 3: Validation - Cas valide')
const validParams = {
  batchSize: 5,
  categories: ['jurisprudence', 'codes'],
  skipEmbeddings: false,
}

const validResult = validateCronParameters('index-kb-progressive', validParams)
console.log(`  Valid: ${validResult.valid}`)
console.log(`  Errors: ${validResult.errors.length === 0 ? 'Aucune' : validResult.errors.join(', ')}\n`)

// Test 4: Validation - Cas invalide (nombre hors limites)
console.log('❌ Test 4: Validation - Cas invalide (nombre hors limites)')
const invalidParams1 = {
  batchSize: 150, // Max = 20
  categories: ['jurisprudence'],
}

const invalidResult1 = validateCronParameters('index-kb-progressive', invalidParams1)
console.log(`  Valid: ${invalidResult1.valid}`)
console.log(`  Errors: ${invalidResult1.errors.join(', ')}\n`)

// Test 5: Validation - Cas invalide (catégorie inconnue)
console.log('❌ Test 5: Validation - Cas invalide (catégorie inconnue)')
const invalidParams2 = {
  batchSize: 5,
  categories: ['jurisprudence', 'invalid_category'],
}

const invalidResult2 = validateCronParameters('index-kb-progressive', invalidParams2)
console.log(`  Valid: ${invalidResult2.valid}`)
console.log(`  Errors: ${invalidResult2.errors.join(', ')}\n`)

// Test 6: Conversion en variables d'environnement
console.log('🔧 Test 6: Conversion en variables d\'environnement')
const envVars = parametersToEnvVars('index-kb-progressive', validParams)
console.log('  Paramètres:', JSON.stringify(validParams, null, 2))
console.log('  Env Vars:', JSON.stringify(envVars, null, 2))
console.log('  ✅ Vérifications:')
console.log(`     - BATCH_SIZE = ${envVars.BATCH_SIZE} (attendu: "5")`)
console.log(`     - CATEGORIES = ${envVars.CATEGORIES} (attendu: "jurisprudence,codes")`)
console.log(`     - SKIP_EMBEDDINGS = ${envVars.SKIP_EMBEDDINGS} (attendu: "0")\n`)

// Test 7: Boolean → Bash format
console.log('🔄 Test 7: Boolean → Bash format (0/1)')
const boolParams = {
  skipEmbeddings: true, // Devrait devenir "1"
}

const boolEnv = parametersToEnvVars('index-kb-progressive', boolParams)
console.log(`  skipEmbeddings: true → SKIP_EMBEDDINGS = ${boolEnv.SKIP_EMBEDDINGS}`)
console.log(`  ✅ ${boolEnv.SKIP_EMBEDDINGS === '1' ? 'CORRECT' : 'ERREUR'}\n`)

// Test 8: Multiselect → CSV
console.log('📊 Test 8: Multiselect → CSV')
const multiselectParams = {
  categories: ['jurisprudence', 'codes', 'legislation'],
}

const multiselectEnv = parametersToEnvVars('index-kb-progressive', multiselectParams)
console.log(`  categories: ['jurisprudence', 'codes', 'legislation']`)
console.log(`  → CATEGORIES = ${multiselectEnv.CATEGORIES}`)
console.log(`  ✅ ${multiselectEnv.CATEGORIES === 'jurisprudence,codes,legislation' ? 'CORRECT' : 'ERREUR'}\n`)

// Test 9: Cron reanalyze-kb-failures
console.log('🔬 Test 9: Cron reanalyze-kb-failures')
const reanalyzeParams = {
  maxDocs: 100,
  scoreThreshold: '50',
  forceProvider: 'openai',
}

const reanalyzeValidation = validateCronParameters('reanalyze-kb-failures', reanalyzeParams)
const reanalyzeEnv = parametersToEnvVars('reanalyze-kb-failures', reanalyzeParams)

console.log(`  Valid: ${reanalyzeValidation.valid}`)
console.log('  Env Vars:', JSON.stringify(reanalyzeEnv, null, 2))
console.log(`  ✅ MAX_DOCS = ${reanalyzeEnv.MAX_DOCS}`)
console.log(`  ✅ SCORE_THRESHOLD = ${reanalyzeEnv.SCORE_THRESHOLD}`)
console.log(`  ✅ FORCE_PROVIDER = ${reanalyzeEnv.FORCE_PROVIDER}\n`)

// Test 10: Cron cleanup-executions
console.log('🧹 Test 10: Cron cleanup-executions')
const cleanupParams = {
  retentionDays: 14,
  keepFailed: true,
}

const cleanupValidation = validateCronParameters('cleanup-executions', cleanupParams)
const cleanupEnv = parametersToEnvVars('cleanup-executions', cleanupParams)

console.log(`  Valid: ${cleanupValidation.valid}`)
console.log('  Env Vars:', JSON.stringify(cleanupEnv, null, 2))
console.log(`  ✅ RETENTION_DAYS = ${cleanupEnv.RETENTION_DAYS}`)
console.log(`  ✅ KEEP_FAILED = ${cleanupEnv.KEEP_FAILED} (1 = true)\n`)

// Résumé
console.log('═══════════════════════════════════════════')
console.log('📊 RÉSUMÉ DES TESTS')
console.log('═══════════════════════════════════════════')

const tests = [
  { name: 'Récupération paramètres', passed: params.length > 0 },
  { name: 'Détection présence paramètres', passed: cronHasParameters('index-kb-progressive') },
  { name: 'Validation cas valide', passed: validResult.valid },
  { name: 'Validation nombre hors limites', passed: !invalidResult1.valid },
  { name: 'Validation catégorie inconnue', passed: !invalidResult2.valid },
  { name: 'Conversion env vars', passed: envVars.BATCH_SIZE === '5' },
  { name: 'Boolean → Bash (0/1)', passed: boolEnv.SKIP_EMBEDDINGS === '1' },
  {
    name: 'Multiselect → CSV',
    passed: multiselectEnv.CATEGORIES === 'jurisprudence,codes,legislation',
  },
  { name: 'Reanalyze-kb-failures', passed: reanalyzeValidation.valid },
  { name: 'Cleanup-executions', passed: cleanupValidation.valid },
]

const passedCount = tests.filter((t) => t.passed).length
const totalCount = tests.length

tests.forEach((test) => {
  const icon = test.passed ? '✅' : '❌'
  console.log(`${icon} ${test.name}`)
})

console.log('\n═══════════════════════════════════════════')
console.log(`Résultat: ${passedCount}/${totalCount} tests passés`)
console.log(`Status: ${passedCount === totalCount ? '🎉 TOUS LES TESTS PASSENT' : '⚠️ CERTAINS TESTS ÉCHOUENT'}`)
console.log('═══════════════════════════════════════════\n')

if (passedCount === totalCount) {
  console.log('✅ Phase 6.2: Paramètres Cron - Tests OK')
  process.exit(0)
} else {
  console.error('❌ Phase 6.2: Paramètres Cron - Tests ÉCHECS')
  process.exit(1)
}
