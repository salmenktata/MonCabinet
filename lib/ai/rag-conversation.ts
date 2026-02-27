/**
 * Service RAG Conversation - Gestion des conversations et messages
 *
 * Ce module gère:
 * 1. La création de conversations
 * 2. La sauvegarde des messages
 * 3. La récupération des conversations utilisateur
 * 4. La suppression de conversations
 * 5. La génération automatique de titres
 */

import { db } from '@/lib/db/postgres'
import { callLLMWithFallback } from './llm-fallback-service'
import { getOperationProvider, getOperationModel } from './operations-config'
import { createLogger } from '@/lib/logger'
import type { ChatSource } from './rag-search-service'

const log = createLogger('RAG')

/**
 * Crée une nouvelle conversation
 */
export async function createConversation(
  userId: string,
  dossierId?: string,
  title?: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO chat_conversations (user_id, dossier_id, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, dossierId || null, title || null]
  )

  return result.rows[0].id
}

/**
 * Sauvegarde un message dans une conversation
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: ChatSource[],
  tokensUsed?: number,
  model?: string,
  metadata?: Record<string, any>
): Promise<string> {
  const result = await db.query(
    `INSERT INTO chat_messages (conversation_id, role, content, sources, tokens_used, model, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null,
      tokensUsed != null ? tokensUsed : null,
      model || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  )

  // Mettre à jour la conversation
  await db.query(
    `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  )

  return result.rows[0].id
}

/**
 * Récupère les conversations d'un utilisateur
 */
export async function getUserConversations(
  userId: string,
  dossierId?: string,
  limit: number = 20,
  actionType?: 'chat' | 'structure' | 'consult'
): Promise<
  Array<{
    id: string
    title: string | null
    dossierId: string | null
    dossierNumero: string | null
    messageCount: number
    lastMessageAt: Date
    createdAt: Date
  }>
> {
  let sql = `
    SELECT
      c.id,
      c.title,
      c.dossier_id,
      d.numero as dossier_numero,
      c.updated_at as last_message_at,
      c.created_at,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
    FROM chat_conversations c
    LEFT JOIN dossiers d ON c.dossier_id = d.id
    WHERE c.user_id = $1
  `

  const params: (string | number)[] = [userId]
  let paramIndex = 2

  if (dossierId) {
    sql += ` AND c.dossier_id = $${paramIndex}`
    params.push(dossierId)
    paramIndex++
  }

  if (actionType) {
    if (actionType === 'chat') {
      // Mode 'chat' = par défaut : inclure aussi les conversations sans actionType (historiques)
      sql += ` AND (
        NOT EXISTS (
          SELECT 1 FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.metadata->>'actionType' IS NOT NULL
            AND cm.metadata->>'actionType' != 'chat'
          LIMIT 1
        )
      )`
    } else {
      // Modes 'structure'/'consult' : filtre strict
      sql += ` AND EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.metadata->>'actionType' = $${paramIndex}
        LIMIT 1
      )`
      params.push(actionType)
      paramIndex++
    }
  }

  sql += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex}`
  params.push(limit)

  const result = await db.query(sql, params)

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    dossierId: row.dossier_id,
    dossierNumero: row.dossier_numero,
    messageCount: parseInt(row.message_count),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  }))
}

/**
 * Supprime une conversation
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM chat_conversations
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  )

  return (result.rowCount || 0) > 0
}

/**
 * Génère un titre automatique pour une conversation
 */
export async function generateConversationTitle(
  conversationId: string
): Promise<string> {
  // Récupérer le premier message utilisateur
  const result = await db.query(
    `SELECT content FROM chat_messages
     WHERE conversation_id = $1 AND role = 'user'
     ORDER BY created_at ASC
     LIMIT 1`,
    [conversationId]
  )

  if (result.rows.length === 0) {
    return 'Nouvelle conversation'
  }

  const firstMessage = result.rows[0].content
  // Tronquer et nettoyer pour faire un titre (supporte formats FR et AR)
  const title = firstMessage
    .replace(/(?:Documents du dossier|وثائق مرجعية):[\s\S]*?---\s*(?:Question|السؤال):\s*/i, '')
    .substring(0, 60)
    .trim()

  if (title.length === 60) {
    return title + '...'
  }

  return title || 'Nouvelle conversation'
}
