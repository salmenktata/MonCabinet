/**
 * API Route: Administration - Knowledge Base Document par ID
 *
 * GET /api/admin/knowledge-base/[id]
 * - Récupère les détails d'un document
 *
 * PATCH /api/admin/knowledge-base/[id]
 * - Met à jour un document
 *
 * DELETE /api/admin/knowledge-base/[id]
 * - Supprime un document
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'

const KnowledgeBasePatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  is_abroge: z.boolean().optional(),
  abroge_suspected: z.boolean().optional(),
  rag_enabled: z.boolean().optional(),
  doc_type: z.enum(['TEXTES', 'JURIS', 'PROC', 'TEMPLATES', 'DOCTRINE']).optional(),
})
import { db } from '@/lib/db/postgres'
import {
  getKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeBaseCategory,
} from '@/lib/ai/knowledge-base-service'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'
import { safeParseInt } from '@/lib/utils/safe-number'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

// =============================================================================
// GET: Détails d'un document
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params
    const document = await getKnowledgeDocument(id)

    if (!document) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Récupérer aussi les chunks pour plus de détails
    const chunksResult = await db.query(
      `SELECT id, chunk_index, LENGTH(content) as content_length, metadata
       FROM knowledge_base_chunks
       WHERE knowledge_base_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    )

    return NextResponse.json({
      document,
      chunks: chunksResult.rows.map((row) => ({
        id: row.id,
        index: row.chunk_index,
        contentLength: parseInt(row.content_length, 10),
        metadata: row.metadata,
      })),
    })
  } catch (error) {
    console.error('Erreur récupération document:', error)
    return NextResponse.json(
      { error: 'Erreur récupération document' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH: Mettre à jour un document
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params
    const rawBody = await request.json()
    const parseResult = KnowledgeBasePatchSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message ?? 'Corps de requête invalide' },
        { status: 400 }
      )
    }
    const { title, description, category, metadata, is_abroge, abroge_suspected, rag_enabled, doc_type } = parseResult.data

    // Toggle rag_enabled (contrôle manuel par document — ex: Google Drive)
    if (rag_enabled !== undefined) {
      await db.query(
        `UPDATE knowledge_base SET rag_enabled = $1, updated_at = NOW() WHERE id = $2`,
        [Boolean(rag_enabled), id]
      )
      const updated = await db.query(
        `SELECT id, title, rag_enabled FROM knowledge_base WHERE id = $1`,
        [id]
      )
      // Audit log (fire-and-forget)
      db.query(
        `INSERT INTO admin_audit_logs (admin_id, admin_email, action_type, target_type, target_id, target_identifier, new_value)
         VALUES ($1, $2, 'kb_rag_toggle', 'knowledge_base', $3, $4, $5)`,
        [session.user.id, session.user.email ?? '', id, updated.rows[0]?.title ?? id, JSON.stringify({ rag_enabled })]
      ).catch(() => {})

      return NextResponse.json({
        message: `Document ${rag_enabled ? 'activé' : 'désactivé'} pour le RAG`,
        document: updated.rows[0] || null,
      })
    }

    // Validation catégorie si fournie
    if (category) {
      const validCategories = getCategoriesForContext('knowledge_base', 'fr')
        .filter(c => c.value !== 'all')
        .map(c => c.value as KnowledgeBaseCategory)

      if (!validCategories.includes(category as KnowledgeBaseCategory)) {
        return NextResponse.json(
          { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Gestion spécifique abrogation (direct DB pour éviter de surcharger updateKnowledgeDocument)
    const hasAbrogationUpdate = is_abroge !== undefined || abroge_suspected !== undefined
    if (hasAbrogationUpdate) {
      const setClauses: string[] = ['updated_at = NOW()']
      const abrogParams: (boolean | string)[] = []
      let pIdx = 1

      if (is_abroge !== undefined) {
        setClauses.push(`is_abroge = $${pIdx++}`)
        abrogParams.push(Boolean(is_abroge))

        if (is_abroge === true) {
          // Confirmer : marquer suspect=true, validated, et désactiver du RAG
          setClauses.push(`abroge_suspected = $${pIdx++}`)
          abrogParams.push(true)
          setClauses.push(`is_active = $${pIdx++}`)
          abrogParams.push(false)
          setClauses.push(`abroge_validated_at = $${pIdx++}`)
          abrogParams.push(new Date().toISOString())
          if (session?.user?.id) {
            setClauses.push(`abroge_validated_by = $${pIdx++}`)
            abrogParams.push(session.user.id)
          }
        } else if (is_abroge === false) {
          // Rejeter la suspicion
          setClauses.push(`abroge_suspected = $${pIdx++}`)
          abrogParams.push(false)
          setClauses.push(`abroge_confidence = NULL`)
          setClauses.push(`abroge_validated_at = $${pIdx++}`)
          abrogParams.push(new Date().toISOString())
          if (session?.user?.id) {
            setClauses.push(`abroge_validated_by = $${pIdx++}`)
            abrogParams.push(session.user.id)
          }
        }
      } else if (abroge_suspected !== undefined) {
        setClauses.push(`abroge_suspected = $${pIdx++}`)
        abrogParams.push(Boolean(abroge_suspected))
        if (!abroge_suspected) {
          setClauses.push(`abroge_confidence = NULL`)
        }
      }

      abrogParams.push(id)
      await db.query(
        `UPDATE knowledge_base SET ${setClauses.join(', ')} WHERE id = $${pIdx}`,
        abrogParams
      )

      const updated = await db.query(
        `SELECT id, title, is_abroge, abroge_suspected, abroge_confidence, abroge_validated_at, is_active
         FROM knowledge_base WHERE id = $1`,
        [id]
      )

      return NextResponse.json({
        message: 'Statut abrogation mis à jour',
        document: updated.rows[0] || null,
      })
    }

    // Override manuel du doc_type (sans changer la catégorie)
    if (doc_type !== undefined && !category) {
      await db.query(
        `UPDATE knowledge_base SET doc_type = $1::document_type, updated_at = NOW() WHERE id = $2`,
        [doc_type, id]
      )
      await db.query(
        `UPDATE knowledge_base_chunks SET metadata = metadata || jsonb_build_object('doc_type', $1)
         WHERE knowledge_base_id = $2`,
        [doc_type, id]
      )
      if (!title && !description && !metadata) {
        const updated = await getKnowledgeDocument(id)
        return NextResponse.json({ message: 'doc_type mis à jour', document: updated })
      }
    }

    const document = await updateKnowledgeDocument(id, {
      title,
      description,
      category: category as KnowledgeBaseCategory | undefined,
      metadata,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    return NextResponse.json({
      message: 'Document mis à jour',
      document,
    })
  } catch (error) {
    console.error('Erreur mise à jour document:', error)
    return NextResponse.json(
      { error: 'Erreur mise à jour document' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer un document
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params
    // Récupérer le titre avant suppression pour le log
    const docInfo = await db.query(`SELECT title FROM knowledge_base WHERE id = $1`, [id])
    const docTitle = docInfo.rows[0]?.title ?? id

    const deleted = await deleteKnowledgeDocument(id)

    if (!deleted) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Audit log (fire-and-forget)
    db.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_email, action_type, target_type, target_id, target_identifier)
       VALUES ($1, $2, 'kb_delete', 'knowledge_base', $3, $4)`,
      [session.user.id, session.user.email ?? '', id, docTitle]
    ).catch(() => {})

    return NextResponse.json({
      message: 'Document supprimé avec succès',
    })
  } catch (error) {
    console.error('Erreur suppression document:', error)
    return NextResponse.json(
      { error: 'Erreur suppression document' },
      { status: 500 }
    )
  }
}
