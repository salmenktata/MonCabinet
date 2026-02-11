#!/usr/bin/env tsx

/**
 * Script de Test - Assistant IA
 *
 * Test d'un prompt juridique complexe (légitime défense)
 * avec analyse détaillée de la réponse
 */

import fetch from 'node-fetch'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // URL de l'API (local ou production)
  apiUrl: process.env.TEST_ENV === 'production'
    ? 'https://qadhya.tn/api/chat'
    : 'http://localhost:7002/api/chat',

  // Mode IA
  usePremiumModel: process.env.USE_PREMIUM === 'true' || false,

  // Options
  includeJurisprudence: true,
  stream: false,
}

// =============================================================================
// PROMPT DE TEST
// =============================================================================

const TEST_PROMPT = `وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا، والمتهم يؤكد أنه كان يدافع عن نفسه بعد أن تعرض لاعتداء جماعي. توجد تسجيلات كاميرا من زوايا مختلفة: أحدها يظهر الضحية يهاجم أولًا، وآخر يظهر المتهم يوجّه ضربة بعد تراجع الخطر، وشاهد رئيسي يغيّر أقواله لاحقًا مدعيًا أنه تعرض للتهديد. الملف يتطلب تحديد لحظة الخطر "الحال" وهل الرد كان متناسبًا أم تجاوز حدود الدفاع الشرعي، مع اعتماد تقارير الطب الشرعي لتقدير آلية الإصابة، ومقارنة زمن التسجيلات، وتحليل تناقض الأقوال، إضافة إلى بحث مسألة التأثير على الشهود وبطلان بعض الإجراءات إن كانت المعاينات ناقصة.`

// =============================================================================
// TYPES
// =============================================================================

interface Source {
  id: string
  title: string
  category?: string
  similarity: number
  chunk?: string
}

interface ChatResponse {
  answer: string
  sources?: Source[]
  conversationId: string
  tokensUsed?: {
    total: number
    prompt: number
    completion: number
  }
  processingTimeMs?: number
  metadata?: {
    usedPremiumModel?: boolean
    language?: string
    confidence?: number
    ragMetrics?: any
  }
  error?: string
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatNumber(num: number): string {
  return num.toLocaleString('fr-FR')
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

function printSection(title: string, emoji: string = '📌') {
  console.log('\n' + '='.repeat(80))
  console.log(`${emoji} ${title}`)
  console.log('='.repeat(80))
}

function printKeyValue(key: string, value: any, indent: number = 0) {
  const spaces = ' '.repeat(indent)
  console.log(`${spaces}${key.padEnd(25 - indent)}: ${value}`)
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

async function testAssistantPrompt() {
  const startTime = Date.now()

  printSection('🧪 TEST ASSISTANT IA - CAS JURIDIQUE COMPLEXE', '🧪')

  console.log('\n📋 CONFIGURATION:')
  printKeyValue('Environment', CONFIG.apiUrl.includes('localhost') ? 'Local (Dev)' : 'Production')
  printKeyValue('API URL', CONFIG.apiUrl)
  printKeyValue('Mode IA', CONFIG.usePremiumModel ? '🧠 Premium (Cloud)' : '⚡ Rapide (Ollama)')
  printKeyValue('Jurisprudence', CONFIG.includeJurisprudence ? 'Activée' : 'Désactivée')
  printKeyValue('Streaming', CONFIG.stream ? 'Activé' : 'Désactivé')

  console.log('\n📝 PROMPT DE TEST:')
  console.log('─'.repeat(80))
  console.log(TEST_PROMPT)
  console.log('─'.repeat(80))
  printKeyValue('Longueur', `${TEST_PROMPT.length} caractères`)
  printKeyValue('Langue', 'Arabe (AR)')
  printKeyValue('Type de cas', 'Pénal - Légitime défense')

  printSection('🚀 ENVOI DE LA REQUÊTE', '🚀')

  try {
    const requestStartTime = Date.now()

    const response = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: TEST_PROMPT,
        usePremiumModel: CONFIG.usePremiumModel,
        includeJurisprudence: CONFIG.includeJurisprudence,
        stream: CONFIG.stream,
      }),
    })

