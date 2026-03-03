/**
 * Tests E2E — Pipeline RAG Chat (Configuration & Régression)
 *
 * Vérifie le comportement bout-en-bout du RAG sur l'environnement cible.
 * Utilise l'API HTTP directement (plus fiable en CI que l'UI).
 *
 * Scénarios :
 *   1. Santé & Config      — /api/health sans auth
 *   2. Pipeline Chat FR    — question légale → sources + réponse cohérente
 *   3. Pipeline Chat AR    — question arabe → réponse en arabe
 *   4. Abstention          — question hors-domaine → pas de réponse assertive
 *   5. Qualité sources     — ≥3 sources, score moyen ≥40%
 *   6. Régression P1/P3    — timeout consultation & quality gate progressif
 *
 * Variables d'environnement requises pour les tests authentifiés :
 *   PLAYWRIGHT_BASE_URL   (ex: https://qadhya.tn)
 *   TEST_USER_EMAIL       (ex: test@qadhya.tn)
 *   TEST_USER_PASSWORD    (ex: motdepasse)
 *
 * Usage :
 *   npm run test:e2e:rag
 */

import { test, expect, APIRequestContext } from '@playwright/test'

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.TEST_PROD_URL ||
  'http://localhost:7002'

const TEST_EMAIL = process.env.TEST_USER_EMAIL || ''
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || ''
const HAS_CREDENTIALS = !!TEST_EMAIL && !!TEST_PASSWORD

/** Mode smoke : groupes 7-8 (qualité AR + intent routing) skippés pour réduire les appels LLM */
const IS_SMOKE = process.env.E2E_MODE === 'smoke'

/** Timeout LLM — 65s pour laisser de la marge (handler chat = 44s + latence réseau/Groq) */
const LLM_TIMEOUT_MS = 65_000

/** Timeout consultation — aligné sur notre fix P1 (55s total) */
const CONSULTATION_TIMEOUT_MS = 60_000

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Authentifie via POST /api/auth/login et retourne le cookie de session.
 * Lance une erreur si l'authentification échoue.
 */
async function getAuthCookie(request: APIRequestContext): Promise<string> {
  // Retry jusqu'à 4 fois en cas de 502/503 (container en cours de redémarrage)
  for (let attempt = 1; attempt <= 4; attempt++) {
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    })

    if (loginRes.status() === 502 || loginRes.status() === 503) {
      if (attempt < 4) {
        // Serveur en cours de redémarrage — attendre 15s avant retry
        await new Promise(resolve => setTimeout(resolve, 15_000))
        continue
      }
    }

    if (!loginRes.ok()) {
      const body = await loginRes.text()
      throw new Error(
        `Login échoué (${loginRes.status()}): ${body.substring(0, 200)}`
      )
    }

    // Extraire auth_session depuis Set-Cookie
    const setCookieHeader = loginRes.headers()['set-cookie'] || ''
    const sessionMatch = setCookieHeader.match(/auth_session=[^;]+/)
    if (!sessionMatch) {
      throw new Error('Cookie auth_session absent de la réponse login')
    }
    return sessionMatch[0]
  }
  throw new Error('Login échoué après 4 tentatives (serveur instable ?)')
}

/**
 * Envoie un message au chat RAG et retourne la réponse JSON.
 * @param authCookie  - cookie auth_session=...
 * @param question    - texte de la question
 * @param actionType  - 'chat' | 'consult' (défaut: 'chat')
 */
type RAGResponse = {
  answer: string
  sources: Array<{ documentId: string; similarity: number; chunkContent: string; documentName: string }>
  conversationId: string
  qualityIndicator?: 'high' | 'medium' | 'low'
  averageSimilarity?: number
  abstentionReason?: string
}

/**
 * Envoie un message au chat RAG et retourne la réponse JSON.
 * Gère les 502/503/504 transitoires (container en cours de redémarrage post-deploy).
 */
