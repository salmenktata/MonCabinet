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
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

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

export async function indexAllPendingLegalDocuments(
  limit = 30
): Promise<{ success: boolean; indexed: number; failed: number; remaining: number; error?: string }> {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { success: false, indexed: 0, failed: 0, remaining: 0, error: authCheck.error }
    }

    // Docs approuvés + consolidés sans chunks KB
    const eligibleResult = await db.query<{ id: string }>(`
      SELECT ld.id
      FROM legal_documents ld
      WHERE ld.is_approved = true
        AND ld.consolidation_status = 'complete'
        AND ld.is_abrogated = false
        AND (
          ld.knowledge_base_id IS NULL
          OR (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = ld.knowledge_base_id) = 0
        )
      ORDER BY ld.citation_key ASC
    `)

    const allIds = eligibleResult.rows.map(r => r.id)
    const remaining = Math.max(0, allIds.length - limit)
    const toProcess = allIds.slice(0, limit)

    if (toProcess.length === 0) {
      return { success: true, indexed: 0, failed: 0, remaining: 0 }
    }

    const results = await Promise.allSettled(
      toProcess.map(id => indexLegalDocument(id))
    )

    let indexed = 0
    let failed = 0
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.success) indexed++
      else failed++
    }

    revalidatePath('/super-admin/legal-documents')

    return { success: indexed > 0, indexed, failed, remaining }
  } catch (error) {
    console.error('Erreur indexAllPendingLegalDocuments:', error)
    return {
      success: false,
      indexed: 0,
      failed: 0,
      remaining: 0,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

export async function bulkReindexLegalDocuments(
  documentIds: string[]
): Promise<{ success: boolean; indexed: number; failed: number; error?: string }> {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { success: false, indexed: 0, failed: 0, error: authCheck.error }
    }

    if (!documentIds.length) {
      return { success: false, indexed: 0, failed: 0, error: 'Aucun document sélectionné' }
    }

    const eligibleResult = await db.query<{ id: string }>(
      `SELECT id FROM legal_documents
       WHERE id = ANY($1::uuid[])
         AND is_approved = true
         AND consolidation_status = 'complete'`,
      [documentIds]
    )

    if (eligibleResult.rows.length === 0) {
      return { success: false, indexed: 0, failed: 0, error: 'Aucun document éligible (approuvé + consolidé)' }
    }

    const results = await Promise.allSettled(
      eligibleResult.rows.map(r => indexLegalDocument(r.id))
    )

    let indexed = 0
    let failed = 0
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.success) indexed++
      else failed++
    }

    revalidatePath('/super-admin/legal-documents')

    return { success: indexed > 0, indexed, failed }
  } catch (error) {
    console.error('Erreur bulk reindex legal documents:', error)
    return {
      success: false,
      indexed: 0,
      failed: 0,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
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
      // Restaurer la visibilité KB pour les docs qui avaient été révoqués précédemment
      await db.query(
        `UPDATE knowledge_base SET is_active = true, updated_at = NOW()
         WHERE id IN (
           SELECT knowledge_base_id FROM legal_documents
           WHERE id = ANY($1::uuid[]) AND knowledge_base_id IS NOT NULL
         )`,
        [documentIds]
      )
      // Déclencher l'indexation pour les docs approuvés sans entrée KB
      const toIndex = await db.query<{ id: string }>(
        `SELECT id FROM legal_documents
         WHERE id = ANY($1::uuid[]) AND is_approved = true AND knowledge_base_id IS NULL`,
        [documentIds]
      )
      if (toIndex.rows.length > 0) {
        await Promise.allSettled(toIndex.rows.map(r => indexLegalDocument(r.id)))
      }
    } else {
      result = await db.query(
        `UPDATE legal_documents
         SET is_approved = false, approved_at = NULL, approved_by = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [documentIds]
      )
      // Masquer les entrées KB liées côté client
      await db.query(
        `UPDATE knowledge_base SET is_active = false, updated_at = NOW()
         WHERE id IN (
           SELECT knowledge_base_id FROM legal_documents
           WHERE id = ANY($1::uuid[]) AND knowledge_base_id IS NOT NULL
         )`,
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
  // Le slug peut être déjà décodé (depuis le détecteur) ou encodé (ancien format)
  const decodedSlug = decodeURIComponent(slug)
  const citationKey = decodedSlug

  // Récupérer les pages du groupe pour extraire titres et metadata
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

  // Filtrer les pages appartenant à ce groupe
  const groupPages: typeof pagesResult.rows = []
  for (const page of pagesResult.rows) {
    try {
      const parsed = new URL(page.url)
      const segments = parsed.pathname.split('/').filter(Boolean)
      const rawKey = segments.length >= 2 ? segments[1] : segments[0]
      const groupKey = decodeURIComponent(rawKey || '')
      if (groupKey !== decodedSlug) continue
      groupPages.push(page)
    } catch {
      continue
    }
  }

  // Détecter le type de document
  const titles = groupPages.filter(p => p.title).map(p => p.title!)
  const combined = `${decodedSlug} ${titles.slice(0, 5).join(' ')}`.toLowerCase()
  let documentType: string = 'loi'
  if (/مجلة|code/i.test(combined)) documentType = 'code'
  else if (/أمر.*عدد|أمر.*حكومي|décret|decret/i.test(combined)) documentType = 'decret'
  else if (/قرار.*من|arrêté|arrete/i.test(combined)) documentType = 'arrete'
  else if (/منشور|circulaire/i.test(combined)) documentType = 'circulaire'

  // Extraire les titres AR et FR depuis les pages ou le slug
  const isArabic = /[\u0600-\u06FF]/.test(decodedSlug)
  const officialTitleAr = isArabic ? decodedSlug : (titles.find(t => /[\u0600-\u06FF]/.test(t)) || null)
  const officialTitleFr = !isArabic
    ? decodedSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : (titles.find(t => !/[\u0600-\u06FF]/.test(t)) || null)

  // Créer le document
  const document = await findOrCreateDocument({
    citationKey,
    documentType: documentType as any,
    officialTitleAr: officialTitleAr || undefined,
    officialTitleFr: officialTitleFr || undefined,
    primaryCategory: 'legislation',
    tags: [decodedSlug],
    canonicalSourceId: sourceId,
  })

  // Lier les pages avec extraction d'article si possible
  let pageOrder = 0
  for (const page of groupPages) {
    pageOrder++

    // Tenter d'extraire un numéro d'article depuis l'URL
    const articleNumber = extractArticleNumberFromUrl(page.url)
    const contributionType = articleNumber ? 'article' : 'section'

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
