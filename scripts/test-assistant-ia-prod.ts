/**
 * Test Assistant IA en Production
 *
 * Ce script teste la fonction answerQuestion() directement sur la production
 * en simulant un appel utilisateur authentifié.
 *
 * Usage: npx tsx scripts/test-assistant-ia-prod.ts
 */

import { answerQuestion } from '../lib/ai/rag-chat-service'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function log(emoji: string, message: string, color: string = COLORS.reset) {
  console.log(`${emoji}  ${color}${message}${COLORS.reset}`)
}

// Prompt juridique complexe en arabe (légitime défense)
const TEST_PROMPT = `قع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا، والمتهم يؤكد أنه كان يدافع عن نفسه بعد أن تعرض لاعتداء جماعي. توجد تسجيلات كاميرا من زوايا مختلفة: أحدها يظهر الضحية يهاجم أولًا، وآخر يظهر المتهم يوجّه ضربة بعد تراجع الخطر، وشاهد رئيسي يغيّر أقواله لاحقًا مدعيًا أنه تعرض للتهديد. الملف يتطلب تحديد لحظة الخطر "الحال" وهل الرد كان متناسبًا أم تجاوز حدود الدفاع الشرعي، مع اعتماد تقارير الطب الشرعي لتقدير آلية الإصابة، ومقارنة زمن التسجيلات، وتحليل تناقض الأقوال، إضافة إلى بحث مسألة التأثير على الشهود وبطلان بعض الإجراءات إن كانت المعاينات ناقصة.`

