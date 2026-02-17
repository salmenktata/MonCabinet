#!/usr/bin/env tsx
/**
 * Test Authentifié des Réponses LLM en Production
 *
 * Compare 3 modes de réponse avec le même prompt :
 * 1. Mode Rapide (⚡ Ollama qwen2.5:3b) - usePremiumModel=false
 * 2. Mode Premium (🧠 Cloud: Groq→DeepSeek→Anthropic) - usePremiumModel=true
 * 3. Sans Jurisprudence - includeJurisprudence=false
 *
 * Évalue :
 * - Temps de réponse (ms)
 * - Provider utilisé (ollama/groq/deepseek/anthropic)
 * - Tokens consommés
 * - Longueur et qualité de la réponse
 *
 * ⚠️  AUTHENTICATION REQUISE
 * --------------------------
 * Pour tester en production, vous devez fournir un cookie de session valide.
 *
 * Option 1 (Recommandée) : Ajouter à .env.local
 *   NEXTAUTH_SESSION_COOKIE="next-auth.session-token=xxxx"
 *
 * Option 2 : Modifier getAuthCookie() dans ce script
 *
 * Comment obtenir le cookie :
 * 1. Se connecter sur https://qadhya.tn
 * 2. Ouvrir DevTools → Application → Cookies → qadhya.tn
 * 3. Copier la valeur de "next-auth.session-token"
 * 4. Ajouter dans .env.local : NEXTAUTH_SESSION_COOKIE="next-auth.session-token=VALEUR_COPIÉE"
 *
 * Usage:
 *   npx tsx scripts/test-prod-llm-authenticated.ts
 *   npx tsx scripts/test-prod-llm-authenticated.ts --verbose
 */

import 'dotenv/config'

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

interface TestResult {
  page: string
  endpoint: string
  success: boolean
  responseTime: number
  provider?: string
  model?: string
  tokensUsed?: number
  responseLength?: number
  error?: string
  answer?: string
}

// Prompt de test juridique tunisien
const TEST_PROMPT = 'ما هي الإجراءات القانونية لرفع دعوى إيجار في تونس؟'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

// Verbose mode
const VERBOSE = process.argv.includes('--verbose')

/**
 * Test avec Mode Rapide (Ollama qwen2.5:3b)
 */