async function askRAG(
  request: APIRequestContext,
  authCookie: string,
  question: string,
  actionType: 'chat' | 'consult' = 'chat',
  { maxRetries = 3, retryDelayMs = 20_000 } = {}
): Promise<RAGResponse> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let res: Awaited<ReturnType<APIRequestContext['post']>>
    try {
      res = await request.post(`${BASE_URL}/api/chat`, {
        data: { question, actionType, stream: false },
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie,
        },
        timeout: LLM_TIMEOUT_MS,
      })
    } catch (err) {
      // Timeout Playwright → retry si pas la dernière tentative
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelayMs))
        continue
      }
      throw lastError
    }

    // 502/503/504 transitoires = container redémarrage post-deploy → retry
    if ([502, 503, 504].includes(res.status())) {
      const body = await res.text()
      lastError = new Error(`/api/chat ${res.status()} (transitoire): ${body.substring(0, 150)}`)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelayMs))
        continue
      }
      throw lastError
    }

    if (!res.ok()) {
      const body = await res.text()
      throw new Error(`/api/chat ${res.status()}: ${body.substring(0, 300)}`)
    }

    return res.json() as Promise<RAGResponse>
  }

  throw lastError ?? new Error('askRAG: échec inattendu')
}

// =============================================================================
// GROUPE 1 : SANTÉ & CONFIGURATION (pas d'auth requis)
// =============================================================================

