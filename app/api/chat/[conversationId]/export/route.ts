import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { exportConversation, type ExportFormat } from '@/lib/export/conversation-exporter'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params

    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer les paramètres de l'URL
    const searchParams = request.nextUrl.searchParams
    const format = (searchParams.get('format') || 'markdown') as ExportFormat
    const includeSources = searchParams.get('includeSources') !== 'false'
    const includeMetadata = searchParams.get('includeMetadata') !== 'false'

    // Valider le format
    if (!['markdown', 'json', 'text'].includes(format)) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez: markdown, json, text' },
        { status: 400 }
      )
    }

    // Récupérer la conversation
    const convResult = await db.query(
      `SELECT id, titre, created_at, updated_at
       FROM chat_conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, session.user.id]
    )

    if (convResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Conversation non trouvée' },
        { status: 404 }
      )
    }

    const conversation = convResult.rows[0]

    // Récupérer les messages
    const msgResult = await db.query(
      `SELECT id, role, content, sources, created_at
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    )

    // Formater les données pour l'export
    const conversationData = {
      id: conversation.id,
      title: conversation.titre,
      createdAt: new Date(conversation.created_at),
      updatedAt: conversation.updated_at ? new Date(conversation.updated_at) : undefined,
      messages: msgResult.rows.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        sources: msg.sources || [],
        createdAt: new Date(msg.created_at),
      })),
    }

    // Générer l'export
    const content = exportConversation(conversationData, {
      format,
      includeSources,
      includeMetadata,
      locale: 'fr',
    })

    // Déterminer le type MIME
    const mimeTypes: Record<string, string> = {
      markdown: 'text/markdown; charset=utf-8',
      json: 'application/json; charset=utf-8',
      text: 'text/plain; charset=utf-8',
    }

    const extensions: Record<string, string> = {
      markdown: 'md',
      json: 'json',
      text: 'txt',
    }

    // Retourner le fichier
    const filename = `qadhya-chat-${conversationId.substring(0, 8)}.${extensions[format]}`

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': mimeTypes[format],
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Erreur export conversation:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'export' },
      { status: 500 }
    )
  }
}