async function testModeRapide(): Promise<TestResult> {
  const page = 'Mode Rapide (⚡ Ollama)'
  const endpoint = '/api/chat'
  const start = Date.now()

  try {
    console.log(`\n${colors.cyan}Testing ${page}...${colors.reset}`)

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: getAuthCookie(), // Cookie de session si disponible
      },
      body: JSON.stringify({
        question: TEST_PROMPT,
        usePremiumModel: false, // Mode Rapide (Ollama)
        includeJurisprudence: true,
      }),
    })

    const responseTime = Date.now() - start

    if (!response.ok) {
      const error = await response.text()
      return {
        page,
        endpoint,
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${error}`,
      }
    }

    const data = await response.json()

    return {
      page,
      endpoint,
      success: true,
      responseTime,
      provider: 'ollama (expected)',
      model: 'qwen2.5:3b',
      tokensUsed: data.tokensUsed?.total || 0,
      responseLength: data.answer?.length || 0,
      answer: data.answer || '',
    }
  } catch (error) {
    return {
      page,
      endpoint,
      success: false,
      responseTime: Date.now() - start,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Test avec Mode Premium (Cloud Providers)
 */
async function testModePremium(): Promise<TestResult> {
  const page = 'Mode Premium (🧠 Cloud)'
  const endpoint = '/api/chat'
  const start = Date.now()

  try {
    console.log(`\n${colors.cyan}Testing ${page}...${colors.reset}`)

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: getAuthCookie(), // Cookie de session si disponible
      },
      body: JSON.stringify({
        question: TEST_PROMPT,
        usePremiumModel: true, // Mode Premium (Groq → DeepSeek → Anthropic)
        includeJurisprudence: true,
      }),
    })

    const responseTime = Date.now() - start

    if (!response.ok) {
      const error = await response.text()
      return {
        page,
        endpoint,
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${error}`,
      }
    }

    const data = await response.json()

    return {
      page,
      endpoint,
      success: true,
      responseTime,
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      tokensUsed: data.tokensUsed?.total || 0,
      responseLength: data.answer?.length || 0,
      answer: data.answer || '',
    }
  } catch (error) {
    return {
      page,
      endpoint,
      success: false,
      responseTime: Date.now() - start,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Test sans jurisprudence
 */
async function testSansJurisprudence(): Promise<TestResult> {
  const page = 'Sans Jurisprudence'
  const endpoint = '/api/chat'
  const start = Date.now()

  try {
    console.log(`\n${colors.cyan}Testing ${page}...${colors.reset}`)

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: getAuthCookie(),
      },
      body: JSON.stringify({
        question: TEST_PROMPT,
        usePremiumModel: false,
        includeJurisprudence: false, // Pas de recherche RAG
      }),
    })

    const responseTime = Date.now() - start

    if (!response.ok) {
      const error = await response.text()
      return {
        page,
        endpoint,
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${error}`,
      }
    }

    const data = await response.json()

    return {
      page,
      endpoint,
      success: true,
      responseTime,
      provider: 'ollama (expected)',
      model: 'qwen2.5:3b',
      tokensUsed: data.tokensUsed?.total || 0,
      responseLength: data.answer?.length || 0,
      answer: data.answer || '',
    }
  } catch (error) {
    return {
      page,
      endpoint,
      success: false,
      responseTime: Date.now() - start,
      error: getErrorMessage(error),
    }
  }
}

/**
 * Helper: Récupérer le cookie d'authentification
 * Essaie d'abord NEXTAUTH_SESSION depuis .env, sinon demande à l'utilisateur
 */
function getAuthCookie(): string {
  const sessionCookie = process.env.NEXTAUTH_SESSION_COOKIE
  if (sessionCookie) {
    return sessionCookie
  }

  // Pas de cookie configuré - le test retournera 401
  return ''
}

/**
 * Affiche les résultats d'un test
 */
function displayResult(result: TestResult) {
  const statusIcon = result.success ? '✅' : '❌'
  const statusColor = result.success ? colors.green : colors.red

  console.log(`\n${colors.blue}${'='.repeat(70)}${colors.reset}`)
  console.log(`${statusColor}${statusIcon} ${result.page}${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}`)

  console.log(`Endpoint     : ${result.endpoint}`)
  console.log(`Response Time: ${result.responseTime}ms`)

  if (result.success) {
    console.log(`Provider     : ${result.provider}`)
    console.log(`Model        : ${result.model}`)
    console.log(`Tokens Used  : ${result.tokensUsed}`)
    console.log(`Response Len : ${result.responseLength} chars`)

    if (VERBOSE && result.answer) {
      console.log(`\n${colors.cyan}Response Preview:${colors.reset}`)
      const preview = result.answer.substring(0, 300) + (result.answer.length > 300 ? '...' : '')
      console.log(preview)
    }
  } else {
    console.log(`${colors.red}Error        : ${result.error}${colors.reset}`)
  }
}

/**
 * Affiche un tableau comparatif
 */
function displayComparison(results: TestResult[]) {
  console.log(`\n${colors.blue}${'='.repeat(70)}${colors.reset}`)
  console.log(`${colors.blue}📊 TABLEAU COMPARATIF${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}\n`)

  const successResults = results.filter((r) => r.success)

  if (successResults.length === 0) {
    console.log(`${colors.red}❌ Aucun test réussi${colors.reset}`)
    return
  }

  // Header
  console.log(
    `${'Page'.padEnd(25)} | ${'Time'.padEnd(10)} | ${'Provider'.padEnd(15)} | ${'Model'.padEnd(20)}`
  )
  console.log('-'.repeat(85))

  // Rows
  for (const result of successResults) {
    const page = result.page.padEnd(25)
    const time = `${result.responseTime}ms`.padEnd(10)
    const provider = (result.provider || 'N/A').padEnd(15)
    const model = (result.model || 'N/A').padEnd(20)

    console.log(`${page} | ${time} | ${provider} | ${model}`)
  }

  // Statistiques
  console.log(`\n${colors.cyan}Statistiques:${colors.reset}`)
  const avgTime = Math.round(
    successResults.reduce((sum, r) => sum + r.responseTime, 0) / successResults.length
  )
  const avgLength = Math.round(
    successResults.reduce((sum, r) => sum + (r.responseLength || 0), 0) / successResults.length
  )
  const totalTokens = successResults.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)

  console.log(`  Temps moyen      : ${avgTime}ms`)
  console.log(`  Longueur moyenne : ${avgLength} chars`)
  console.log(`  Tokens totaux    : ${totalTokens}`)

  // Meilleur/Pire
  const fastest = successResults.reduce((min, r) => (r.responseTime < min.responseTime ? r : min))
  const slowest = successResults.reduce((max, r) => (r.responseTime > max.responseTime ? r : max))

  console.log(`\n${colors.green}⚡ Plus rapide : ${fastest.page} (${fastest.responseTime}ms)${colors.reset}`)
  console.log(`${colors.yellow}🐌 Plus lent   : ${slowest.page} (${slowest.responseTime}ms)${colors.reset}`)
}

/**
 * Main
 */
async function main() {
  console.log(`${colors.blue}${'='.repeat(70)}`)
  console.log('🧪 Test Authentifié des Réponses LLM en Production')
  console.log(`${'='.repeat(70)}${colors.reset}\n`)

  console.log(`Base URL : ${BASE_URL}`)
  console.log(`Prompt   : ${TEST_PROMPT}`)
  console.log(`Verbose  : ${VERBOSE ? 'Oui' : 'Non'}`)

  // Exécuter tous les tests en parallèle
  console.log(`\n${colors.cyan}🚀 Démarrage des tests...${colors.reset}`)

  const [rapideResult, premiumResult, sansJurisResult] = await Promise.all([
    testModeRapide(),
    testModePremium(),
    testSansJurisprudence(),
  ])

  const results = [rapideResult, premiumResult, sansJurisResult]

  // Afficher les résultats individuels
  results.forEach(displayResult)

  // Afficher le tableau comparatif
  displayComparison(results)

  // Résumé final
  const successCount = results.filter((r) => r.success).length
  const failureCount = results.filter((r) => r.success === false).length

  console.log(`\n${colors.blue}${'='.repeat(70)}${colors.reset}`)
  console.log(`${colors.blue}📝 RÉSUMÉ FINAL${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}\n`)

  console.log(`${colors.green}✅ Tests réussis  : ${successCount}/3${colors.reset}`)
  console.log(`${colors.red}❌ Tests échoués  : ${failureCount}/3${colors.reset}`)

  if (failureCount > 0) {
    console.log(`\n${colors.yellow}⚠️  Recommandations:${colors.reset}`)
    console.log(`  1. Vérifier que les endpoints existent et sont accessibles`)
    console.log(`  2. Vérifier la configuration des API keys (dashboard: /super-admin/api-keys-health)`)
    console.log(`  3. Vérifier les logs : docker logs -f moncabinet-nextjs`)
    console.log(`  4. Si authentification requise, ajouter les tokens dans le script\n`)
  } else {
    console.log(`\n${colors.green}🎉 Tous les tests sont passés avec succès !${colors.reset}\n`)
  }

  // Exit code
  process.exit(failureCount > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`${colors.red}❌ Erreur fatale:${colors.reset}`, error)
  process.exit(1)
})