    const requestDuration = Date.now() - requestStartTime

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json() as ChatResponse

    if (data.error) {
      throw new Error(data.error)
    }

    const totalDuration = Date.now() - startTime

    // =============================================================================
    // AFFICHAGE DES RÉSULTATS
    // =============================================================================

    printSection('✅ RÉPONSE REÇUE', '✅')

    console.log('\n⏱️  MÉTRIQUES DE PERFORMANCE:')
    printKeyValue('Temps requête HTTP', formatDuration(requestDuration))
    printKeyValue('Temps traitement API', data.processingTimeMs ? formatDuration(data.processingTimeMs) : 'N/A')
    printKeyValue('Temps total', formatDuration(totalDuration))

    if (data.tokensUsed) {
      console.log('\n🔢 UTILISATION TOKENS:')
      printKeyValue('Total', formatNumber(data.tokensUsed.total))
      printKeyValue('Prompt', formatNumber(data.tokensUsed.prompt))
      printKeyValue('Completion', formatNumber(data.tokensUsed.completion))
    }

    console.log('\n🎯 MÉTADONNÉES:')
    printKeyValue('Conversation ID', data.conversationId)
    printKeyValue('Mode utilisé', data.metadata?.usedPremiumModel ? '🧠 Premium' : '⚡ Rapide')
    printKeyValue('Langue détectée', data.metadata?.language || 'N/A')
    printKeyValue('Confiance', data.metadata?.confidence ? `${(data.metadata.confidence * 100).toFixed(1)}%` : 'N/A')

    if (data.sources && data.sources.length > 0) {
      console.log('\n📚 SOURCES UTILISÉES:')
      printKeyValue('Nombre de sources', data.sources.length)

      data.sources.forEach((source, index) => {
        console.log(`\n  Source ${index + 1}:`)
        printKeyValue('ID', source.id, 4)
        printKeyValue('Titre', truncate(source.title, 60), 4)
        printKeyValue('Catégorie', source.category || 'N/A', 4)
        printKeyValue('Similarité', `${(source.similarity * 100).toFixed(1)}%`, 4)
      })
    } else {
      console.log('\n📚 SOURCES: Aucune source trouvée')
    }

    printSection('💬 RÉPONSE DE L\'ASSISTANT', '💬')
    console.log('\n' + data.answer)
    console.log('\n' + '─'.repeat(80))

    console.log('\n📊 STATISTIQUES DE LA RÉPONSE:')
    printKeyValue('Longueur', `${data.answer.length} caractères`)
    printKeyValue('Mots (approx)', `${data.answer.split(/\s+/).length} mots`)
    printKeyValue('Lignes', data.answer.split('\n').length)

    // Analyse des sections IRAC
    const sections = {
      faits: data.answer.includes('الوقائع') || data.answer.includes('Faits'),
      problematique: data.answer.includes('الإشكالية') || data.answer.includes('Problématique'),
      regles: data.answer.includes('القاعدة') || data.answer.includes('Règles'),
      analyse: data.answer.includes('التحليل') || data.answer.includes('Analyse'),
      conclusion: data.answer.includes('الخلاصة') || data.answer.includes('Conclusion'),
      sources: data.answer.includes('المراجع') || data.answer.includes('Sources'),
    }

    console.log('\n🎓 STRUCTURE IRAC DÉTECTÉE:')
    printKeyValue('Faits', sections.faits ? '✅' : '❌')
    printKeyValue('Problématique', sections.problematique ? '✅' : '❌')
    printKeyValue('Règles juridiques', sections.regles ? '✅' : '❌')
    printKeyValue('Analyse', sections.analyse ? '✅' : '❌')
    printKeyValue('Conclusion', sections.conclusion ? '✅' : '❌')
    printKeyValue('Sources', sections.sources ? '✅' : '❌')

    const iracScore = Object.values(sections).filter(Boolean).length
    console.log(`\n📈 Score IRAC: ${iracScore}/6 sections présentes`)

