/**
 * API Route: Correction des titres non-significatifs de la Knowledge Base
 *
 * GET  /api/admin/knowledge-base/fix-titles?limit=50
 *   → Retourne la liste des documents avec titres problématiques + suggestions
 *
 * POST /api/admin/knowledge-base/fix-titles
 *   Body: { limit?: number, ids?: string[], dry_run?: boolean }
 *   → Génère et applique des titres via LLM (Ollama) + règles heuristiques
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { callOllamaWithSDK } from '@/lib/ai/ollama-client-helper'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// =============================================================================
// DÉTECTION DES TITRES PROBLÉMATIQUES
// =============================================================================

const PROBLEMATIC_TITLE_SQL = `
  title ILIKE 'http%'
  OR title ILIKE 'www.%'
  OR title ~* '\\.(pdf|doc|docx|txt|html?)$'
  OR title ~ '^[_\\s]{3,}$'
  OR char_length(title) < 5
  OR title ~ '^\\d+$'
  OR lower(title) IN ('sans titre', 'untitled', 'page', 'document', 'fichier')
  OR title ILIKE 'Imprimerie Officielle%'
  OR title ~ '[#$%&]{2,}'
`

// =============================================================================
// HEURISTIQUE : Générer un titre depuis une URL
// =============================================================================

function titleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Prendre le dernier segment du path sans extension
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length === 0) return null
    const last = segments[segments.length - 1]
    // Retirer l'extension
    const withoutExt = last.replace(/\.\w{2,5}$/, '')
    // Convertir tirets/underscores en espaces
    const readable = withoutExt.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
    if (readable.length < 3) {
      // Essayer le segment précédent
      if (segments.length > 1) {
        const prev = segments[segments.length - 2].replace(/[-_]/g, ' ').trim()
        if (prev.length > 3) return prev
      }
      return null
    }
    return readable
  } catch {
    return null
  }
}

// =============================================================================
// HEURISTIQUE : Titre depuis le contenu (première ligne non-vide)
// =============================================================================

function titleFromContent(contentPreview: string | null): string | null {
  if (!contentPreview) return null
  const lines = contentPreview
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 4)

  for (const line of lines) {
    // Ignorer les lignes trop courtes ou purement numériques
    if (line.length > 5 && !/^\d+$/.test(line)) {
      return line.substring(0, 150)
    }
  }
  return null
}

// =============================================================================
// LLM : Générer un titre depuis le contenu
// =============================================================================

async function generateTitleWithLLM(
  contentPreview: string,
  category: string,
  sourceUrl: string | null
): Promise<string | null> {
  const urlHint = sourceUrl ? `\nURL source : ${sourceUrl}` : ''
  const prompt = `Tu es un expert juridique tunisien. Génère un titre court (max 100 caractères) et précis pour ce document juridique.
Catégorie : ${category}${urlHint}

Contenu (extrait) :
${contentPreview.substring(0, 600)}

Réponds UNIQUEMENT avec le titre, sans guillemets ni explication. Le titre doit être en arabe si le contenu est en arabe, en français sinon.`

  try {
    const response = await callOllamaWithSDK(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, maxTokens: 100 }
    )
    const title = response.content.trim().replace(/^["']|["']$/g, '')
    if (title.length > 3 && title.length <= 200) {
      return title
    }
    return null
  } catch {
    return null
  }
}

// =============================================================================
// GET : Preview des titres problématiques
// =============================================================================

export const GET = withAdminApiAuth(async (request) => {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)

  const result = await db.query(
    `SELECT
      id, title, category,
      LEFT(full_text, 400) as content_preview,
      metadata->>'url' as source_url
    FROM knowledge_base
    WHERE is_active = true
      AND (${PROBLEMATIC_TITLE_SQL})
    ORDER BY created_at DESC
    LIMIT $1`,
    [limit]
  )

  const documents = result.rows.map((row) => {
    const sourceUrl = row.source_url as string | null
    const contentPreview = row.content_preview as string | null

    // Suggestion heuristique (rapide, sans LLM)
    let suggestedTitle: string | null = null
    let fixStrategy: 'url_slug' | 'first_line' | 'llm_needed' = 'llm_needed'

    if (sourceUrl && (row.title as string).startsWith('http')) {
      suggestedTitle = titleFromUrl(sourceUrl)
      if (suggestedTitle) fixStrategy = 'url_slug'
    }

    if (!suggestedTitle) {
      suggestedTitle = titleFromContent(contentPreview)
      if (suggestedTitle) fixStrategy = 'first_line'
    }

    return {
      id: row.id,
      current_title: row.title,
      category: row.category,
      suggested_title: suggestedTitle,
      fix_strategy: fixStrategy,
    }
  })

  return NextResponse.json({
    count: documents.length,
    documents,
  })
})

// =============================================================================
// POST : Appliquer les corrections
// =============================================================================

export const POST = withAdminApiAuth(async (request) => {
  const body = await request.json().catch(() => ({}))
  const limit = Math.min(parseInt(body.limit || '50'), 200)
  const dryRun = body.dry_run === true
  const specificIds: string[] | undefined = body.ids

  // Récupérer les documents à corriger
  let rows: Array<{
    id: string
    title: string
    category: string
    content_preview: string | null
    source_url: string | null
  }>

  if (specificIds && specificIds.length > 0) {
    const result = await db.query(
      `SELECT
        id, title, category,
        LEFT(full_text, 600) as content_preview,
        metadata->>'url' as source_url
      FROM knowledge_base
      WHERE is_active = true
        AND id = ANY($1::uuid[])
      ORDER BY created_at DESC`,
      [specificIds]
    )
    rows = result.rows
  } else {
    const result = await db.query(
      `SELECT
        id, title, category,
        LEFT(full_text, 600) as content_preview,
        metadata->>'url' as source_url
      FROM knowledge_base
      WHERE is_active = true
        AND (${PROBLEMATIC_TITLE_SQL})
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    )
    rows = result.rows
  }

  let fixed = 0
  let errors = 0
  let skipped = 0
  const results: Array<{ id: string; old_title: string; new_title: string; strategy: string }> = []

  for (const row of rows) {
    try {
      const sourceUrl = row.source_url
      const contentPreview = row.content_preview

      // 1. Heuristique URL
      let newTitle: string | null = null
      let strategy = 'llm'

      if (sourceUrl && (row.title as string).startsWith('http')) {
        newTitle = titleFromUrl(sourceUrl)
        if (newTitle) strategy = 'url_slug'
      }

      // 2. Première ligne du contenu
      if (!newTitle) {
        newTitle = titleFromContent(contentPreview)
        if (newTitle) strategy = 'first_line'
      }

      // 3. LLM Ollama
      if (!newTitle && contentPreview) {
        newTitle = await generateTitleWithLLM(contentPreview, row.category, sourceUrl)
        strategy = 'llm'
        // Délai pour ne pas saturer Ollama
        await new Promise((r) => setTimeout(r, 150))
      }

      if (!newTitle || newTitle === row.title) {
        skipped++
        continue
      }

      if (!dryRun) {
        await db.query(
          `UPDATE knowledge_base SET title = $1, updated_at = NOW() WHERE id = $2`,
          [newTitle, row.id]
        )
      }

      results.push({ id: row.id, old_title: row.title, new_title: newTitle, strategy })
      fixed++
    } catch {
      errors++
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    fixed,
    errors,
    skipped,
    total_processed: rows.length,
    results: dryRun ? results : results.slice(0, 20), // En dry_run, retourner tous les résultats
  })
}, { allowCronSecret: true })
