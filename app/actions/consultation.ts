'use server'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { aiConfig, SYSTEM_PROMPTS } from '@/lib/ai/config'
import { detectLanguage, type DetectedLanguage } from '@/lib/ai/language-utils'
import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'
import {
  searchKnowledgeBase,
  formatRagContext,
  type RagSearchResult as SharedRagSearchResult,
} from '@/lib/ai/shared/rag-search'
import {
  DOSSIER_LABELS,
  PROMPT_LABELS,
  getLangKey,
  formatDossierContext,
} from '@/lib/ai/shared/bilingual-labels'
import {
  getSystemPromptForContext,
  type LegalStance,
} from '@/lib/ai/legal-reasoning-prompts'

// Types
export interface ConsultationSource {
  id: string
  titre: string
  type: string
  extrait: string
  pertinence: number
}

export interface ConsultationResponse {
  id?: string
  question: string
  conseil: string
  sources: ConsultationSource[]
  actions: string[]
  domain?: string
  createdAt?: string
}

interface ConsultationInput {
  question: string
  context?: string
  dossierId?: string
  stance?: LegalStance
}

interface ActionResult {
  success: boolean
  data?: ConsultationResponse
  error?: string
}

export interface ConsultationHistoryItem {
  id: string
  question: string
  domain: string | null
  created_at: string
}

// SUPPRIMÉ : Labels déplacés vers lib/ai/shared/bilingual-labels.ts
// Utiliser les imports DOSSIER_LABELS et PROMPT_LABELS ci-dessus

// Prompt consultation bilingue
const CONSULTATION_PROMPTS = {
  fr: `MODE CONSULTATION:
Tu es en mode consultation juridique rapide. L'utilisateur te pose une question juridique et attend un conseil clair et actionnable.

INSTRUCTIONS SPÉCIFIQUES:
1. Fournis un conseil juridique structuré et pratique
2. Cite les articles de loi pertinents avec le format [Source N]
3. Termine par 2-4 actions recommandées concrètes
4. Reste concis mais complet (réponse de 200-400 mots idéalement)`,
  ar: `وضع الاستشارة القانونية السريعة:
أنت في وضع الاستشارة القانونية السريعة. المستخدم يطرح عليك سؤالاً قانونياً وينتظر نصيحة واضحة وقابلة للتطبيق.

تعليمات محددة:
1. قدّم نصيحة قانونية منظمة وعملية
2. استشهد بالمواد القانونية ذات الصلة بصيغة [Source N]
3. اختم بـ 2-4 إجراءات موصى بها وملموسة
4. كن موجزاً ولكن شاملاً (200-400 كلمة مثالياً)`,
} as const

const RESPONSE_FORMAT = {
  fr: `FORMAT DE RÉPONSE:
Fournis ta réponse en Markdown avec:
- Un conseil juridique clair
- Les références aux articles de loi
- Les citations des sources avec [Source N]

À LA FIN, ajoute une section "## Actions Recommandées" avec une liste numérotée de 2-4 actions concrètes.`,
  ar: `صيغة الرد:
قدّم ردك بصيغة Markdown مع:
- نصيحة قانونية واضحة
- الإشارة إلى المواد القانونية
- الاستشهاد بالمصادر بصيغة [Source N]

في النهاية، أضف قسم "## الإجراءات الموصى بها" مع قائمة مرقمة من 2-4 إجراءات ملموسة.`,
} as const

// SUPPRIMÉ : Fonction déplacée vers lib/ai/shared/bilingual-labels.ts
// Utiliser l'import getLangKey ci-dessus

/**
 * Server action pour soumettre une consultation juridique
 */
