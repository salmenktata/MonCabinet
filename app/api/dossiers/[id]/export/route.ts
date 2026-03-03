/**
 * Export PDF d'un dossier
 * GET /api/dossiers/[id]/export
 */

import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

async function renderPdfToBuffer(component: React.ReactElement): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  return renderToBuffer(component as React.ReactElement)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer le dossier avec client
    const dossierResult = await query(
      `SELECT d.*,
         c.nom as client_nom, c.prenom as client_prenom,
         c.type_client, c.telephone as client_telephone, c.email as client_email
       FROM dossiers d
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId]
    )

    if (dossierResult.rows.length === 0) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }

    const row = dossierResult.rows[0]

    // Récupérer actions, échéances, documents en parallèle
    const [actionsResult, echeancesResult, documentsResult, profileResult] = await Promise.all([
      query(
        `SELECT titre, statut, date_action, description
         FROM actions WHERE dossier_id = $1 ORDER BY date_action ASC LIMIT 20`,
        [id]
      ),
      query(
        `SELECT titre, date_echeance, statut, priorite
         FROM echeances WHERE dossier_id = $1 ORDER BY date_echeance ASC LIMIT 20`,
        [id]
      ),
      query(
        `SELECT nom, type, created_at
         FROM documents WHERE dossier_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id]
      ),
      query(
        `SELECT p.*, u.email as avocat_email, u.nom as avocat_nom, u.prenom as avocat_prenom
         FROM profiles p
         JOIN users u ON p.user_id = u.id
         WHERE p.user_id = $1`,
        [userId]
      ),
    ])

    const profile = profileResult.rows[0]

    // Construire les données PDF
    const { DossierPDF } = await import('@/lib/pdf/dossier-pdf')

    const pdfData = {
      dossier: {
        numero: row.numero,
        objet: row.objet,
        type_procedure: row.type_procedure,
        statut: row.statut,
        tribunal: row.tribunal,
        adverse_partie: row.adverse_partie,
        date_ouverture: row.date_ouverture,
        date_cloture: row.date_cloture,
        notes: row.notes,
        workflow_statut: row.workflow_statut,
      },
      client: row.client_nom
        ? {
            nom: row.client_nom,
            prenom: row.client_prenom,
            type_client: row.type_client,
            telephone: row.client_telephone,
            email: row.client_email,
          }
        : undefined,
      avocat: {
        nom: profile?.avocat_nom || '',
        prenom: profile?.avocat_prenom || undefined,
        email: profile?.avocat_email || '',
        cabinet_nom: profile?.cabinet_nom || undefined,
      },
      actions: actionsResult.rows,
      echeances: echeancesResult.rows,
      documents: documentsResult.rows,
    }

    const pdfBuffer = await renderPdfToBuffer(
      React.createElement(DossierPDF, pdfData)
    )

    const filename = `dossier-${row.numero.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Erreur export PDF dossier:', error)
    return NextResponse.json({ error: 'Erreur génération PDF' }, { status: 500 })
  }
}
