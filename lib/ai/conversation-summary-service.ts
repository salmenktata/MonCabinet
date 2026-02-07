/**
 * Service Résumé de Conversations - Génération de résumés pour les conversations longues
 *
 * Ce service gère:
 * - Détection du seuil de messages pour déclencher un résumé
 * - Génération de résumés via LLM (Groq économique)
 * - Mise à jour incrémentale des résumés existants
 * - Récupération du contexte avec résumé pour le RAG
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from './config'

// =============================================================================
// CONFIGURATION
// =============================================================================

export const SUMMARY_CONFIG = {
  triggerMessageCount: parseInt(process.env.SUMMARY_TRIGGER_COUNT || '10', 10),
  maxSummaryTokens: parseInt(process.env.SUMMARY_MAX_TOKENS || '500', 10),
  recentMessagesLimit: parseInt(process.env.SUMMARY_RECENT_LIMIT || '6', 10),
  llmProvider: 'groq' as const,
  llmModel: process.env.SUMMARY_LLM_MODEL || 'llama-3.1-8b-instant',
}

// =============================================================================
// TYPES
// =============================================================================

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export interface ConversationContext {
  summary: string | null
  messages: ConversationMessage[]
  totalCount: number
  summaryMessageCount: number
}

interface SummaryResult {
  success: boolean
  summary?: string
  tokensUsed?: number
  error?: string
}

// =============================================================================
// CLIENT LLM
// =============================================================================

let groqClient: OpenAI | null = null

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) {
      throw new Error('GROQ_API_KEY non configuré pour les résumés')
    }
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

// =============================================================================
// PROMPTS
// =============================================================================

const SUMMARY_PROMPT = `Tu es un assistant chargé de résumer des conversations juridiques en français/arabe.

INSTRUCTIONS:
1. Résume les points clés de la conversation
2. Préserve les informations juridiques importantes (articles, dates, noms)
3. Garde un ton neutre et factuel
4. Le résumé doit être concis mais complet
5. Maximum 300 mots

FORMAT:
- Points principaux discutés
- Questions posées par l'utilisateur
- Informations juridiques clés mentionnées
- État actuel de la discussion`

const UPDATE_SUMMARY_PROMPT = `Tu as un résumé existant d'une conversation juridique et de nouveaux messages à intégrer.

INSTRUCTIONS:
1. Intègre les nouveaux éléments au résumé existant
2. Évite les répétitions
3. Priorise les nouvelles informations importantes
4. Maximum 400 mots au total

FORMAT:
Résumé mis à jour de la conversation complète`

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Vérifie si une conversation nécessite la génération d'un résumé
 */
export async function shouldGenerateSummary(conversationId: string): Promise<{
  needed: boolean
  totalMessages: number
  hasSummary: boolean
  summaryMessageCount: number
}> {
  const result = await db.query(
    `SELECT
      c.summary,
      c.summary_message_count,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as total_messages
     FROM chat_conversations c
     WHERE c.id = $1`,
    [conversationId]
  )

  if (result.rows.length === 0) {
    return { needed: false, totalMessages: 0, hasSummary: false, summaryMessageCount: 0 }
  }

  const row = result.rows[0]
  const totalMessages = parseInt(row.total_messages)
  const hasSummary = !!row.summary
  const summaryMessageCount = row.summary_message_count || 0

  // Déclencher si:
  // - Pas de résumé ET plus de 10 messages
  // - OU résumé existant ET 6+ nouveaux messages depuis le dernier résumé
  const needed =
    (!hasSummary && totalMessages >= SUMMARY_CONFIG.triggerMessageCount) ||
    (hasSummary && totalMessages - summaryMessageCount >= SUMMARY_CONFIG.recentMessagesLimit)

  return { needed, totalMessages, hasSummary, summaryMessageCount }
}

/**
 * Génère un résumé initial pour une conversation
 */