export async function submitConsultation(input: ConsultationInput): Promise<ActionResult> {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { success: false, error: 'Non autorisé' }
    }

    // Détecter la langue de la question
    const questionLang = detectLanguage(input.question)
    const langKey = getLangKey(questionLang)

    // Récupérer le contexte du dossier si fourni
    let dossierContext = ''
    if (input.dossierId) {
      const dossierResult = await db.query(
        `SELECT titre, numero, type_affaire, description, faits
         FROM dossiers
         WHERE id = $1 AND user_id = $2`,
        [input.dossierId, session.user.id]
      )

      if (dossierResult.rows.length > 0) {
        const dossier = dossierResult.rows[0]
        dossierContext = formatDossierContext(dossier, langKey)
      }
    }

    // Rechercher dans la base de connaissances (avec support traduction)
    const sources = await searchKnowledgeBase(input.question, {
      maxResults: 5,
      includeTranslation: true,
      userId: session.user.id,
    })

    // Construire le contexte RAG
    const ragContext = formatRagContext(sources)

    // Prompt système via getSystemPromptForContext (inclut posture défense/attaque/neutre)
    const labels = PROMPT_LABELS[langKey]
    const supportedLang = questionLang === 'fr' ? 'fr' : 'ar'
    const stance = input.stance ?? 'defense'
    const systemPrompt = `${getSystemPromptForContext('consultation', supportedLang, stance)}

${dossierContext}

${labels.sourcesHeader}
${ragContext || labels.noSources}

${labels.questionHeader}
${input.question}

${input.context ? `${labels.contextHeader}\n${input.context}` : ''}`

    // Appeler le LLM avec fallback automatique (Groq → DeepSeek → Anthropic → OpenAI)
    const llmResponse = await callLLMWithFallback(
      [{ role: 'user', content: systemPrompt }],
      {
        temperature: 0.3,
        maxTokens: 2000,
      }
    )

    const conseil = llmResponse.answer

    // Log du provider utilisé (pour monitoring)
    if (llmResponse.fallbackUsed) {
      console.log(
        `[Consultation] Fallback utilisé: ${llmResponse.originalProvider} → ${llmResponse.provider}`
      )
    }

    // Extraire les actions recommandées du conseil
    const actions = extractActions(conseil)

    // Nettoyer le conseil (retirer la section actions qui sera affichée séparément)
    const cleanedConseil = conseil
      .replace(/## Actions Recommandées[\s\S]*$/i, '')
      .replace(/## الإجراءات الموصى بها[\s\S]*$/, '')
      .trim()

    // Sauvegarder la consultation en DB
    const consultationId = await saveConsultation({
      userId: session.user.id,
      dossierId: input.dossierId,
      question: input.question,
      context: input.context,
      conseil: cleanedConseil,
      sources,
      actions,
    })

    return {
      success: true,
      data: {
        id: consultationId,
        question: input.question,
        conseil: cleanedConseil,
        sources,
        actions,
      },
    }
  } catch (error) {
    console.error('Erreur consultation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur interne',
    }
  }
}

/**
 * Sauvegarde une consultation en base de données
 */
async function saveConsultation(params: {
  userId: string
  dossierId?: string
  question: string
  context?: string
  conseil: string
  sources: ConsultationSource[]
  actions: string[]
}): Promise<string | undefined> {
  try {
    const result = await db.query(
      `INSERT INTO consultations (user_id, dossier_id, question, context, conseil, sources, actions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        params.userId,
        params.dossierId || null,
        params.question,
        params.context || null,
        params.conseil,
        JSON.stringify(params.sources),
        JSON.stringify(params.actions),
      ]
    )
    return result.rows[0]?.id
  } catch (error) {
    console.error('[Consultation] Erreur sauvegarde:', error)
    return undefined
  }
}

/**
 * Récupère l'historique des consultations d'un utilisateur
 */
export async function getConsultationHistory(
  limit: number = 50
): Promise<{ success: boolean; data?: ConsultationHistoryItem[]; error?: string }> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { success: false, error: 'Non autorisé' }
    }

    const result = await db.query(
      `SELECT id, question, domain, created_at
       FROM consultations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [session.user.id, limit]
    )

    return { success: true, data: result.rows }
  } catch (error) {
    console.error('[Consultation] Erreur historique:', error)
    return { success: false, error: 'Erreur interne' }
  }
}

