#!/usr/bin/env tsx

/**
 * Script de Test Production - Assistant IA
 *
 * Test automatique ou guidé de l'Assistant IA sur https://qadhya.tn
 */

import fetch from 'node-fetch'
import { exec } from 'child_process'

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROD_URL = 'https://qadhya.tn'
const API_ENDPOINT = `${PROD_URL}/api/chat`
const ASSISTANT_PAGE = `${PROD_URL}/assistant-ia`

// Session token depuis variable d'environnement (optionnel)
const SESSION_TOKEN = process.env.QADHYA_SESSION_TOKEN || ''

// =============================================================================
// PROMPT DE TEST
// =============================================================================

const TEST_PROMPT = `وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا، والمتهم يؤكد أنه كان يدافع عن نفسه بعد أن تعرض لاعتداء جماعي. توجد تسجيلات كاميرا من زوايا مختلفة: أحدها يظهر الضحية يهاجم أولًا، وآخر يظهر المتهم يوجّه ضربة بعد تراجع الخطر، وشاهد رئيسي يغيّر أقواله لاحقًا مدعيًا أنه تعرض للتهديد. الملف يتطلب تحديد لحظة الخطر "الحال" وهل الرد كان متناسبًا أم تجاوز حدود الدفاع الشرعي، مع اعتماد تقارير الطب الشرعي لتقدير آلية الإصابة، ومقارنة زمن التسجيلات، وتحليل تناقض الأقوال، إضافة إلى بحث مسألة التأثير على الشهود وبطلان بعض الإجراءات إن كانت المعاينات ناقصة.`

// =============================================================================
// TYPES
// =============================================================================