    // Détection de concepts juridiques clés
    const concepts = {
      legitimDefense: data.answer.includes('الدفاع الشرعي') || data.answer.includes('légitime défense'),
      imminence: data.answer.includes('خطر حال') || data.answer.includes('imminence') || data.answer.includes('danger imminent'),
      proportionnalite: data.answer.includes('تناسب') || data.answer.includes('proportionnalité'),
      preuves: data.answer.includes('إثبات') || data.answer.includes('preuve') || data.answer.includes('médico-légal'),
      temoins: data.answer.includes('شهود') || data.answer.includes('témoin'),
    }

    console.log('\n🔍 CONCEPTS JURIDIQUES IDENTIFIÉS:')
    printKeyValue('Légitime défense', concepts.legitimDefense ? '✅' : '❌')
    printKeyValue('Danger imminent/Imminence', concepts.imminence ? '✅' : '❌')
    printKeyValue('Proportionnalité', concepts.proportionnalite ? '✅' : '❌')
    printKeyValue('Preuves médico-légales', concepts.preuves ? '✅' : '❌')
    printKeyValue('Témoignages', concepts.temoins ? '✅' : '❌')

    const conceptScore = Object.values(concepts).filter(Boolean).length
    console.log(`\n📈 Score concepts: ${conceptScore}/5 concepts abordés`)

    printSection('🎉 TEST TERMINÉ AVEC SUCCÈS', '🎉')

    // Score global
    const globalScore = ((iracScore / 6) * 50) + ((conceptScore / 5) * 50)
    console.log(`\n🏆 SCORE GLOBAL DE QUALITÉ: ${globalScore.toFixed(1)}/100`)

    if (globalScore >= 80) {
      console.log('   Qualité: ⭐⭐⭐⭐⭐ Excellente')
    } else if (globalScore >= 60) {
      console.log('   Qualité: ⭐⭐⭐⭐ Bonne')
    } else if (globalScore >= 40) {
      console.log('   Qualité: ⭐⭐⭐ Moyenne')
    } else {
      console.log('   Qualité: ⭐⭐ Faible')
    }

    console.log('\n✅ Test complété avec succès!\n')

    process.exit(0)

  } catch (error) {
    printSection('❌ ERREUR', '❌')

    if (error instanceof Error) {
      console.error('\n💥 Message d\'erreur:', error.message)
      console.error('\n📚 Stack trace:')
      console.error(error.stack)
    } else {
      console.error('\n💥 Erreur inconnue:', error)
    }

    console.log('\n🔧 SUGGESTIONS DE DÉPANNAGE:')
    console.log('  1. Vérifier que le serveur dev est démarré (npm run dev)')
    console.log('  2. Vérifier que PostgreSQL est accessible')
    console.log('  3. Vérifier que Ollama est démarré (si mode Rapide)')
    console.log('  4. Vérifier les clés API (si mode Premium)')
    console.log('  5. Vérifier les logs du serveur pour plus de détails')

    console.log('\n❌ Test échoué!\n')
    process.exit(1)
  }
}

// =============================================================================
// EXÉCUTION
// =============================================================================

// Afficher l'aide si demandé
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧪 Script de Test - Assistant IA

USAGE:
  npm run test:assistant-prompt              # Test en local (mode Rapide)
  npm run test:assistant-prompt:premium      # Test en local (mode Premium)
  npm run test:assistant-prompt:prod         # Test en production (mode Rapide)

VARIABLES D'ENVIRONNEMENT:
  TEST_ENV=production     # Tester sur production au lieu de local
  USE_PREMIUM=true        # Utiliser mode Premium au lieu de Rapide

EXEMPLES:
  # Test local avec Ollama (mode Rapide)
  npm run test:assistant-prompt

  # Test local avec cloud providers (mode Premium)
  USE_PREMIUM=true npm run test:assistant-prompt

  # Test production
  TEST_ENV=production npm run test:assistant-prompt

  # Test production mode Premium
  TEST_ENV=production USE_PREMIUM=true npm run test:assistant-prompt
`)
  process.exit(0)
}

// Lancer le test
testAssistantPrompt()
