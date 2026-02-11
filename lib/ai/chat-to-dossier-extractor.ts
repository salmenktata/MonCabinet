/**
 * Service d'extraction de données de dossier depuis une conversation chat
 * Analyse les messages d'une conversation et extrait les informations pertinentes
 * pour pré-remplir un formulaire de création de dossier
 *
 * @module lib/ai/chat-to-dossier-extractor
 * @see Sprint 2 - Workflow Chat → Dossier
 */

import { callLLMWithFallback } from './llm-fallback-service'
import { createLogger } from '@/lib/logger'
import type { ChatMessage } from '@/components/assistant-ia'
import type { ProcedureType, ExtractedParty, ExtractedFact } from './dossier-structuring-service'

const log = createLogger('AI:ChatToDossier')

/**
 * Données extraites depuis une conversation chat
 */
export interface ChatDossierData {
  // Métadonnées
  confidence: number
  langue: 'ar' | 'fr'

  // Données principales
  titrePropose: string
  description: string
  typeProcedure?: ProcedureType

  // Parties (optionnel - peut être incomplet)
  client?: Partial<ExtractedParty>
  partieAdverse?: Partial<ExtractedParty>

  // Faits extraits
  faitsExtraits: ExtractedFact[]

  // Métadonnées conversation
  conversationId: string
  messageCount: number
  extractedFromUserMessages: number
}

/**
 * Options d'extraction
 */
export interface ExtractionOptions {
  /**
   * Langue cible de l'extraction
   */
  language?: 'ar' | 'fr'

  /**
   * Forcer un type de procédure spécifique
   */
  forceProcedureType?: ProcedureType

  /**
   * Limiter l'extraction aux N derniers messages
   */
  lastNMessages?: number
}

/**
 * Prompt système pour l'extraction
 */
const EXTRACTION_PROMPT = `Tu es un assistant juridique spécialisé dans l'analyse de conversations.

Ta tâche : Extraire les informations pertinentes d'une conversation pour créer un dossier juridique.

INSTRUCTIONS:
1. Analyse les messages de la conversation (surtout les messages utilisateur)
2. Identifie :
   - Le contexte juridique général
   - Le type de procédure probable (civil, divorce, commercial, etc.)
   - Les parties impliquées (client et partie adverse)
   - Les faits juridiques importants (dates, montants, personnes, lieux)
3. Propose un titre court et clair pour le dossier (max 60 caractères)
4. Rédige une description synthétique (2-3 phrases)

RÈGLES IMPORTANTES:
- Si une information n'est PAS explicitement mentionnée, ne l'invente PAS
- Marque les informations incertaines avec une confidence faible (<0.5)
- Privilégie la qualité à la quantité (mieux vaut 3 faits sûrs que 10 incertains)
- Conserve la langue d'origine pour les citations et noms propres
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Pour les montants, spécifie la devise (TND par défaut en Tunisie)

FORMAT DE SORTIE (JSON):
{
  "confidence": 0.8, // 0-1, confiance globale de l'extraction
  "langue": "fr", // ou "ar"
  "titrePropose": "Divorce - Pension alimentaire",
  "description": "Demande de révision de pension alimentaire suite à changement de situation professionnelle...",
  "typeProcedure": "divorce", // optionnel si incertain
  "client": {
    "nom": "...",
    "prenom": "...",
    "role": "demandeur"
  }, // optionnel
  "partieAdverse": {
    "nom": "...",
    "prenom": "...",
    "role": "defendeur"
  }, // optionnel
  "faitsExtraits": [
    {
      "label": "Date mariage",
      "valeur": "2015-06-10",
      "type": "date",
      "confidence": 0.9,
      "source": "Message utilisateur du 2026-02-11",
      "importance": "important"
    },
    {
      "label": "Revenu mensuel partie adverse",
      "valeur": "2500 TND",
      "type": "montant",
      "confidence": 0.7,
      "source": "Message utilisateur du 2026-02-11",
      "importance": "decisif"
    }
  ]
}

CONVERSATION À ANALYSER:
`

/**
 * Extrait les données de dossier depuis une conversation chat
 */
