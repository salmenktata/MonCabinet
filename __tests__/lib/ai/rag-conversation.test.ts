/**
 * Tests unitaires - Service RAG Conversation
 *
 * Couvre les 5 fonctions CRUD de rag-conversation.ts :
 * - createConversation()
 * - saveMessage()
 * - getUserConversations()
 * - deleteConversation()
 * - generateConversationTitle()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createConversation,
  saveMessage,
  getUserConversations,
  deleteConversation,
  generateConversationTitle,
} from '@/lib/ai/rag-conversation'
import { db } from '@/lib/db/postgres'
import type { ChatSource } from '@/lib/ai/rag-search-service'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/lib/db/postgres', () => ({
  db: { query: vi.fn() },
}))

vi.mock('@/lib/ai/llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(),
}))

vi.mock('@/lib/ai/operations-config', () => ({
  getOperationProvider: vi.fn(() => 'ollama'),
  getOperationModel: vi.fn(() => 'qwen2.5:3b'),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

// =============================================================================
// FIXTURES
// =============================================================================

const USER_ID = 'user-abc-123'
const CONVERSATION_ID = 'conv-abc-456'
const MESSAGE_ID = 'msg-abc-789'
const DOSSIER_ID = 'dossier-abc-000'

const mockSources: ChatSource[] = [
  {
    documentId: 'doc-1',
    documentName: 'Code Civil - Article 30',
    chunkContent: 'Texte de l\'article 30...',
    similarity: 0.85,
    metadata: { category: 'codes' },
  },
]

// =============================================================================
// TESTS
// =============================================================================

describe('createConversation()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crée une conversation sans dossierId et retourne l\'id', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: CONVERSATION_ID }] } as any)

    const id = await createConversation(USER_ID)

    expect(id).toBe(CONVERSATION_ID)
    const call = vi.mocked(db.query).mock.calls[0]
    expect(call[0]).toMatch(/INSERT INTO chat_conversations/)
    expect(call[1]).toEqual([USER_ID, null, null])
  })

  it('crée une conversation avec dossierId', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [{ id: CONVERSATION_ID }] } as any)

    await createConversation(USER_ID, DOSSIER_ID, 'Mon dossier')

    const call = vi.mocked(db.query).mock.calls[0]
    expect(call[1]).toContain(DOSSIER_ID)
    expect(call[1]).toContain('Mon dossier')
  })

  it('propage les erreurs DB', async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB error'))

    await expect(createConversation(USER_ID)).rejects.toThrow('DB error')
  })
})

describe('saveMessage()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sauvegarde un message user et retourne son id', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: MESSAGE_ID }] } as any) // INSERT message
      .mockResolvedValueOnce({ rows: [] } as any)                   // UPDATE conversation

    const id = await saveMessage(CONVERSATION_ID, 'user', 'Quelle est la loi ?')

    expect(id).toBe(MESSAGE_ID)
    const insertCall = vi.mocked(db.query).mock.calls[0]
    expect(insertCall[0]).toMatch(/INSERT INTO chat_messages/)
    expect(insertCall[1][0]).toBe(CONVERSATION_ID)
    expect(insertCall[1][1]).toBe('user')
    expect(insertCall[1][2]).toBe('Quelle est la loi ?')
  })

  it('sérialise les sources en JSON', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: MESSAGE_ID }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    await saveMessage(CONVERSATION_ID, 'assistant', 'Réponse...', mockSources, 150, 'ollama')

    const insertCall = vi.mocked(db.query).mock.calls[0]
    const sourcesArg = insertCall[1][3]
    expect(JSON.parse(sourcesArg)).toHaveLength(1)
    expect(JSON.parse(sourcesArg)[0].documentId).toBe('doc-1')
  })

  it('insère null quand sources sont absentes', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: MESSAGE_ID }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    await saveMessage(CONVERSATION_ID, 'assistant', 'Réponse...')

    const insertCall = vi.mocked(db.query).mock.calls[0]
    expect(insertCall[1][3]).toBeNull() // sources = null
  })

  it('met à jour la conversation (2 appels DB)', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: MESSAGE_ID }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    await saveMessage(CONVERSATION_ID, 'user', 'Question')

    expect(vi.mocked(db.query)).toHaveBeenCalledTimes(2)
    const updateCall = vi.mocked(db.query).mock.calls[1]
    expect(updateCall[0]).toMatch(/UPDATE chat_conversations/)
    expect(updateCall[1]).toContain(CONVERSATION_ID)
  })
})

describe('getUserConversations()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne les conversations formatées', async () => {
    const rawRows = [
      {
        id: CONVERSATION_ID,
        title: 'Discussion droit civil',
        dossier_id: null,
        dossier_numero: null,
        message_count: '5',
        last_message_at: new Date('2026-02-01'),
        created_at: new Date('2026-01-01'),
      },
    ]
    vi.mocked(db.query).mockResolvedValueOnce({ rows: rawRows } as any)

    const convs = await getUserConversations(USER_ID)

    expect(convs).toHaveLength(1)
    expect(convs[0].id).toBe(CONVERSATION_ID)
    expect(convs[0].messageCount).toBe(5) // parseInt du string
    expect(convs[0].dossierId).toBeNull()
  })

  it('retourne un tableau vide si aucune conversation', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as any)

    const convs = await getUserConversations(USER_ID)

    expect(convs).toHaveLength(0)
  })

  it('ajoute un filtre dossierId dans la query', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as any)

    await getUserConversations(USER_ID, DOSSIER_ID)

    const sql = vi.mocked(db.query).mock.calls[0][0] as string
    const params = vi.mocked(db.query).mock.calls[0][1] as unknown[]
    expect(sql).toMatch(/dossier_id/)
    expect(params).toContain(DOSSIER_ID)
  })

  it('respecte la limite passée en paramètre', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as any)

    await getUserConversations(USER_ID, undefined, 5)

    const params = vi.mocked(db.query).mock.calls[0][1] as unknown[]
    expect(params).toContain(5)
  })
})

describe('deleteConversation()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne true si une conversation est supprimée', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 1 } as any)

    const deleted = await deleteConversation(CONVERSATION_ID, USER_ID)

    expect(deleted).toBe(true)
    const sql = vi.mocked(db.query).mock.calls[0][0] as string
    expect(sql).toMatch(/DELETE FROM chat_conversations/)
    expect(vi.mocked(db.query).mock.calls[0][1]).toContain(CONVERSATION_ID)
    expect(vi.mocked(db.query).mock.calls[0][1]).toContain(USER_ID)
  })

  it('retourne false si la conversation n\'appartient pas à l\'utilisateur', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rowCount: 0 } as any)

    const deleted = await deleteConversation(CONVERSATION_ID, 'autre-user')

    expect(deleted).toBe(false)
  })
})

describe('generateConversationTitle()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne le début du premier message tronqué', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ content: 'Quelle est la procédure pour un divorce?' }],
    } as any)

    const title = await generateConversationTitle(CONVERSATION_ID)

    expect(title).toBe('Quelle est la procédure pour un divorce?')
  })

  it('tronque à 60 chars et ajoute "..."', async () => {
    const longContent = 'A'.repeat(80)
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ content: longContent }],
    } as any)

    const title = await generateConversationTitle(CONVERSATION_ID)

    expect(title).toHaveLength(63) // 60 + '...'
    expect(title).toMatch(/\.\.\.$/)
  })

  it('retourne "Nouvelle conversation" si aucun message', async () => {
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as any)

    const title = await generateConversationTitle(CONVERSATION_ID)

    expect(title).toBe('Nouvelle conversation')
  })

  it('nettoie le préambule "Documents du dossier:"', async () => {
    const content = 'Documents du dossier: doc1, doc2 --- Question: Quels sont mes droits?'
    vi.mocked(db.query).mockResolvedValueOnce({
      rows: [{ content }],
    } as any)

    const title = await generateConversationTitle(CONVERSATION_ID)

    expect(title).not.toMatch(/Documents du dossier/)
    expect(title).toMatch(/Quels sont mes droits/)
  })
})
