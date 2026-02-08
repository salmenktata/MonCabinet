import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import React from 'react'

// Import dynamique pour @react-pdf/renderer (bundle lourd ~500KB)
async function renderPdfToBuffer(component: React.ReactElement): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  return renderToBuffer(component as any)
}

async function getNoteHonorairesPDFComponent() {
  const { NoteHonorairesPDF } = await import('@/lib/pdf/note-honoraires-pdf')
  return NoteHonorairesPDF
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'authentification
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer la facture avec le client
    const factureResult = await query(
      `SELECT f.*,
        c.id as client_id, c.nom, c.prenom, c.type_client, c.cin,
        c.adresse, c.telephone, c.email
       FROM factures f
       JOIN clients c ON f.client_id = c.id
       WHERE f.id = $1 AND f.user_id = $2`,
      [id, userId]
    )

    if (factureResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      )
    }

    const factureRow = factureResult.rows[0]

    // Vérifier que la facture a un type d'honoraires
    if (!factureRow.type_honoraires) {
      return NextResponse.json(
        { error: 'Cette facture n\'a pas de type d\'honoraires défini' },
        { status: 400 }
      )
    }

    // Récupérer le profil de l'avocat
    const profileResult = await query(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    )

    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profil avocat non trouvé' },
        { status: 404 }
      )
    }

    const profile = profileResult.rows[0]

    // Préparer les données pour le PDF
    const pdfData = {
      facture: {
        id: factureRow.id,
        numero: factureRow.numero,
        date_emission: factureRow.date_emission,
        date_echeance: factureRow.date_echeance,
        type_honoraires: factureRow.type_honoraires,
        base_calcul: factureRow.base_calcul,
        taux_horaire: factureRow.taux_horaire ? parseFloat(factureRow.taux_horaire) : undefined,
        heures: factureRow.heures ? parseFloat(factureRow.heures) : undefined,
        pourcentage_resultat: factureRow.pourcentage_resultat
          ? parseFloat(factureRow.pourcentage_resultat)
          : undefined,
        montant_ht: parseFloat(factureRow.montant_ht),
        montant_debours: parseFloat(factureRow.montant_debours || '0'),
        taux_tva: parseFloat(factureRow.taux_tva),
        montant_tva: parseFloat(factureRow.montant_tva),
        montant_ttc: parseFloat(factureRow.montant_ttc),
        provisions_recues: parseFloat(factureRow.provisions_recues || '0'),
        objet: factureRow.objet,
        notes: factureRow.notes,
      },
      client: {
        nom: factureRow.nom,
        prenom: factureRow.prenom,
        type_client: factureRow.type_client,
        cin: factureRow.cin,
        adresse: factureRow.adresse,
        telephone: factureRow.telephone,
        email: factureRow.email,
      },
      avocat: {
        nom: profile.nom,
        prenom: profile.prenom,
        email: profile.email,
        telephone: profile.telephone,
        matricule_avocat: profile.matricule_avocat,
        barreau: profile.barreau,
        adresse: profile.cabinet_adresse,
        ville: profile.cabinet_ville,
      },
      cabinet: {
        nom: profile.cabinet_nom,
        logo_url: profile.logo_url,
        rne: profile.rne,
      },
      langue: (profile.langue === 'ar' ? 'ar' : 'fr') as 'fr' | 'ar',
    }

    // Générer le PDF (import dynamique pour réduire le bundle initial)
    const NoteHonorairesPDF = await getNoteHonorairesPDFComponent()
    const pdfBuffer = await renderPdfToBuffer(
      React.createElement(NoteHonorairesPDF, pdfData)
    )

    // Retourner le PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="note-honoraires-${factureRow.numero}.pdf"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Erreur génération note honoraires PDF:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération de la note d\'honoraires' },
      { status: 500 }
    )
  }
}