/**
 * Récupère une consultation complète par ID
 */
export async function getConsultationById(
  id: string
): Promise<{ success: boolean; data?: ConsultationResponse; error?: string }> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { success: false, error: 'Non autorisé' }
    }

    const result = await db.query(
      `SELECT id, question, context, conseil, sources, actions, domain, created_at
       FROM consultations
       WHERE id = $1 AND user_id = $2`,
      [id, session.user.id]
    )

    if (result.rows.length === 0) {
      return { success: false, error: 'Consultation non trouvée' }
    }

    const row = result.rows[0]
    return {
      success: true,
      data: {
        id: row.id,
        question: row.question,
        conseil: row.conseil,
        sources: row.sources || [],
        actions: row.actions || [],
        domain: row.domain,
        createdAt: row.created_at,
      },
    }
  } catch (error) {
    console.error('[Consultation] Erreur get by id:', error)
    return { success: false, error: 'Erreur interne' }
  }
}

/**
 * @deprecated Ces fonctions sont dépréciées et ne sont plus utilisées.
 * Utiliser callLLMWithFallback() du service llm-fallback-service.ts à la place,
 * qui gère automatiquement le fallback entre providers (Groq → DeepSeek → Anthropic → OpenAI).
 *
 * Ces fonctions peuvent être supprimées dans une prochaine version.
 */

// /**
//  * Appel à Groq
//  */
// async function callGroq(prompt: string): Promise<string> {
//   const response = await fetch(`${aiConfig.groq.baseUrl}/chat/completions`, {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${aiConfig.groq.apiKey}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: aiConfig.groq.model,
//       messages: [{ role: 'user', content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.3,
//     }),
//   })

//   if (!response.ok) {
//     throw new Error(`Erreur Groq: ${response.status}`)
//   }

//   const data = await response.json()
//   return data.choices[0]?.message?.content || ''
// }

// /**
//  * Appel à Anthropic
//  */
// async function callAnthropic(prompt: string): Promise<string> {
//   const response = await fetch('https://api.anthropic.com/v1/messages', {
//     method: 'POST',
//     headers: {
//       'x-api-key': aiConfig.anthropic.apiKey,
//       'anthropic-version': '2023-06-01',
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: aiConfig.anthropic.model,
//       max_tokens: 2000,
//       messages: [{ role: 'user', content: prompt }],
//     }),
//   })

//   if (!response.ok) {
//     throw new Error(`Erreur Anthropic: ${response.status}`)
//   }

//   const data = await response.json()
//   return data.content[0]?.text || ''
// }

// /**
//  * Appel à Ollama
//  */
// async function callOllama(prompt: string): Promise<string> {
//   const response = await fetch(`${aiConfig.ollama.baseUrl}/api/chat`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: aiConfig.ollama.chatModel,
//       messages: [{ role: 'user', content: prompt }],
//       stream: false,
//     }),
//   })

//   if (!response.ok) {
//     throw new Error(`Erreur Ollama: ${response.status}`)
//   }

//   const data = await response.json()
//   return data.message?.content || ''
// }

/**
 * Extrait les actions recommandées du texte (FR et AR)
 */
function extractActions(text: string): string[] {
  // Matcher les deux patterns : FR et AR
  const actionsMatch =
    text.match(/## Actions Recommandées[\s\S]*/i) ||
    text.match(/## الإجراءات الموصى بها[\s\S]*/)
  if (!actionsMatch) return []

  const actionsSection = actionsMatch[0]
  const lines = actionsSection.split('\n')

  const actions: string[] = []
  for (const line of lines) {
    // Supporte numérotation latine et arabe (١٢٣...)
    const match = line.match(/^[\d١٢٣٤٥٦٧٨٩٠]+[.\.]\s*(.+)$/)
    if (match) {
      actions.push(match[1].trim())
    }
  }

  return actions.slice(0, 5)
}