export async function generateConversationSummary(
  conversationId: string
): Promise<SummaryResult> {
  try {
    // Récupérer tous les messages de la conversation
    const messagesResult = await db.query(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE conversation_id = $1
         AND role IN ('user', 'assistant')
       ORDER BY created_at ASC`,
      [conversationId]
    )

    if (messagesResult.rows.length < SUMMARY_CONFIG.triggerMessageCount) {
      return {
        success: false,
        error: `Pas assez de messages (${messagesResult.rows.length}/${SUMMARY_CONFIG.triggerMessageCount})`,
      }
    }

    // Formater les messages pour le LLM
    const conversationText = messagesResult.rows
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    // Générer le résumé
    const client = getGroqClient()
    const response = await client.chat.completions.create({
      model: SUMMARY_CONFIG.llmModel,
      max_tokens: SUMMARY_CONFIG.maxSummaryTokens,
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: `Voici la conversation à résumer:\n\n${conversationText}` },
      ],
      temperature: 0.3,
    })

    const summary = response.choices[0]?.message?.content || ''
    const tokensUsed = response.usage?.total_tokens || 0

    // Sauvegarder le résumé
    await db.query(
      `UPDATE chat_conversations
       SET summary = $1,
           summary_updated_at = NOW(),
           summary_message_count = $2
       WHERE id = $3`,
      [summary, messagesResult.rows.length, conversationId]
    )

    console.log(`[Summary] Résumé généré pour ${conversationId}: ${tokensUsed} tokens`)

    return { success: true, summary, tokensUsed }
  } catch (error) {
    console.error('[Summary] Erreur génération résumé:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Met à jour un résumé existant avec les nouveaux messages
 */
export async function updateConversationSummary(
  conversationId: string
): Promise<SummaryResult> {
  try {
    // Récupérer le résumé actuel et les infos de la conversation
    const convResult = await db.query(
      `SELECT summary, summary_message_count FROM chat_conversations WHERE id = $1`,
      [conversationId]
    )

    if (convResult.rows.length === 0 || !convResult.rows[0].summary) {
      // Pas de résumé existant, générer un nouveau
      return generateConversationSummary(conversationId)
    }

    const existingSummary = convResult.rows[0].summary
    const lastSummaryCount = convResult.rows[0].summary_message_count || 0

    // Récupérer les nouveaux messages depuis le dernier résumé
    const newMessagesResult = await db.query(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE conversation_id = $1
         AND role IN ('user', 'assistant')
       ORDER BY created_at ASC
       OFFSET $2`,
      [conversationId, lastSummaryCount]
    )

    if (newMessagesResult.rows.length < 4) {
      return {
        success: false,
        error: `Pas assez de nouveaux messages (${newMessagesResult.rows.length}/4)`,
      }
    }

    // Formater les nouveaux messages
    const newMessagesText = newMessagesResult.rows
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    // Mettre à jour le résumé
    const client = getGroqClient()
    const response = await client.chat.completions.create({
      model: SUMMARY_CONFIG.llmModel,
      max_tokens: SUMMARY_CONFIG.maxSummaryTokens,
      messages: [
        { role: 'system', content: UPDATE_SUMMARY_PROMPT },
        {
          role: 'user',
          content: `RÉSUMÉ EXISTANT:\n${existingSummary}\n\nNOUVEAUX MESSAGES À INTÉGRER:\n${newMessagesText}`,
        },
      ],
      temperature: 0.3,
    })

    const updatedSummary = response.choices[0]?.message?.content || ''
    const tokensUsed = response.usage?.total_tokens || 0
    const newTotalCount = lastSummaryCount + newMessagesResult.rows.length

    // Sauvegarder le résumé mis à jour
    await db.query(
      `UPDATE chat_conversations
       SET summary = $1,
           summary_updated_at = NOW(),
           summary_message_count = $2
       WHERE id = $3`,
      [updatedSummary, newTotalCount, conversationId]
    )

    console.log(`[Summary] Résumé mis à jour pour ${conversationId}: ${tokensUsed} tokens`)

    return { success: true, summary: updatedSummary, tokensUsed }
  } catch (error) {
    console.error('[Summary] Erreur mise à jour résumé:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Récupère le contexte de conversation avec résumé + messages récents
 */
export async function getConversationContext(
  conversationId: string,
  recentLimit: number = SUMMARY_CONFIG.recentMessagesLimit
): Promise<ConversationContext> {
  // Récupérer les infos de la conversation
  const convResult = await db.query(
    `SELECT summary, summary_message_count FROM chat_conversations WHERE id = $1`,
    [conversationId]
  )

  const summary = convResult.rows[0]?.summary || null
  const summaryMessageCount = convResult.rows[0]?.summary_message_count || 0

  // Récupérer les messages récents (après le résumé si existant)
  const messagesResult = await db.query(
    `SELECT id, role, content, created_at
     FROM chat_messages
     WHERE conversation_id = $1
       AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, recentLimit]
  )

  // Compter le total de messages
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM chat_messages WHERE conversation_id = $1`,
    [conversationId]
  )

  const totalCount = parseInt(countResult.rows[0].total)

  // Inverser pour avoir l'ordre chronologique
  const messages: ConversationMessage[] = messagesResult.rows
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      createdAt: new Date(row.created_at),
    }))

  return {
    summary,
    messages,
    totalCount,
    summaryMessageCount,
  }
}

/**
 * Déclenche la génération/mise à jour de résumé si nécessaire (async)
 * À appeler après chaque message ajouté
 */
export async function triggerSummaryGenerationIfNeeded(
  conversationId: string
): Promise<void> {
  try {
    const check = await shouldGenerateSummary(conversationId)

    if (!check.needed) {
      return
    }

    if (check.hasSummary) {
      // Mise à jour incrémentale
      await updateConversationSummary(conversationId)
    } else {
      // Génération initiale
      await generateConversationSummary(conversationId)
    }
  } catch (error) {
    // Log l'erreur mais ne pas bloquer l'opération principale
    console.error('[Summary] Erreur trigger résumé:', error)
  }
}
