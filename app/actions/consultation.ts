'use server'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getChatProvider, aiConfig, SYSTEM_PROMPTS } from '@/lib/ai/config'

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
        dossierContext = `
DOSSIER LIÉ:
- Titre: ${dossier.titre}
- Numéro: ${dossier.numero}
- Type d'affaire: ${dossier.type_affaire}
- Description: ${dossier.description || 'N/A'}
- Faits: ${dossier.faits || 'N/A'}
`
      }
    }

    // Rechercher dans la base de connaissances (simplifiée)
    const sources = await searchKnowledgeBase(input.question, session.user.id)

    // Construire le contexte RAG
    const ragContext = sources
      .map(
        (s, i) =>
          `[Source ${i + 1}] ${s.titre} (${s.type}):\n${s.extrait}`
      )
      .join('\n\n')

    // Prompt système optimisé pour consultation
    const systemPrompt = `${SYSTEM_PROMPTS.qadhya}

MODE CONSULTATION:
Tu es en mode consultation juridique rapide. L'utilisateur te pose une question juridique et attend un conseil clair et actionnable.

INSTRUCTIONS SPÉCIFIQUES:
1. Fournis un conseil juridique structuré et pratique
2. Cite les articles de loi pertinents avec le format [Source N]
3. Termine par 2-4 actions recommandées concrètes
4. Reste concis mais complet (réponse de 200-400 mots idéalement)

${dossierContext}

SOURCES DISPONIBLES:
${ragContext || 'Aucune source trouvée dans la base de connaissances.'}

QUESTION DE L'UTILISATEUR:
${input.question}

${input.context ? `CONTEXTE ADDITIONNEL:\n${input.context}` : ''}

FORMAT DE RÉPONSE:
Fournis ta réponse en Markdown avec:
- Un conseil juridique clair
- Les références aux articles de loi
- Les citations des sources avec [Source N]

À LA FIN, ajoute une section "## Actions Recommandées" avec une liste numérotée de 2-4 actions concrètes.`

    // Appeler le LLM
    const provider = getChatProvider()
    let conseil = ''

    if (provider === 'groq') {
      conseil = await callGroq(systemPrompt)
    } else if (provider === 'anthropic') {
      conseil = await callAnthropic(systemPrompt)
    } else if (provider === 'ollama') {
      conseil = await callOllama(systemPrompt)
    } else {
      return { success: false, error: 'Aucun provider LLM disponible' }
    }

    // Extraire les actions recommandées du conseil
    const actions = extractActions(conseil)

    // Nettoyer le conseil (retirer la section actions qui sera affichée séparément)
    const cleanedConseil = conseil
      .replace(/## Actions Recommandées[\s\S]*$/i, '')
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
 */
async function searchKnowledgeBase(
  query: string,
  userId: string
): Promise<ConsultationSource[]> {
  try {
    const sources: ConsultationSource[] = []
    const searchTerms = query.split(' ').slice(0, 3).join('%')

    // Recherche textuelle simple dans les documents
    const docsResult = await db.query(
      `SELECT id, nom, type, contenu_extrait
       FROM documents
       WHERE nom ILIKE $1 OR contenu_extrait ILIKE $1
       LIMIT 5`,
      [`%${searchTerms}%`]
    )

    for (const doc of docsResult.rows) {
      sources.push({
        id: doc.id,
        titre: doc.nom,
        type: doc.type || 'document',
        extrait: doc.contenu_extrait?.substring(0, 500) || '',
        pertinence: 0.75, // Score par défaut pour recherche textuelle
      })
    }

    // Recherche dans la base de connaissances juridique
    const kbResult = await db.query(
      `SELECT id, titre, type, contenu
       FROM knowledge_base
       WHERE titre ILIKE $1 OR contenu ILIKE $1
       LIMIT 5`,
      [`%${searchTerms}%`]
    )

    for (const article of kbResult.rows) {
      sources.push({
        id: article.id,
        titre: article.titre,
        type: article.type || 'knowledge_base',
        extrait: article.contenu?.substring(0, 500) || '',
        pertinence: 0.8,
      })
    }

    // Trier par pertinence et limiter
    return sources.sort((a, b) => b.pertinence - a.pertinence).slice(0, 5)
  } catch (error) {
    console.error('Erreur recherche KB:', error)
    return []
  }
}

/**
 * Appel à Groq
 */
async function callGroq(prompt: string): Promise<string> {
  const response = await fetch(`${aiConfig.groq.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${aiConfig.groq.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.groq.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`Erreur Groq: ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * Appel à Anthropic
 */
async function callAnthropic(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': aiConfig.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.anthropic.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Erreur Anthropic: ${response.status}`)
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

/**
 * Appel à Ollama
 */
async function callOllama(prompt: string): Promise<string> {
  const response = await fetch(`${aiConfig.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiConfig.ollama.chatModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Erreur Ollama: ${response.status}`)
  }

  const data = await response.json()
  return data.message?.content || ''
}

/**
 * Extrait les actions recommandées du texte
 */
function extractActions(text: string): string[] {
  const actionsMatch = text.match(/## Actions Recommandées[\s\S]*/i)
  if (!actionsMatch) return []

  const actionsSection = actionsMatch[0]
  const lines = actionsSection.split('\n')

  const actions: string[] = []
  for (const line of lines) {
    const match = line.match(/^\d+\.\s*(.+)$/)
    if (match) {
      actions.push(match[1].trim())
    }
  }

  return actions.slice(0, 5)
}
