'use server'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { aiConfig, SYSTEM_PROMPTS } from '@/lib/ai/config'
import { detectLanguage, type DetectedLanguage } from '@/lib/ai/language-utils'
import { translateQuery, isTranslationAvailable } from '@/lib/ai/translation-service'
import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'

// Types
export interface ConsultationSource {
  id: string
  titre: string
  type: string
  extrait: string
  pertinence: number
}

export interface ConsultationResponse {
  question: string
  conseil: string
  sources: ConsultationSource[]
  actions: string[]
}

interface ConsultationInput {
  question: string
  context?: string
  dossierId?: string
}

interface ActionResult {
  success: boolean
  data?: ConsultationResponse
  error?: string
}

// Labels bilingues pour le contexte dossier
const DOSSIER_LABELS = {
  fr: {
    header: 'DOSSIER LIÉ:',
    titre: 'Titre',
    numero: 'Numéro',
    typeAffaire: "Type d'affaire",
    description: 'Description',
    faits: 'Faits',
  },
  ar: {
    header: 'الملف المرتبط:',
    titre: 'العنوان',
    numero: 'الرقم',
    typeAffaire: 'نوع القضية',
    description: 'الوصف',
    faits: 'الوقائع',
  },
} as const

// Labels bilingues pour le prompt
const PROMPT_LABELS = {
  fr: {
    sourcesHeader: 'SOURCES DISPONIBLES:',
    noSources: 'Aucune source trouvée dans la base de connaissances.',
    questionHeader: "QUESTION DE L'UTILISATEUR:",
    contextHeader: 'CONTEXTE ADDITIONNEL:',
  },
  ar: {
    sourcesHeader: 'المصادر المتوفرة:',
    noSources: 'لم يتم العثور على مصادر في قاعدة المعرفة.',
    questionHeader: 'سؤال المستخدم:',
    contextHeader: 'سياق إضافي:',
  },
} as const

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

/**
 * Détermine la clé de langue pour les labels (ar ou fr)
 */
function getLangKey(lang: DetectedLanguage): 'ar' | 'fr' {
  return lang === 'ar' ? 'ar' : 'fr'
}

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
        const labels = DOSSIER_LABELS[langKey]
        dossierContext = `
${labels.header}
- ${labels.titre}: ${dossier.titre}
- ${labels.numero}: ${dossier.numero}
- ${labels.typeAffaire}: ${dossier.type_affaire}
- ${labels.description}: ${dossier.description || 'N/A'}
- ${labels.faits}: ${dossier.faits || 'N/A'}
`
      }
    }

    // Rechercher dans la base de connaissances (avec support traduction)
    const sources = await searchKnowledgeBase(input.question, session.user.id, questionLang)

    // Construire le contexte RAG
    const ragContext = sources
      .map(
        (s, i) =>
          `[Source ${i + 1}] ${s.titre} (${s.type}):\n${s.extrait}`
      )
      .join('\n\n')

    // Prompt système bilingue
    const labels = PROMPT_LABELS[langKey]
    const systemPrompt = `${SYSTEM_PROMPTS.qadhya}

${CONSULTATION_PROMPTS[langKey]}

${dossierContext}

${labels.sourcesHeader}
${ragContext || labels.noSources}

${labels.questionHeader}
${input.question}

${input.context ? `${labels.contextHeader}\n${input.context}` : ''}

${RESPONSE_FORMAT[langKey]}`

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

    return {
      success: true,
      data: {
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
 * Recherche simplifiée dans la base de connaissances
 * Avec support traduction pour les questions arabes
 */
async function searchKnowledgeBase(
  query: string,
  userId: string,
  questionLang: DetectedLanguage
): Promise<ConsultationSource[]> {
  try {
    const sources: ConsultationSource[] = []
    const searchTerms = query.split(' ').slice(0, 3).join('%')

    // Recherche avec les termes originaux
    const [docsResult, kbResult] = await Promise.all([
      db.query(
        `SELECT id, nom, type, contenu_extrait
         FROM documents
         WHERE nom ILIKE $1 OR contenu_extrait ILIKE $1
         LIMIT 5`,
        [`%${searchTerms}%`]
      ),
      db.query(
        `SELECT id, titre, type, contenu
         FROM knowledge_base
         WHERE titre ILIKE $1 OR contenu ILIKE $1
         LIMIT 5`,
        [`%${searchTerms}%`]
      ),
    ])

    for (const doc of docsResult.rows) {
      sources.push({
        id: doc.id,
        titre: doc.nom,
        type: doc.type || 'document',
        extrait: doc.contenu_extrait?.substring(0, 500) || '',
        pertinence: 0.75,
      })
    }

    for (const article of kbResult.rows) {
      sources.push({
        id: article.id,
        titre: article.titre,
        type: article.type || 'knowledge_base',
        extrait: article.contenu?.substring(0, 500) || '',
        pertinence: 0.8,
      })
    }

    // Si la question est en arabe, tenter une recherche traduite en FR
    if ((questionLang === 'ar' || questionLang === 'mixed') && isTranslationAvailable()) {
      const translation = await translateQuery(query, 'ar', 'fr')
      if (translation.success && translation.translatedText !== query) {
        const translatedTerms = translation.translatedText.split(' ').slice(0, 3).join('%')
        const seenIds = new Set(sources.map((s) => s.id))

        const [translatedDocsResult, translatedKbResult] = await Promise.all([
          db.query(
            `SELECT id, nom, type, contenu_extrait
             FROM documents
             WHERE nom ILIKE $1 OR contenu_extrait ILIKE $1
             LIMIT 5`,
            [`%${translatedTerms}%`]
          ),
          db.query(
            `SELECT id, titre, type, contenu
             FROM knowledge_base
             WHERE titre ILIKE $1 OR contenu ILIKE $1
             LIMIT 5`,
            [`%${translatedTerms}%`]
          ),
        ])

        for (const doc of translatedDocsResult.rows) {
          if (!seenIds.has(doc.id)) {
            sources.push({
              id: doc.id,
              titre: doc.nom,
              type: doc.type || 'document',
              extrait: doc.contenu_extrait?.substring(0, 500) || '',
              pertinence: 0.7, // Légèrement inférieur car traduit
            })
            seenIds.add(doc.id)
          }
        }

        for (const article of translatedKbResult.rows) {
          if (!seenIds.has(article.id)) {
            sources.push({
              id: article.id,
              titre: article.titre,
              type: article.type || 'knowledge_base',
              extrait: article.contenu?.substring(0, 500) || '',
              pertinence: 0.75,
            })
            seenIds.add(article.id)
          }
        }
      }
    }

    // Trier par pertinence et limiter
    return sources.sort((a, b) => b.pertinence - a.pertinence).slice(0, 5)
  } catch (error) {
    console.error('Erreur recherche KB:', error)
    return []
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