async function main() {
  console.log('\n🧪 Test Assistant IA Production - Prompt Juridique Complexe')
  console.log('='.repeat(80))
  console.log('')

  // Afficher le prompt
  log('📝', 'Prompt test (légitime défense complexe):', COLORS.cyan)
  console.log(`\n${COLORS.yellow}${TEST_PROMPT}${COLORS.reset}\n`)
  console.log(`   Longueur: ${TEST_PROMPT.length} caractères`)
  console.log('')

  // User ID de test (admin ou utilisateur test)
  const TEST_USER_ID = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001'

  log('👤', `User ID test: ${TEST_USER_ID}`, COLORS.blue)
  log('⏱️', 'Démarrage du test...', COLORS.cyan)
  console.log('')

  const startTime = Date.now()

  try {
    // Appel direct à answerQuestion()
    const response = await answerQuestion(TEST_PROMPT, TEST_USER_ID, {
      includeJurisprudence: true,
      includeKnowledgeBase: true,
      usePremiumModel: false, // Mode Rapide (Ollama)
      operationName: 'assistant-ia',
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('')
    log('✅', `SUCCÈS ! Réponse générée en ${duration}s`, COLORS.green)
    console.log('')

    // Analyse de la réponse
    console.log('='.repeat(80))
    log('📊', 'ANALYSE DE LA RÉPONSE', COLORS.magenta)
    console.log('='.repeat(80))
    console.log('')

    // 1. Tokens utilisés
    const tokensUsed = response.tokensUsed.total
    const tokensInput = response.tokensUsed.input
    const tokensOutput = response.tokensUsed.output

    console.log(`   📈 Tokens:`)
    console.log(`      - Input:  ${tokensInput}`)
    console.log(`      - Output: ${tokensOutput}`)
    console.log(`      - Total:  ${tokensUsed}`)

    if (tokensOutput >= 500 && tokensOutput <= 2000) {
      log('   ✅', `Tokens output dans la plage attendue (500-2000)`, COLORS.green)
    } else if (tokensOutput < 500) {
      log('   ⚠️', `Tokens output faible (<500), possible troncature ?`, COLORS.yellow)
    } else {
      log('   ⚠️', `Tokens output élevé (>2000), maxTokens dépassé ?`, COLORS.yellow)
    }
    console.log('')

    // 2. Sources trouvées
    const sourcesCount = response.sources.length
    console.log(`   📚 Sources trouvées: ${sourcesCount}`)

    if (sourcesCount === 0) {
      log('   ❌', 'AUCUNE source trouvée ! KB non accessible ?', COLORS.red)
    } else {
      log('   ✅', `${sourcesCount} sources KB trouvées`, COLORS.green)

      // Afficher les 3 premières sources
      console.log('')
      console.log('   Top 3 sources:')
      response.sources.slice(0, 3).forEach((source, i) => {
        const similarity = ((source.similarity || 0) * 100).toFixed(1)
        const preview = source.chunkContent.substring(0, 60).replace(/\n/g, ' ')
        const category = (source.metadata as any)?.category || 'N/A'
        console.log(`      ${i + 1}. [${similarity}%] ${category} - ${source.documentName}`)
        console.log(`         "${preview}..."`)
      })
    }
    console.log('')

    // 3. Modèle utilisé
    console.log(`   🤖 Modèle: ${response.model || 'N/A'}`)
    console.log(`   ⏱️  Durée: ${duration}s`)
    console.log('')

    // 4. Vérifier présence de citations [KB-N]
    const citationRegex = /\[(KB|Juris|Source)-\d+\]/g
    const citations = response.answer.match(citationRegex) || []

    console.log(`   📎 Citations trouvées: ${citations.length}`)
    if (citations.length > 0) {
      log('   ✅', `Citations présentes: ${citations.slice(0, 5).join(', ')}`, COLORS.green)
    } else {
      log('   ⚠️', 'Aucune citation [KB-N] dans la réponse', COLORS.yellow)
    }
    console.log('')

    // 5. Longueur de la réponse
    const answerLength = response.answer.length
    const wordCount = response.answer.split(/\s+/).length

    console.log(`   📏 Longueur réponse:`)
    console.log(`      - Caractères: ${answerLength}`)
    console.log(`      - Mots: ${wordCount}`)

    if (wordCount < 100) {
      log('   ⚠️', 'Réponse très courte (<100 mots), possible erreur ?', COLORS.yellow)
    } else if (wordCount >= 300) {
      log('   ✅', 'Réponse détaillée (≥300 mots)', COLORS.green)
    }
    console.log('')

    // 6. Afficher la réponse complète
    console.log('='.repeat(80))
    log('💬', 'RÉPONSE COMPLÈTE', COLORS.magenta)
    console.log('='.repeat(80))
    console.log('')
    console.log(response.answer)
    console.log('')

    // 7. Résumé validation
    console.log('='.repeat(80))
    log('🎯', 'VALIDATION FINALE', COLORS.magenta)
    console.log('='.repeat(80))
    console.log('')

    const validations = [
      { name: 'Réponse générée', pass: true },
      { name: 'Durée < 45s', pass: parseFloat(duration) < 45 },
      { name: 'Sources KB trouvées', pass: sourcesCount > 0 },
      { name: 'Citations présentes', pass: citations.length > 0 },
      { name: 'Tokens output 500-2000', pass: tokensOutput >= 500 && tokensOutput <= 2000 },
      { name: 'Réponse détaillée (≥300 mots)', pass: wordCount >= 300 },
    ]

    validations.forEach(v => {
      if (v.pass) {
        log('   ✅', v.name, COLORS.green)
      } else {
        log('   ❌', v.name, COLORS.red)
      }
    })

    const passCount = validations.filter(v => v.pass).length
    const totalCount = validations.length
    const successRate = ((passCount / totalCount) * 100).toFixed(0)

    console.log('')
    if (passCount === totalCount) {
      log('🎉', `TOUS LES TESTS RÉUSSIS ! (${passCount}/${totalCount})`, COLORS.green)
      log('✅', 'Assistant IA fonctionne parfaitement', COLORS.green)
    } else {
      log('⚠️', `Tests: ${passCount}/${totalCount} réussis (${successRate}%)`, COLORS.yellow)

      if (sourcesCount === 0) {
        log('💡', 'Vérifier OLLAMA_ENABLED=true et isSemanticSearchEnabled()', COLORS.yellow)
      }
      if (tokensOutput < 500) {
        log('💡', 'Vérifier maxTokens configuration (devrait être 2000)', COLORS.yellow)
      }
    }
    console.log('')

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('')
    log('❌', `ERREUR après ${duration}s`, COLORS.red)
    console.log('')

    if (error instanceof Error) {
      console.log(`   Message: ${error.message}`)
      console.log(`   Stack: ${error.stack?.split('\n').slice(0, 5).join('\n   ')}`)
    } else {
      console.log(`   Erreur: ${String(error)}`)
    }

    console.log('')
    log('💡', 'Vérifications suggérées:', COLORS.yellow)
    console.log('   1. OLLAMA_ENABLED=true dans conteneur')
    console.log('   2. Service Ollama accessible (http://host.docker.internal:11434)')
    console.log('   3. Knowledge Base indexée (8735 docs)')
    console.log('   4. Recherche vectorielle fonctionnelle')
    console.log('')

    process.exit(1)
  }
}

main().catch(error => {
  console.error('\n❌ Erreur fatale:', error)
  process.exit(1)
})
