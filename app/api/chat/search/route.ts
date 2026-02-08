import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

interface SearchResult {
  id: string
  conversationId: string
  conversationTitle: string
  role: 'user' | 'assistant'
  content: string
  excerpt: string
  createdAt: string
  highlightedContent?: string
}

export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer les paramètres de recherche
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const role = searchParams.get('role') // 'user' | 'assistant' | null
    const conversationId = searchParams.get('conversationId')
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        total: 0,
        query: '',
      })
    }

    // Construire la requête SQL
    const conditions: string[] = ['c.user_id = $1', 'm.content ILIKE $2']
    const params: (string | number)[] = [session.user.id, `%${query}%`]
    let paramIndex = 3

    if (dateFrom) {
      conditions.push(`m.created_at >= $${paramIndex}`)
      params.push(dateFrom)
      paramIndex++
    }

    if (dateTo) {
      conditions.push(`m.created_at <= $${paramIndex}`)
      params.push(dateTo)
      paramIndex++
    }

    if (role && (role === 'user' || role === 'assistant')) {
      conditions.push(`m.role = $${paramIndex}`)
      params.push(role)
      paramIndex++
    }

    if (conversationId) {
      conditions.push(`m.conversation_id = $${paramIndex}`)
      params.push(conversationId)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Compter le total
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM chat_messages m
       INNER JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    // Récupérer les messages
    params.push(limit, offset)
    const messagesResult = await db.query(
      `SELECT m.id, m.role, m.content, m.created_at, m.conversation_id, c.titre as conversation_title
       FROM chat_messages m
       INNER JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    )

    // Formater les résultats avec mise en surbrillance
    const results: SearchResult[] = messagesResult.rows.map((msg) => {
      const content = msg.content || ''

      // Créer un extrait autour du terme recherché
      const excerpt = createExcerpt(content, query, 150)

      // Mise en surbrillance du terme recherché
      const highlightedContent = highlightText(excerpt, query)

      return {
        id: msg.id,
        conversationId: msg.conversation_id,
        conversationTitle: msg.conversation_title || 'Conversation sans titre',
        role: msg.role as 'user' | 'assistant',
        content: content,
        excerpt,
        createdAt: msg.created_at,
        highlightedContent,
      }
    })

    return NextResponse.json({
      results,
      total,
      query,
      pagination: {
        limit,
        offset,
        hasMore: total > offset + limit,
      },
    })
  } catch (error) {
    console.error('Erreur recherche chat:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recherche' },
      { status: 500 }
    )
  }
}

/**
 * Crée un extrait centré sur le terme recherché
 */
function createExcerpt(text: string, query: string, maxLength: number): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) {
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '')
  }

  const start = Math.max(0, index - Math.floor(maxLength / 2))
  const end = Math.min(text.length, start + maxLength)

  let excerpt = text.substring(start, end)

  if (start > 0) excerpt = '...' + excerpt
  if (end < text.length) excerpt = excerpt + '...'

  return excerpt
}

/**
 * Met en surbrillance le terme recherché dans le texte
 * Retourne le texte avec des balises <mark>
 */
function highlightText(text: string, query: string): string {
  if (!query) return text

  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Échappe les caractères spéciaux pour une utilisation dans une regex
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
