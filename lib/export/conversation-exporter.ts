/**
 * Service d'export de conversations
 * Supporte les formats : Markdown, JSON, Texte simple
 * Note: PDF requiert une librairie côté serveur (jsPDF ou similaire)
 */

import type { ChatMessage, ChatSource } from '@/components/assistant-ia/ChatMessages'

// Types d'export supportés
export type ExportFormat = 'markdown' | 'json' | 'text' | 'pdf'

interface ExportOptions {
  format: ExportFormat
  includeSources?: boolean
  includeMetadata?: boolean
  locale?: 'fr' | 'ar'
}

interface ConversationData {
  id: string
  title?: string
  messages: ChatMessage[]
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Exporte une conversation dans le format spécifié
 */
export function exportConversation(
  conversation: ConversationData,
  options: ExportOptions
): string {
  const { format, includeSources = true, includeMetadata = true, locale = 'fr' } = options

  switch (format) {
    case 'markdown':
      return exportToMarkdown(conversation, { includeSources, includeMetadata, locale })
    case 'json':
      return exportToJSON(conversation, { includeSources, includeMetadata })
    case 'text':
      return exportToText(conversation, { includeSources, locale })
    default:
      throw new Error(`Format non supporté: ${format}`)
  }
}

/**
 * Export au format Markdown
 */
function exportToMarkdown(
  conversation: ConversationData,
  options: { includeSources: boolean; includeMetadata: boolean; locale: string }
): string {
  const { includeSources, includeMetadata, locale } = options
  const lines: string[] = []

  // Header
  lines.push(`# ${conversation.title || 'Conversation Qadhya Chat'}`)
  lines.push('')

  if (includeMetadata) {
    lines.push(`> **Date:** ${formatDate(conversation.createdAt, locale)}`)
    lines.push(`> **ID:** ${conversation.id}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  // Messages
  for (const message of conversation.messages) {
    const roleLabel = message.role === 'user' ? '**Vous**' : '**Qadhya**'
    const time = formatTime(message.createdAt, locale)

    lines.push(`### ${roleLabel} - ${time}`)
    lines.push('')
    lines.push(message.content)
    lines.push('')

    // Sources si demandées
    if (includeSources && message.sources && message.sources.length > 0) {
      lines.push('**Sources:**')
      for (const source of message.sources) {
        const similarity = Math.round(source.similarity * 100)
        lines.push(`- 📄 ${source.documentName} (${similarity}% pertinence)`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // Footer
  lines.push('')
  lines.push(`*Exporté depuis Qadhya Chat le ${formatDate(new Date(), locale)}*`)

  return lines.join('\n')
}

/**
 * Export au format JSON
 */
function exportToJSON(
  conversation: ConversationData,
  options: { includeSources: boolean; includeMetadata: boolean }
): string {
  const { includeSources, includeMetadata } = options

  const exportData: Record<string, unknown> = {
    id: conversation.id,
    title: conversation.title || 'Conversation Qadhya Chat',
    exportedAt: new Date().toISOString(),
    messages: conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      ...(includeSources && msg.sources
        ? {
            sources: msg.sources.map((s) => ({
              documentName: s.documentName,
              similarity: s.similarity,
              excerpt: s.chunkContent?.substring(0, 200) + '...',
            })),
          }
        : {}),
    })),
  }

  if (includeMetadata) {
    exportData.metadata = {
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
      sourceCount: conversation.messages.reduce(
        (acc, msg) => acc + (msg.sources?.length || 0),
        0
      ),
    }
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Export au format texte simple
 */
function exportToText(
  conversation: ConversationData,
  options: { includeSources: boolean; locale: string }
): string {
  const { includeSources, locale } = options
  const lines: string[] = []

  // Header
  lines.push(`═══════════════════════════════════════════════════════════════`)
  lines.push(`  ${conversation.title || 'Conversation Qadhya Chat'}`)
  lines.push(`  Exportée le ${formatDate(new Date(), locale)}`)
  lines.push(`═══════════════════════════════════════════════════════════════`)
  lines.push('')

  // Messages
  for (const message of conversation.messages) {
    const roleLabel = message.role === 'user' ? 'VOUS' : 'QADHYA'
    const time = formatTime(message.createdAt, locale)

    lines.push(`┌─────────────────────────────────────────────────────────────┐`)
    lines.push(`│ ${roleLabel} - ${time}`)
    lines.push(`└─────────────────────────────────────────────────────────────┘`)
    lines.push('')
    lines.push(message.content)
    lines.push('')

    // Sources
    if (includeSources && message.sources && message.sources.length > 0) {
      lines.push('  Sources consultées:')
      for (const source of message.sources) {
        const similarity = Math.round(source.similarity * 100)
        lines.push(`  • ${source.documentName} (${similarity}%)`)
      }
      lines.push('')
    }

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Copie le contenu dans le presse-papiers
 */
export async function copyToClipboard(
  conversation: ConversationData,
  format: 'text' | 'markdown' = 'text'
): Promise<boolean> {
  try {
    const content = exportConversation(conversation, {
      format,
      includeSources: true,
      locale: 'fr',
    })

    await navigator.clipboard.writeText(content)
    return true
  } catch (error) {
    console.error('Erreur lors de la copie:', error)
    return false
  }
}

/**
 * Télécharge l'export dans un fichier
 */
export function downloadExport(
  conversation: ConversationData,
  options: ExportOptions
): void {
  const content = exportConversation(conversation, options)

  // Déterminer le type MIME et l'extension
  const mimeTypes: Record<ExportFormat, string> = {
    markdown: 'text/markdown',
    json: 'application/json',
    text: 'text/plain',
    pdf: 'application/pdf',
  }

  const extensions: Record<ExportFormat, string> = {
    markdown: 'md',
    json: 'json',
    text: 'txt',
    pdf: 'pdf',
  }

  const blob = new Blob([content], { type: mimeTypes[options.format] })
  const url = URL.createObjectURL(blob)

  const filename = `qadhya-chat-${conversation.id}-${Date.now()}.${extensions[options.format]}`

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

// Helpers pour le formatage des dates
function formatDate(date: Date | undefined, locale: string): string {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(date: Date | undefined, locale: string): string {
  if (!date) return ''
  return new Date(date).toLocaleTimeString(locale === 'ar' ? 'ar-TN' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
