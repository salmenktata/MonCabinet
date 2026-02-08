import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const defaultCategory = formData.get('defaultCategory') as string || 'autre'
    const defaultLanguage = (formData.get('defaultLanguage') as string) || 'ar'
    const defaultTagsStr = formData.get('defaultTags') as string | null
    const autoIndex = formData.get('autoIndex') !== 'false'

    // Parse titles if provided
    const titlesStr = formData.get('titles') as string | null
    let titles: string[] = []
    if (titlesStr) {
      try { titles = JSON.parse(titlesStr) } catch { /* ignore */ }
    }

    if (!files.length) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    let defaultTags: string[] = []
    if (defaultTagsStr) {
      try { defaultTags = JSON.parse(defaultTagsStr) } catch { /* ignore */ }
    }

    // Préparer les fichiers
    const fileInputs = await Promise.all(
      files.map(async (file, index) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        return {
          buffer,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          title: titles[index] || undefined,
        }
      })
    )

    const { startBulkImport } = await import('@/lib/ai/kb-bulk-import-service')
    const result = await startBulkImport(
      {
        files: fileInputs,
        defaultCategory: defaultCategory as import('@/lib/ai/knowledge-base-service').KnowledgeBaseCategory,
        defaultLanguage: defaultLanguage as import('@/lib/ai/knowledge-base-service').KnowledgeBaseLanguage,
        defaultTags,
        autoIndex,
      },
      session.user.id
    )

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Erreur bulk import:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