export async function extractDossierDataFromChat(
  conversationId: string,
  messages: ChatMessage[],
  options: ExtractionOptions = {}
): Promise<ChatDossierData> {
  try {
    log.info('Starting chat extraction', {
      conversationId,
      messageCount: messages.length,
      options,
    })

    // Filtrer les messages (garder seulement user et assistant)
    let relevantMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant')

    // Limiter aux N derniers messages si demandé
    if (options.lastNMessages) {
      relevantMessages = relevantMessages.slice(-options.lastNMessages)
    }

    // Construire le contexte de conversation
    const conversationContext = relevantMessages
      .map((m, idx) => {
        const role = m.role === 'user' ? 'Utilisateur' : 'Assistant'
        const date = m.createdAt ? new Date(m.createdAt).toISOString() : 'Date inconnue'
        return `[${idx + 1}] ${role} (${date}):\n${m.content}`
      })
      .join('\n\n---\n\n')

    // Appeler le LLM avec fallback
    const response = await callLLMWithFallback(
      [{ role: 'user', content: EXTRACTION_PROMPT + '\n\n' + conversationContext }],
      {
        temperature: 0.1, // Précision maximale pour extraction
        maxTokens: 2000,
      },
      false // Mode rapide par défaut (Ollama)
    )

    // Parser la réponse JSON
    let extractedData: Partial<ChatDossierData>
    try {
      // Nettoyer la réponse (enlever markdown ```json si présent)
      const cleanedResponse = response.answer
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      extractedData = JSON.parse(cleanedResponse)
    } catch (parseError) {
      log.error('Failed to parse LLM response', { error: parseError, response: response.answer })
      throw new Error('Format de réponse invalide du LLM')
    }

    // Valider et enrichir les données
    const result: ChatDossierData = {
      confidence: extractedData.confidence || 0.5,
      langue: extractedData.langue || options.language || 'fr',
      titrePropose: extractedData.titrePropose || 'Nouveau dossier',
      description: extractedData.description || 'Dossier créé depuis une conversation',
      typeProcedure: options.forceProcedureType || extractedData.typeProcedure,
      client: extractedData.client,
      partieAdverse: extractedData.partieAdverse,
      faitsExtraits: extractedData.faitsExtraits || [],
      conversationId,
      messageCount: messages.length,
      extractedFromUserMessages: messages.filter((m) => m.role === 'user').length,
    }

    log.info('Chat extraction completed', {
      conversationId,
      confidence: result.confidence,
      factsCount: result.faitsExtraits.length,
    })

    return result
  } catch (error) {
    log.error('Chat extraction failed', { error, conversationId })

    // Fallback : Extraction simple basée sur heuristiques
    return fallbackExtraction(conversationId, messages, options)
  }
}

/**
 * Extraction fallback si le LLM échoue
 * Utilise des heuristiques simples
 */
function fallbackExtraction(
  conversationId: string,
  messages: ChatMessage[],
  options: ExtractionOptions
): ChatDossierData {
  log.warn('Using fallback extraction (LLM failed)')

  const userMessages = messages.filter((m) => m.role === 'user')

  // Prendre le premier message utilisateur comme titre (tronqué)
  const firstUserMessage = userMessages[0]?.content || 'Nouveau dossier'
  const titrePropose = firstUserMessage.substring(0, 60).trim() + (firstUserMessage.length > 60 ? '...' : '')

  // Concaténer tous les messages utilisateur pour la description
  const description = userMessages
    .map((m) => m.content)
    .join(' ')
    .substring(0, 300)
    .trim() + '...'

  return {
    confidence: 0.3, // Faible confiance (extraction automatique)
    langue: options.language || 'fr',
    titrePropose,
    description,
    typeProcedure: options.forceProcedureType,
    faitsExtraits: [],
    conversationId,
    messageCount: messages.length,
    extractedFromUserMessages: userMessages.length,
  }
}

/**
 * Valide si une conversation contient suffisamment de données pour créer un dossier
 */
export function canCreateDossierFromChat(messages: ChatMessage[]): boolean {
  const userMessages = messages.filter((m) => m.role === 'user')

  // Au moins 1 message utilisateur requis
  if (userMessages.length === 0) {
    return false
  }

  // Au moins 20 caractères dans le premier message utilisateur
  const firstMessage = userMessages[0].content
  if (firstMessage.length < 20) {
    return false
  }

  return true
}

/**
 * Estime la qualité des données extraites
 */
export function estimateDataQuality(data: ChatDossierData): 'high' | 'medium' | 'low' {
  // Critères de qualité
  const hasTitle = data.titrePropose.length > 10
  const hasDescription = data.description.length > 50
  const hasType = !!data.typeProcedure
  const hasParties = !!(data.client || data.partieAdverse)
  const hasFacts = data.faitsExtraits.length > 0
  const highConfidence = data.confidence > 0.7

  const score = [
    hasTitle,
    hasDescription,
    hasType,
    hasParties,
    hasFacts,
    highConfidence,
  ].filter(Boolean).length

  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}
