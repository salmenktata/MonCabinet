'use server'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { revalidatePath } from 'next/cache'
import {
  detectDocumentGroups,
  type DocumentGroup,
} from '@/lib/legal-documents/document-group-detector'
import {
  findOrCreateDocument,
  linkPageToDocument,
  getDocumentByCitationKey,
} from '@/lib/legal-documents/document-service'
import { consolidateDocument } from '@/lib/legal-documents/content-consolidation-service'
import {
  getCodeMetadata,
  extractArticleNumberFromUrl,
  extractCitationKeyFromCodeSlug,
} from '@/lib/legal-documents/citation-key-extractor'
import { NINEANOUN_CODE_DOMAINS } from '@/lib/web-scraper/9anoun-code-domains'

async function checkAdminAccess(): Promise<{ userId: string } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { error: 'Non authentifié' }
  }

  const result = await db.query('SELECT role FROM users WHERE id = $1', [session.user.id])
  const role = result.rows[0]?.role

  if (role !== 'admin' && role !== 'super_admin') {
    return { error: 'Accès réservé aux administrateurs' }
  }

  return { userId: session.user.id }
}

export async function bulkApproveLegalDocuments(
  action: 'approve' | 'revoke',
  documentIds: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { success: false, count: 0, error: authCheck.error }
    }

    if (!documentIds.length) {
      return { success: false, count: 0, error: 'Aucun document sélectionné' }
    }

    let result
    if (action === 'approve') {
      result = await db.query(
        `UPDATE legal_documents
         SET is_approved = true, approved_at = NOW(), approved_by = $1, updated_at = NOW()
         WHERE id = ANY($2::uuid[]) AND consolidation_status = 'complete'`,
        [authCheck.userId, documentIds]
      )
    } else {
      result = await db.query(
        `UPDATE legal_documents
         SET is_approved = false, approved_at = NULL, approved_by = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [documentIds]
      )
    }

    revalidatePath('/super-admin/legal-documents')

    return { success: true, count: result.rowCount ?? 0 }
  } catch (error) {
    console.error('Erreur bulk approve legal documents:', error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

// =============================================================================
// IMPORT DEPUIS WEB SOURCES
// =============================================================================

export async function detectDocumentGroupsAction(
  sourceId: string
): Promise<{ groups: DocumentGroup[]; error?: string }> {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { groups: [], error: authCheck.error }
    }

    const groups = await detectDocumentGroups(sourceId)
    return { groups }
  } catch (error) {
    console.error('Erreur détection groupes:', error)
    return {
      groups: [],
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

export async function importLegalDocumentsAction(
  sourceId: string,
  slugs: string[]
): Promise<{ success: boolean; imported: number; errors: string[] }> {
  const errors: string[] = []
  let imported = 0

  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { success: false, imported: 0, errors: [authCheck.error] }
    }

    if (!slugs.length) {
      return { success: false, imported: 0, errors: ['Aucun groupe sélectionné'] }
    }

    // Récupérer les infos de la source
    const sourceResult = await db.query<{ base_url: string }>(
      `SELECT base_url FROM web_sources WHERE id = $1`,
      [sourceId]
    )

    if (sourceResult.rows.length === 0) {
      return { success: false, imported: 0, errors: ['Source non trouvée'] }
    }

    const is9anoun = sourceResult.rows[0].base_url.includes('9anoun.tn')

    for (const slug of slugs) {
      try {
        if (is9anoun) {
          await import9anounCode(sourceId, slug)
        } else {
          await importGenericGroup(sourceId, slug)
        }
        imported++
      } catch (err: any) {
        errors.push(`${slug}: ${err.message}`)
      }
    }

    revalidatePath('/super-admin/legal-documents')

    return {
      success: imported > 0,
      imported,
      errors,
    }
  } catch (error) {
    console.error('Erreur import legal documents:', error)
    return {
      success: false,
      imported,
      errors: [...errors, error instanceof Error ? error.message : 'Erreur inconnue'],
    }
  }
}

// =============================================================================
// IMPORT HELPERS
// =============================================================================

async function import9anounCode(sourceId: string, slug: string): Promise<void> {
  const meta = getCodeMetadata(slug)
  const codeDef = NINEANOUN_CODE_DOMAINS[slug]
  if (!meta || !codeDef) {
    throw new Error(`Métadonnées non trouvées pour "${slug}"`)
  }

  // Créer le document
  const document = await findOrCreateDocument({
    citationKey: meta.citationKey,
    documentType: meta.documentType,
    officialTitleAr: meta.officialTitleAr,
    officialTitleFr: meta.officialTitleFr,
    primaryCategory: meta.primaryCategory,
    secondaryCategories: ['legislation'],
    tags: [slug, meta.legalDomains[0], 'tunisie'].filter(Boolean),
    legalDomains: meta.legalDomains,
    canonicalSourceId: sourceId,
    sourceUrls: [`https://9anoun.tn/kb/codes/${slug}`],
  })

  // Lier les pages
  const pagesResult = await db.query<{
    id: string
    url: string
    title: string | null
    word_count: number | null
  }>(
    `SELECT id, url, title, word_count
     FROM web_pages
     WHERE web_source_id = $1
       AND url LIKE $2
       AND status IN ('crawled', 'indexed')
     ORDER BY url ASC`,
    [sourceId, `%/kb/codes/${slug}/%`]
  )

  for (const page of pagesResult.rows) {
    const articleNumber = extractArticleNumberFromUrl(page.url)
    const contributionType = articleNumber ? 'article' : 'chapter'
    let pageOrder: number | null = null
    if (articleNumber) {
      const numMatch = articleNumber.match(/^(\d+)/)
      if (numMatch) pageOrder = parseInt(numMatch[1], 10)
    }

    try {
      await linkPageToDocument(
        page.id,
        document.id,
        articleNumber,
        pageOrder,
        contributionType,
        false
      )
    } catch {
      // Page déjà liée, on continue
    }
  }

  // Consolider
  await consolidateDocument(document.id)
}

async function importGenericGroup(sourceId: string, slug: string): Promise<void> {
  const citationKey = slug

  // Créer le document
  const document = await findOrCreateDocument({
    citationKey,
    documentType: 'autre',
    officialTitleFr: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    primaryCategory: 'legislation',
    tags: [slug],
    canonicalSourceId: sourceId,
  })

  // Récupérer les pages du groupe (même logique que le détecteur)
  const pagesResult = await db.query<{
    id: string
    url: string
    title: string | null
  }>(
    `SELECT id, url, title
     FROM web_pages
     WHERE web_source_id = $1
       AND status IN ('crawled', 'indexed')
     ORDER BY url ASC`,
    [sourceId]
  )

  let pageOrder = 0
  for (const page of pagesResult.rows) {
    try {
      const parsed = new URL(page.url)
      const segments = parsed.pathname.split('/').filter(Boolean)
      const groupKey = segments.length >= 2 ? segments[1] : segments[0]
      if (groupKey !== slug) continue
    } catch {
      continue
    }

    pageOrder++
    try {
      await linkPageToDocument(
        page.id,
        document.id,
        null,
        pageOrder,
        'section',
        false
      )
    } catch {
      // Page déjà liée, on continue
    }
  }

  // Consolider
  await consolidateDocument(document.id)
}