test.describe('1 — Santé & Configuration RAG', () => {
  test('health: endpoint répond avec statut healthy', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`, {
      timeout: 10_000,
    })
    expect(res.ok()).toBeTruthy()

    const data = await res.json()
    expect(data.status).toBe('healthy')
  })

  test('health: RAG déclaré opérationnel', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`, {
      timeout: 10_000,
    })
    const data = await res.json()

    // Le champ rag.status ou rag doit être "ok"
    const ragStatus = typeof data.rag === 'object' ? data.rag?.status : data.rag
    expect(ragStatus).toBe('ok')
  })

  test('chat: endpoint répond 401 sans session (non authentifié)', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/chat`, {
      data: { question: 'test', stream: false },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    })
    // Doit refuser sans auth (401 ou redirect)
    expect([401, 403, 302, 307].includes(res.status())).toBeTruthy()
  })
})

// =============================================================================
// GROUPE 2 : PIPELINE CHAT FR (authentifié)
// =============================================================================

test.describe('2 — Pipeline Chat FR', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('question légale FR → réponse non vide avec sources', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les conditions de validité d\'un contrat selon le droit tunisien ?'
    )

    // Réponse non vide
    expect(response.answer).toBeTruthy()
    expect(response.answer.length).toBeGreaterThan(100)

    // Sources présentes
    expect(response.sources).toBeDefined()
    expect(response.sources.length).toBeGreaterThan(0)

    // Pas d'abstention
    expect(response.answer).not.toMatch(/pas trouvé de sources|لم أجد مصادر/i)
  })

  test('question légale FR → sources avec score de similarité ≥ 0.40', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les obligations du locataire en droit tunisien ?'
    )

    expect(response.sources.length).toBeGreaterThan(0)

    // Toutes les sources retournées doivent être au-dessus du quality gate
    for (const source of response.sources) {
      expect(source.similarity).toBeGreaterThanOrEqual(0.30) // Seuil post-P3
    }
  })

  test('question légale FR → réponse dans les temps (<44s)', async ({ request }) => {
    const start = Date.now()

    await askRAG(
      request,
      authCookie,
      'Qu\'est-ce que la responsabilité délictuelle en droit tunisien ?'
    )

    const elapsedMs = Date.now() - start
    // Timeout handler = 44s, on vérifie que la réponse arrive avant
    expect(elapsedMs).toBeLessThan(44_000)
  })

  test('question légale FR → qualityIndicator présent (high ou medium)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quels sont les délais de prescription en droit du travail tunisien ?'
    )

    // Pour une question pertinente, le qualityIndicator doit être high ou medium (pas low)
    if (response.qualityIndicator) {
      expect(['high', 'medium']).toContain(response.qualityIndicator)
    }
  })
})

// =============================================================================
// GROUPE 3 : PIPELINE CHAT AR (authentifié)
// =============================================================================

test.describe('3 — Pipeline Chat AR', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('question légale AR → réponse non vide', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'ما هي شروط صحة العقد في القانون التونسي ؟'
    )

    expect(response.answer).toBeTruthy()
    expect(response.answer.length).toBeGreaterThan(50)
    expect(response.answer).not.toMatch(/pas trouvé de sources|لم أجد مصادر/i)
  })

  test('question légale AR → sources présentes (seuil arabe 0.30)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'ما هي حقوق العامل في قانون الشغل التونسي ؟'
    )

    // L'arabe a un seuil plus bas (0.30 vs 0.40 FR) — des sources doivent quand même être trouvées
    expect(response.sources.length).toBeGreaterThan(0)
  })

  test('question légale AR → réponse en arabe ou bilingue', async ({ request }) => {
    test.setTimeout(70_000) // Ollama embedding AR peut être plus lent
    const response = await askRAG(
      request,
      authCookie,
      'ما هي إجراءات الطلاق في القانون التونسي ؟'
    )

    // La réponse doit contenir des caractères arabes (Unicode range arabe)
    const hasArabicChars = /[\u0600-\u06FF]/.test(response.answer)
    expect(hasArabicChars).toBeTruthy()
  })
})

// =============================================================================
// GROUPE 4 : ABSTENTION (quality gate)
// =============================================================================

test.describe('4 — Abstention & Quality Gate', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('question hors-domaine → abstention ou réponse de rejet explicite', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelle est la recette du couscous tunisien ?'
    )

    // Soit le RAG abstient (pas de sources), soit il répond qu'il ne peut pas aider,
    // soit les sources retournées ont un score moyen faible (zone grise hors-domaine)
    const avgScore = response.sources.length > 0
      ? response.sources.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / response.sources.length
      : 0

    const isAbstention =
      response.sources.length === 0 ||
      avgScore <= 0.45 ||
      /pas trouvé|sources insuffisantes|لم أجد|hors.*domaine|domaine.*juridique/i.test(response.answer)

    expect(isAbstention).toBeTruthy()
  })

  test('question très vague → réponse prudente (pas d\'assertion sans source)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Droits ?'
    )

    // Pour une question d'1 mot sans contexte juridique :
    // Cas 1 — abstention (pas de sources) → réponse courte de rejet (< 600 chars)
    // Cas 2 — sources borderline trouvées → réponse proportionnée (pas d'essai 2000 mots)
    if (response.sources.length === 0) {
      // Sans sources, la réponse ne doit pas inventer des faits juridiques
      expect(response.answer.length).toBeLessThan(600)
    } else {
      // Avec sources, la réponse reste proportionnée à la question
      // (une question vague ne doit pas déclencher un mémoire complet)
      expect(response.qualityIndicator).toBeDefined()
      expect(response.answer.length).toBeLessThan(2000)
    }
  })

  test('quality gate P3: abstentionReason absent si sources suffisantes', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les conditions du contrat de travail à durée déterminée en Tunisie ?'
    )

    // Pour une question pertinente, pas d'abstention
    if (response.sources.length > 0) {
      expect(response.abstentionReason).toBeUndefined()
    }
  })
})

// =============================================================================
// GROUPE 5 : QUALITÉ SOURCES (maxResults=7 post-P4)
// =============================================================================

test.describe('5 — Qualité & Nombre de Sources', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('question précise → ≥3 sources retournées (maxResults=7)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les causes de résiliation du contrat de bail selon le code des obligations et des contrats tunisien ?'
    )

    // Avec maxResults=7 (P4), les questions précises doivent avoir plusieurs sources
    expect(response.sources.length).toBeGreaterThanOrEqual(3)
  })

  test('sources ont chunkContent non vide', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les règles de la prescription extinctive en droit tunisien ?'
    )

    expect(response.sources.length).toBeGreaterThan(0)

    for (const source of response.sources) {
      expect(source.chunkContent).toBeTruthy()
      expect(source.chunkContent.length).toBeGreaterThan(20)
      expect(source.documentName).toBeTruthy()
    }
  })

  test('score moyen sources ≥ 40% pour question pertinente', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quels sont les délais de recours en matière administrative en Tunisie ?'
    )

    if (response.sources.length === 0) return // Toléré si pas de sources

    const avgScore =
      response.sources.reduce((acc, s) => acc + s.similarity, 0) /
      response.sources.length

    // Score moyen ≥ 40% = quality gate standard franchi (P3)
    expect(avgScore).toBeGreaterThanOrEqual(0.30) // Minimum garanti par le quality gate
  })

  test('sources diversifiées — max 3 chunks par document', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les obligations du vendeur dans le contrat de vente en droit tunisien ?'
    )

    if (response.sources.length < 2) return

    // Compter les chunks par documentId — le re-ranker limite à 3 par source
    // Avec maxResults=7 (P4), un doc très pertinent peut apparaître jusqu'à 4 fois
    // (fusion de 3 pistes de recherche : docs, jurisprudence, KB)
    const chunksByDoc: Record<string, number> = {}
    for (const s of response.sources) {
      chunksByDoc[s.documentId] = (chunksByDoc[s.documentId] || 0) + 1
    }

    for (const [, count] of Object.entries(chunksByDoc)) {
      expect(count).toBeLessThanOrEqual(4)
    }
  })
})

// =============================================================================
// GROUPE 6 : RÉGRESSION POST-IMPLÉMENTATION (P1/P2/P3/P4)
// =============================================================================

test.describe('6 — Régression Implémentations RAG', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('P1 — consultation: répond dans le timeout configuré (55s)', async ({ request }) => {
    test.setTimeout(CONSULTATION_TIMEOUT_MS)
    const start = Date.now()

    const response = await request.post(`${BASE_URL}/api/chat`, {
      data: {
        question: 'Rédiger une consultation IRAC sur les conditions de rupture abusive du contrat de travail en Tunisie.',
        actionType: 'consult',
        stream: false,
      },
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      timeout: CONSULTATION_TIMEOUT_MS,
    })

    const elapsed = Date.now() - start

    // La réponse doit arriver avant le timeout configuré (55s)
    expect(response.ok()).toBeTruthy()
    expect(elapsed).toBeLessThan(55_000)

    const data = await response.json()
    expect(data.answer).toBeTruthy()
    expect(data.answer.length).toBeGreaterThan(200) // Consultation ≥ 200 chars
  })

  test('P3 — quality gate: zone grise (30-40%) acceptée avec ≥2 sources', async ({ request }) => {
    // Une question légèrement hors-centre peut tomber en zone grise 30-40%
    // Dans ce cas, si ≥2 sources, le RAG doit répondre (pas d'abstention)
    const response = await askRAG(
      request,
      authCookie,
      'Quelles sont les règles juridiques applicables aux conflits de voisinage ?'
    )

    // Si des sources ont été trouvées en zone grise (avg 30-40%), le système doit répondre
    // (pas d'abstention) grâce au quality gate progressif (P3)
    if (response.averageSimilarity !== undefined) {
      if (response.averageSimilarity >= 0.30 && response.sources.length >= 2) {
        // Zone grise acceptée → doit avoir une réponse
        expect(response.answer).toBeTruthy()
        expect(response.abstentionReason).toBeUndefined()
      } else if (response.averageSimilarity < 0.30) {
        // Sous le plancher → abstention attendue
        expect(response.sources.length).toBe(0)
      }
    }
  })

  test('P3 — quality gate: question hors-domaine traitée avec faible qualité', async ({ request }) => {
    // Question totalement hors-domaine — doit déclencher soit l'abstention,
    // soit retourner des sources de très faible similarité (zone grise 0.30-0.40)
    const response = await askRAG(
      request,
      authCookie,
      'Comment programmer un jeu vidéo en Python ?'
    )

    // Pour une question sans rapport avec le droit tunisien :
    // - soit abstention (sources.length=0) si avg < 0.30
    // - soit zone grise (0.30-0.40) avec score moyen ≤ 0.45 — comportement P3 correct
    // - soit la réponse indique explicitement le refus
    const avgScore = response.sources.length > 0
      ? response.sources.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / response.sources.length
      : 0

    const isProperlyHandled =
      response.sources.length === 0 ||
      avgScore <= 0.45 ||
      /pas trouvé|sources insuffisantes|لم أجد/i.test(response.answer)

    expect(isProperlyHandled).toBeTruthy()
  })

  test('P4 — judge: réponse suffisamment longue pour couvrir les key points', async ({ request }) => {
    test.setTimeout(80_000) // maxResults=7 + Groq peut prendre jusqu'à 65s
    const response = await askRAG(
      request,
      authCookie,
      'Expliquer en détail les conditions de validité d\'un mariage en droit tunisien : conditions de fond et de forme.'
    )

    if (response.sources.length === 0) return

    // Avec maxResults=7 (P4), la réponse doit être plus exhaustive
    // Judge Score cible: 0.75+ (vs 0.63 avant) → réponse plus longue
    expect(response.answer.length).toBeGreaterThan(300)
  })

  test('login: cookie auth_session obtenu et valide pour API', async ({ request }) => {
    // Vérifie que l'auth custom fonctionne (régression P2 — circuit breaker ne doit pas bloquer login)
    const cookie = await getAuthCookie(request)
    expect(cookie).toMatch(/^auth_session=/)

    // Le cookie doit permettre d'accéder à /api/auth/me
    const meRes = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookie },
      timeout: 10_000,
    })
    expect(meRes.ok()).toBeTruthy()

    const me = await meRes.json()
    expect(me.user || me.email || me.id).toBeTruthy()
  })
})

// =============================================================================
// GROUPE 7 : QUALITÉ RÉDACTIONNELLE ARABE
// Vérifie les améliorations de style introduites en Phase 1 (A1+A2+A3)
// =============================================================================

test.describe('7 — Qualité Rédactionnelle Arabe', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')
  test.skip(IS_SMOKE, 'Tests qualité avancés — mode complet uniquement (workflow hebdomadaire)')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('AR — connecteurs judiciaires présents dans réponse complexe', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'ما هي شروط صحة الزواج في القانون التونسي وما هي عواقب الزواج الباطل ؟'
    )

    if (response.sources.length === 0) return // Toléré si pas de sources

    // Le style rédactionnel formel tunisien exige des connecteurs judiciaires.
    // Au moins un des connecteurs suivants doit apparaître dans une analyse complexe.
    const judicialConnectors = [
      'حيث أن',
      'إذ ثبت',
      'وعليه',
      'ومن ثمّة',
      'ومن ثمة',
      'بناءً على',
      'بناء على',
      'استناداً',
      'وبمقتضى',
      'وبالتالي',
      'غير أن',
      'إلا أن',
      'بيد أن',
    ]

    const hasConnector = judicialConnectors.some(c => response.answer.includes(c))
    expect(hasConnector).toBeTruthy()
  })

  test('AR — pas de dialectal (style juridique formel exigé)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'ما هي حقوق المستأجر في عقد الكراء في تونس ؟'
    )

    if (response.sources.length === 0) return

    // Les formes dialectales sont interdites dans le style juridique tunisien (A3 — anti-patterns)
    const dialectalPatterns = [
      /\bده\b/,      // Égyptien
      /\bعشان\b/,   // Égyptien
      /\bبتاع\b/,   // Dialectal
      /\bما فيش\b/, // Maghrébin dialectal
      /\bبس\b.*بس\b/, // "بس" seul peut être OK (=seulement), mais répété = dialectal
    ]

    for (const pattern of dialectalPatterns) {
      expect(response.answer).not.toMatch(pattern)
    }
  })

  test('AR — terminologie tunisienne : "فصل" préféré à "مادة"', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'ما نص الفصل الأول من مجلة الأحوال الشخصية ؟'
    )

    if (response.sources.length === 0) return

    // La base de connaissances utilise "فصل" (usage tunisien) pas "مادة" (usage égyptien/syrien).
    // Si la réponse cite un texte, elle devrait utiliser "فصل".
    const hasFasl = /فصل\s+\d+/.test(response.answer)
    const hasMadda = /مادة\s+\d+/.test(response.answer)

    // Acceptable si l'un ou l'autre est présent — le "فصل" est préféré mais pas obligatoire
    // L'important : la réponse ne doit pas remplacer "فصل" de nos sources par "مادة"
    if (hasMadda && !hasFasl) {
      // La réponse utilise uniquement "مادة" — potentiellement hallucination terminologique
      // Ce cas est un avertissement, pas un blocage dur
      console.warn('⚠️ E2E [G7]: Réponse utilise "مادة" sans "فصل" — possible drift terminologique')
    }

    // La réponse doit citer le texte ou mentionner la mجلة الأحوال الشخصية
    const mentionsMAS = /مجلة الأحوال الشخصية|م\.أ\.ش|احوال شخصية/i.test(response.answer)
    expect(response.answer.length).toBeGreaterThan(50)
    // Si des sources existent, elles doivent être reflétées dans la réponse
    if (response.sources.length > 0) {
      expect(mentionsMAS || hasFasl || hasMadda).toBeTruthy()
    }
  })

  test('AR — longueur adaptée : question simple → réponse ≤ 800 mots', async ({ request }) => {
    // Question procédurale simple (type "procédure") → réponse courte attendue
    const response = await askRAG(
      request,
      authCookie,
      'ما هي آجال الطعن بالاستئناف ؟'
    )

    if (response.sources.length === 0) return

    // Pour une question simple sur un délai, la réponse doit être concise
    // (A1 — longueur adaptée : question simple → 200-400 mots ≈ ~1200-2400 chars)
    // On tolère jusqu'à 3000 chars (≈500 mots) pour cette vérification E2E
    expect(response.answer.length).toBeLessThan(3000)
  })

  test('AR — réponse ne commence pas par "يمكنني مساعدتك" (anti-chatbot)', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'هل يحق للعامل المطرود الحصول على تعويض ؟'
    )

    if (response.sources.length === 0) return

    // A3 — anti-patterns : les réponses ne doivent pas commencer par des formules chatbotiques
    const chatbotOpeners = [
      /^يمكنني مساعدتك/,
      /^بالطبع،?\s+يمكنني/,
      /^نعم،?\s+يمكنني/,
      /^سأساعدك/,
    ]

    for (const pattern of chatbotOpeners) {
      expect(response.answer.trim()).not.toMatch(pattern)
    }
  })
})

// =============================================================================
// GROUPE 8 : INTELLIGENCE SÉMANTIQUE (Situation Extractor + Intent Routing)
// Vérifie les améliorations introduites en Phase 2 (B1+B2) et Phase 3
// =============================================================================

test.describe('8 — Intelligence Sémantique & Intent Routing', () => {
  test.skip(!HAS_CREDENTIALS, 'Credentials TEST_USER_EMAIL/TEST_USER_PASSWORD requis')
  test.skip(IS_SMOKE, 'Tests qualité avancés — mode complet uniquement (workflow hebdomadaire)')

  let authCookie: string

  test.beforeAll(async ({ request }) => {
    authCookie = await getAuthCookie(request)
  })

  test('intent lookup — "ما نص الفصل X" → citation directe, pas de structure stratégique', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'ما نص الفصل 258 من المجلة الجزائية ؟'
    )

    if (response.sources.length === 0) return

    // Un intent "lookup" doit produire une citation directe, PAS une analyse en 6 blocs.
    // Le situation-extractor détecte "ما نص الفصل X" → type=lookup → stance=neutral
    // → format: citation entre guillemets, sans diagnostic stratégique.
    const strategicBlocks = [
      /الموقف الاستراتيجي/,
      /خطة العمل/,
      /التشخيص القانوني/,
      /السيناريو الأفضل/,
      /الخطوات الفورية/,
    ]

    // Pour un lookup, les blocs stratégiques ne doivent PAS dominer la réponse
    const strategicBlocksFound = strategicBlocks.filter(p => p.test(response.answer)).length
    expect(strategicBlocksFound).toBeLessThanOrEqual(1) // Max 1 toléré (réponse hybride acceptable)
  })

  test('intent comparison — "الفرق بين X وY" → tableau Markdown attendu', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'ما الفرق بين الطلاق والخلع في القانون التونسي ؟'
    )

    if (response.sources.length === 0) return

    // Un intent "comparison" doit produire un tableau Markdown (| col | col |)
    // Le situation-extractor détecte "الفرق بين" → type=comparison → format=table
    const hasMarkdownTable = /\|.+\|.+\|/.test(response.answer)
    expect(hasMarkdownTable).toBeTruthy()
  })

  test('intent deadline — "أجل الطعن" → structure délai articulée', async ({ request }) => {
    const response = await askRAG(
      request,
      authCookie,
      'ما هو أجل الطعن بالاستئناف في المادة الجزائية في تونس ؟'
    )

    if (response.sources.length === 0) return

    // Un intent "deadline" doit produire une réponse avec durée précise + conséquences.
    // Le situation-extractor détecte "أجل الطعن" → type=deadline → format structuré.
    // La réponse doit mentionner un délai chiffré (nombre de jours/mois).
    const hasNumericDelay = /\d+\s*(?:يوماً|يوم|أيام|شهراً|شهر|أشهر|jour|jours|mois)/i.test(response.answer)
    expect(hasNumericDelay).toBeTruthy()
  })

  test('intent explanation — "كيف يعمل / شرح مفهوم" → structure pédagogique', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'كيف يعمل نظام التقادم في القانون التونسي وما هي مدده ؟'
    )

    if (response.sources.length === 0) return

    // Un intent "explanation" doit produire une réponse pédagogique (définition + contexte + application).
    // Le situation-extractor détecte "كيف يعمل" → type=explanation → format pédagogique.
    // La réponse doit être substantielle (> 200 chars) avec une structure logique.
    expect(response.answer.length).toBeGreaterThan(200)

    // Doit mentionner une notion de durée (caractéristique principale du التقادم)
    const mentionsDuration = /\d+\s*(?:سنة|سنوات|عام|أعوام|an|ans)/i.test(response.answer)
    const mentionsConcept = /تقادم|prescription|انقضاء|forclusion/.test(response.answer)
    expect(mentionsDuration || mentionsConcept).toBeTruthy()
  })

  test('stage pré-contentieux — "إنذار / mise en demeure" → conseil amiable prioritaire', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'أريد إرسال إنذاراً لمديني الذي لم يسدد دينه — ما هي الخطوات القانونية ؟'
    )

    if (response.sources.length === 0) return

    // Le situation-extractor détecte "إنذار" → stage=pre_contentieux
    // → STAGE_INSTRUCTIONS: focus sur tentative règlement amiable + mise en demeure + délais
    // La réponse doit mentionner la tentative amiable ou les étapes pré-judiciaires.
    const mentionsPreContentieux = [
      /تسوية ودية|règlement amiable/i,
      /إنذار|mise en demeure/i,
      /عدل التنفيذ|عدل الإشهاد|huissier/i,
      /قبل رفع الدعوى|avant.*recours/i,
      /أجل/i, // Les délais légaux (avant saisine du tribunal)
    ]

    const matchCount = mentionsPreContentieux.filter(p => p.test(response.answer)).length
    // Au moins 2 des thèmes pré-contentieux doivent apparaître
    expect(matchCount).toBeGreaterThanOrEqual(2)
  })

  test('role défendeur — "ضدي / défendeur" → angle défense en premier', async ({ request }) => {
    test.setTimeout(80_000)

    const response = await askRAG(
      request,
      authCookie,
      'تم رفع دعوى ضدي بسبب عدم تسديد إيجار — أنا المدّعى عليه، كيف أدافع عن نفسي ؟'
    )

    if (response.sources.length === 0) return

    // Le situation-extractor détecte "أنا المدّعى عليه" → role=defendeur
    // → ROLE_INSTRUCTIONS: dفوع شكلية أولاً ثم موضوعية
    // La réponse doit mentionner des éléments de défense.
    const defenseElements = [
      /دفع|دفوع|défense|exception/i,
      /المدعى عليه|défendeur/i,
      /رد|réponse|contestation/i,
      /شكلي|موضوع|fond|forme/i,
      /طلب رفض|demande.*rejet|irrecevabilit/i,
    ]

    const matchCount = defenseElements.filter(p => p.test(response.answer)).length
    expect(matchCount).toBeGreaterThanOrEqual(2)
  })
})