interface ChatResponse {
  answer: string
  sources?: Array<{
    id: string
    title: string
    category?: string
    similarity: number
  }>
  conversationId: string
  tokensUsed?: {
    total: number
    prompt: number
    completion: number
  }
  processingTimeMs?: number
  metadata?: any
  error?: string
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

function printSection(title: string, emoji: string = '📌') {
  console.log('\n' + '='.repeat(80))
  console.log(`${emoji} ${title}`)
  console.log('='.repeat(80))
}

function printKeyValue(key: string, value: any, indent: number = 0) {
  const spaces = ' '.repeat(indent)
  console.log(`${spaces}${key.padEnd(25 - indent)}: ${value}`)
}

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

function openBrowser(url: string) {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
    ? `start "${url}"`
    : `xdg-open "${url}"`

  exec(command, (error) => {
    if (error) {
      console.error(`Erreur lors de l'ouverture du navigateur: ${error.message}`)
    }
  })
}

async function copyToClipboard(text: string) {
  const command = process.platform === 'darwin'
    ? `echo "${text.replace(/"/g, '\\"')}" | pbcopy`
    : process.platform === 'win32'
    ? `echo ${text} | clip`
    : `echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`

  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

// =============================================================================
// TEST AUTOMATIQUE (avec token de session)
// =============================================================================

async function testWithToken(sessionToken: string) {
  printSection('🤖 TEST AUTOMATIQUE - PRODUCTION', '🤖')

  console.log('\n📋 CONFIGURATION:')
  printKeyValue('URL', PROD_URL)
  printKeyValue('Endpoint API', API_ENDPOINT)
  printKeyValue('Authentification', 'Token de session fourni ✅')

  console.log('\n📝 PROMPT:')
  console.log('─'.repeat(80))
  console.log(TEST_PROMPT)
  console.log('─'.repeat(80))
  printKeyValue('Longueur', `${TEST_PROMPT.length} caractères`)

  printSection('🚀 ENVOI DE LA REQUÊTE', '🚀')

  const startTime = Date.now()

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session=${sessionToken}`,
      },
      body: JSON.stringify({
        question: TEST_PROMPT,
        usePremiumModel: false,
        includeJurisprudence: true,
        stream: false,
      }),
    })

    const requestDuration = Date.now() - startTime

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentification échouée. Token de session invalide ou expiré.')
      }
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json() as ChatResponse

    if (data.error) {
      throw new Error(data.error)
    }

    printSection('✅ RÉPONSE REÇUE', '✅')

    console.log('\n⏱️  MÉTRIQUES DE PERFORMANCE:')
    printKeyValue('Temps requête HTTP', formatDuration(requestDuration))
    printKeyValue('Temps traitement API', data.processingTimeMs ? formatDuration(data.processingTimeMs) : 'N/A')

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

    if (data.sources && data.sources.length > 0) {
      console.log('\n📚 SOURCES UTILISÉES:')
      printKeyValue('Nombre de sources', data.sources.length)

      data.sources.forEach((source, index) => {
        console.log(`\n  Source ${index + 1}:`)
        printKeyValue('Titre', truncate(source.title, 60), 4)
        printKeyValue('Catégorie', source.category || 'N/A', 4)
        printKeyValue('Similarité', `${(source.similarity * 100).toFixed(1)}%`, 4)
      })
    }

    printSection('💬 RÉPONSE DE L\'ASSISTANT', '💬')
    console.log('\n' + data.answer)
    console.log('\n' + '─'.repeat(80))

    console.log('\n📊 STATISTIQUES:')
    printKeyValue('Longueur', `${data.answer.length} caractères`)
    printKeyValue('Mots (approx)', `${data.answer.split(/\s+/).length} mots`)

    // Analyse structure
    const hasIRAC = {
      faits: data.answer.includes('الوقائع') || data.answer.includes('Faits'),
      problematique: data.answer.includes('الإشكالية') || data.answer.includes('Problématique'),
      regles: data.answer.includes('القواعد') || data.answer.includes('Règles'),
      analyse: data.answer.includes('التحليل') || data.answer.includes('Analyse'),
      conclusion: data.answer.includes('الخلاصة') || data.answer.includes('Conclusion'),
    }

    const iracScore = Object.values(hasIRAC).filter(Boolean).length
    console.log(`\n🎓 Structure IRAC: ${iracScore}/5 sections`)

    printSection('✅ TEST TERMINÉ AVEC SUCCÈS', '✅')
    console.log(`\n🔗 Voir la conversation complète: ${PROD_URL}/assistant-ia`)
    console.log(`   Conversation ID: ${data.conversationId}`)

    process.exit(0)

  } catch (error) {
    printSection('❌ ERREUR', '❌')

    if (error instanceof Error) {
      console.error('\n💥 Message:', error.message)
    } else {
      console.error('\n💥 Erreur inconnue:', error)
    }

    console.log('\n💡 SOLUTIONS:')
    console.log('  1. Vérifier que le token de session est valide')
    console.log('  2. Se reconnecter sur https://qadhya.tn pour obtenir un nouveau token')
    console.log('  3. Ou utiliser le mode manuel (npm run test:prod-manual)')

    process.exit(1)
  }
}

// =============================================================================
// TEST MANUEL GUIDÉ
// =============================================================================

async function testManual() {
  printSection('👨‍💻 TEST MANUEL GUIDÉ - PRODUCTION', '👨‍💻')

  console.log('\n📋 Ce script va vous guider pour tester l\'Assistant IA sur production.')
  console.log('   Vous allez copier-coller le prompt dans l\'interface web.')

  console.log('\n📝 PROMPT À TESTER:')
  console.log('─'.repeat(80))
  console.log(TEST_PROMPT)
  console.log('─'.repeat(80))
  printKeyValue('Longueur', `${TEST_PROMPT.length} caractères`)
  printKeyValue('Langue', 'Arabe (AR)')
  printKeyValue('Type de cas', 'Pénal - Légitime défense')

  // Copier le prompt dans le presse-papier
  console.log('\n📋 Copie du prompt dans le presse-papier...')
  try {
    await copyToClipboard(TEST_PROMPT)
    console.log('   ✅ Prompt copié ! Vous pouvez le coller avec Ctrl+V (ou Cmd+V)')
  } catch (error) {
    console.log('   ⚠️  Impossible de copier automatiquement. Copiez manuellement le texte ci-dessus.')
  }

  console.log('\n🌐 Ouverture de la page Assistant IA...')
  openBrowser(ASSISTANT_PAGE)
  await new Promise(resolve => setTimeout(resolve, 2000))

  printSection('📋 ÉTAPES À SUIVRE', '📋')

  console.log('\n1️⃣  **CONNEXION**')
  console.log('   → Si vous n\'êtes pas connecté, utilisez vos identifiants')
  console.log('   → URL: https://qadhya.tn/login')

  console.log('\n2️⃣  **ACCÈS À L\'ASSISTANT IA**')
  console.log('   → La page devrait s\'ouvrir automatiquement')
  console.log('   → Sinon, allez sur: https://qadhya.tn/assistant-ia')

  console.log('\n3️⃣  **COLLER LE PROMPT**')
  console.log('   → Cliquez dans la zone de texte en bas')
  console.log('   → Collez le prompt (Ctrl+V ou Cmd+V)')
  console.log('   → Le prompt est déjà copié dans votre presse-papier ✅')

  console.log('\n4️⃣  **CHOISIR LE MODE**')
  console.log('   → ⚡ Mode Rapide (Ollama local) - recommandé')
  console.log('   → 🧠 Mode Premium (Cloud) - pour comparaison')

  console.log('\n5️⃣  **ENVOYER LA REQUÊTE**')
  console.log('   → Cliquez sur le bouton "Envoyer" ou appuyez sur Entrée')
  console.log('   → Attendez la réponse (15-30 secondes)')

  printSection('🔍 POINTS À VÉRIFIER', '🔍')

  console.log('\n✅ **Structure IRAC complète:**')
  console.log('   □ الوقائع (Faits)')
  console.log('   □ الإشكالية (Problématique)')
  console.log('   □ القواعد القانونية (Règles juridiques)')
  console.log('   □ التحليل القانوني (Analyse juridique)')
  console.log('   □ الخلاصة (Conclusion)')
  console.log('   □ المراجع القانونية (Références/Sources)')

  console.log('\n✅ **Concepts juridiques traités:**')
  console.log('   □ الدفاع الشرعي (Légitime défense)')
  console.log('   □ خطر حال (Danger imminent)')
  console.log('   □ التناسب (Proportionnalité)')
  console.log('   □ الطب الشرعي (Médecine légale)')
  console.log('   □ شهود (Témoignages)')

  console.log('\n✅ **Qualité de la réponse:**')
  console.log('   □ Citations précises (Fصل 39 المجلة الجزائية)')
  console.log('   □ Analyse multi-scénarios (3 scénarios possibles)')
  console.log('   □ Recommandations procédurales concrètes')
  console.log('   □ Prise en compte des nuances (vidéos, témoins, timing)')
  console.log('   □ Ton professionnel d\'avocat chevronné')

  console.log('\n✅ **Sources utilisées:**')
  console.log('   □ Nombre de sources affichées (objectif: 3-8)')
  console.log('   □ Types variés (législation, jurisprudence)')
  console.log('   □ Similarité élevée (>80%)')

  printSection('📊 MÉTRIQUES À NOTER', '📊')

  console.log('\n⏱️  **Performance:**')
  console.log('   → Temps de réponse: ______ secondes')
  console.log('   → Mode utilisé: ⚡ Rapide / 🧠 Premium')

  console.log('\n🎯 **Qualité:**')
  console.log('   → Sections IRAC présentes: _____ / 6')
  console.log('   → Concepts juridiques traités: _____ / 5')
  console.log('   → Score global estimé: _____ / 100')

  console.log('\n📚 **Sources:**')
  console.log('   → Nombre de sources: _____')
  console.log('   → Similarité moyenne: _____ %')

  printSection('💡 CONSEILS', '💡')

  console.log('\n🔄 **Pour comparer les modes:**')
  console.log('   1. Testez d\'abord en mode ⚡ Rapide (Ollama)')
  console.log('   2. Créez une nouvelle conversation')
  console.log('   3. Testez le même prompt en mode 🧠 Premium')
  console.log('   4. Comparez les résultats (qualité, temps, sources)')

  console.log('\n📸 **Pour documenter les résultats:**')
  console.log('   → Faites des captures d\'écran de la réponse')
  console.log('   → Notez les métriques ci-dessus')
  console.log('   → Exportez la conversation (bouton "Actions")')

  printSection('✅ TEST PRÊT', '✅')

  console.log('\n🎉 Tout est prêt ! Suivez les étapes ci-dessus.')
  console.log('   Le prompt est dans votre presse-papier.')
  console.log('   La page devrait être ouverte dans votre navigateur.')
  console.log('\n   Bonne chance ! 🚀\n')

  process.exit(0)
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

async function main() {
  // Vérifier si aide demandée
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🧪 Script de Test Production - Assistant IA

USAGE:
  npm run test:prod              # Test manuel guidé (recommandé)
  npm run test:prod:auto         # Test automatique (nécessite token)

MODES:

1. TEST MANUEL GUIDÉ (Recommandé)
   → Ouvre le navigateur automatiquement
   → Copie le prompt dans le presse-papier
   → Guide étape par étape
   → Pas besoin de token de session

   Commande:
   npm run test:prod

2. TEST AUTOMATIQUE (Avancé)
   → Nécessite un token de session valide
   → Appelle l'API directement
   → Affiche les résultats dans le terminal

   Commande:
   QADHYA_SESSION_TOKEN="votre-token" npm run test:prod:auto

OBTENIR UN TOKEN DE SESSION:

1. Connectez-vous sur https://qadhya.tn
2. Ouvrez les DevTools (F12)
3. Onglet "Application" → "Cookies" → "https://qadhya.tn"
4. Copiez la valeur du cookie "session"
5. Utilisez-la avec la variable d'environnement

Exemple:
QADHYA_SESSION_TOKEN="eyJhbG..." npm run test:prod:auto

PROMPT TESTÉ:
Cas pénal complexe de légitime défense avec:
- Altercation nocturne → décès
- Vidéos contradictoires
- Témoin changeant sa déposition
- Questions juridiques multiples

OBJECTIFS:
✅ Vérifier structure IRAC complète
✅ Vérifier concepts juridiques clés
✅ Mesurer performance (temps, sources)
✅ Évaluer qualité globale
`)
    process.exit(0)
  }

  // Vérifier le mode
  const autoMode = process.argv.includes('--auto') || SESSION_TOKEN !== ''

  if (autoMode && SESSION_TOKEN) {
    // Mode automatique avec token
    await testWithToken(SESSION_TOKEN)
  } else if (autoMode && !SESSION_TOKEN) {
    console.error('❌ Erreur: Mode automatique nécessite un token de session')
    console.error('\nUtilisez:')
    console.error('  QADHYA_SESSION_TOKEN="votre-token" npm run test:prod:auto')
    console.error('\nOu utilisez le mode manuel:')
    console.error('  npm run test:prod')
    process.exit(1)
  } else {
    // Mode manuel guidé
    await testManual()
  }
}

// =============================================================================
// EXÉCUTION
// =============================================================================

main()
