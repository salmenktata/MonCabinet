/**
 * API Route: Génération de documents DOCX éditables
 *
 * POST /api/templates/[id]/docx
 * - Génère un fichier DOCX à partir d'un template avec variables remplacées
 *
 * Query params:
 * - dossierId (optionnel): ID du dossier pour pré-remplir les variables
 *
 * Body:
 * - variables: Record<string, string> - Valeurs des variables à remplacer
 * - language: 'fr' | 'ar' (optionnel) - Langue du document
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { generateDocxFromTemplate } from '@/lib/docx/docx-generator'

export const dynamic = 'force-dynamic'

// =============================================================================
// TYPES
// =============================================================================

interface GenerateDocxBody {
  variables: Record<string, string>
  language?: 'fr' | 'ar'
  dossierId?: string
}

// =============================================================================
// POST: Générer DOCX
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const { id: templateId } = await params

    // Récupérer le body
    const body: GenerateDocxBody = await request.json()
    const { variables = {}, language, dossierId } = body

    // Récupérer le template
    const templateResult = await db.query(
      `SELECT id, titre, contenu, type_document, variables
       FROM templates
       WHERE id = $1 AND (user_id = $2 OR est_public = true)`,
      [templateId, userId]
    )

    if (templateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Template non trouvé' },
        { status: 404 }
      )
    }

    const template = templateResult.rows[0]

    // Si dossierId fourni, enrichir les variables avec les données du dossier
    let enrichedVariables = { ...variables }

    if (dossierId) {
      const contextData = await getContextData(userId, dossierId)
      enrichedVariables = { ...contextData, ...variables }
    }

    // Générer le DOCX
    const result = await generateDocxFromTemplate(
      {
        titre: template.titre,
        contenu: template.contenu,
        type_document: template.type_document,
      },
      enrichedVariables,
      language
    )

    // Incrémenter le compteur d'utilisation
    await db.query(
      `UPDATE templates SET nombre_utilisations = nombre_utilisations + 1 WHERE id = $1`,
      [templateId]
    )

    // Retourner le fichier DOCX
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        'Content-Length': result.buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Erreur génération DOCX:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Récupère les données contextuelles pour pré-remplir les variables
 */
async function getContextData(
  userId: string,
  dossierId: string
): Promise<Record<string, string>> {
  const data: Record<string, string> = {}

  // Récupérer les données du dossier
  const dossierResult = await db.query(
    `SELECT
       d.numero, d.objet, d.type_procedure, d.juridiction, d.reference_interne,
       d.date_ouverture, d.statut,
       c.nom as client_nom, c.prenom as client_prenom,
       c.email as client_email, c.telephone as client_telephone,
       c.adresse as client_adresse, c.cin as client_cin,
       c.type_client
     FROM dossiers d
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE d.id = $1 AND d.user_id = $2`,
    [dossierId, userId]
  )

  if (dossierResult.rows.length > 0) {
    const row = dossierResult.rows[0]

    // Dossier
    data['dossier.numero'] = row.numero || ''
    data['dossier.objet'] = row.objet || ''
    data['dossier.type_procedure'] = row.type_procedure || ''
    data['dossier.juridiction'] = row.juridiction || ''
    data['dossier.reference'] = row.reference_interne || ''
    data['dossier.date_ouverture'] = row.date_ouverture
      ? new Date(row.date_ouverture).toLocaleDateString('fr-TN')
      : ''

    // Client
    const clientNomComplet =
      row.type_client === 'personne_morale'
        ? row.client_nom
        : `${row.client_prenom || ''} ${row.client_nom || ''}`.trim()

    data['client.nom'] = row.client_nom || ''
    data['client.prenom'] = row.client_prenom || ''
    data['client.nom_complet'] = clientNomComplet
    data['client.email'] = row.client_email || ''
    data['client.telephone'] = row.client_telephone || ''
    data['client.adresse'] = row.client_adresse || ''
    data['client.cin'] = row.client_cin || ''

    // Tribunal / Juridiction
    data['tribunal'] = row.juridiction || ''
    data['juridiction'] = row.juridiction || ''
  }

  // Récupérer les données du profil avocat
  const profilResult = await db.query(
    `SELECT nom, prenom, email, telephone, adresse, numero_onat, barreau
     FROM profiles
     WHERE id = $1`,
    [userId]
  )

  if (profilResult.rows.length > 0) {
    const profil = profilResult.rows[0]

    data['avocat.nom'] = profil.nom || ''
    data['avocat.prenom'] = profil.prenom || ''
    data['avocat.nom_complet'] = `${profil.prenom || ''} ${profil.nom || ''}`.trim()
    data['avocat.email'] = profil.email || ''
    data['avocat.telephone'] = profil.telephone || ''
    data['avocat.adresse'] = profil.adresse || ''
    data['avocat.onat'] = profil.numero_onat || ''
    data['avocat.barreau'] = profil.barreau || ''

    // Alias pour compatibilité
    data['cabinet.nom'] = `Cabinet Me ${profil.nom || ''}`
    data['cabinet.adresse'] = profil.adresse || ''
    data['cabinet.telephone'] = profil.telephone || ''
    data['cabinet.email'] = profil.email || ''
  }

  // Date du jour
  const aujourdhui = new Date()
  data['date_aujourdhui'] = aujourdhui.toLocaleDateString('fr-TN')
  data['date_aujourdhui_fr'] = aujourdhui.toLocaleDateString('fr-TN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  data['date_aujourdhui_ar'] = aujourdhui.toLocaleDateString('ar-TN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return data
}
