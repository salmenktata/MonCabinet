/**
 * API: Génération PDF Convention d'Honoraires
 *
 * GET /api/dossiers/[id]/convention
 *
 * Génère une convention d'honoraires PDF conforme ONAT pour un dossier
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { ConventionPDF } from '@/lib/pdf/convention-pdf'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: dossierId } = await params

    // Vérifier authentification
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer dossier avec client
    const dossierResult = await query(
      `SELECT d.*,
        c.id as client_id, c.nom, c.prenom, c.type_client,
        c.cin, c.adresse
       FROM dossiers d
       JOIN clients c ON d.client_id = c.id
       WHERE d.id = $1 AND d.user_id = $2`,
      [dossierId, userId]
    )

    if (dossierResult.rows.length === 0) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }

    const dossier = dossierResult.rows[0]

    // Récupérer profil avocat complet
    const profileResult = await query(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    )

    if (profileResult.rows.length === 0) {
      return NextResponse.json({ error: 'Profil avocat introuvable' }, { status: 404 })
    }

    const profile = profileResult.rows[0]

    // Déterminer type honoraires et montants depuis dernière facture ou dossier
    const facturesResult = await query(
      `SELECT type_honoraires, taux_horaire, montant_ht, provisions_recues
       FROM factures
       WHERE dossier_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [dossierId]
    )

    const derniereFact = facturesResult.rows[0]

    // Données convention
    const conventionData = {
      client: {
        nom_complet: dossier.type_client === 'personne_morale'
          ? dossier.nom
          : `${dossier.nom} ${dossier.prenom || ''}`.trim(),
        adresse: dossier.adresse || 'Adresse non renseignée',
        cin: dossier.cin,
        type_client: dossier.type_client || 'personne_physique',
      },
      avocat: {
        nom: profile.nom || 'Non renseigné',
        prenom: profile.prenom || '',
        matricule: profile.matricule_onat || 'Non renseigné',
        barreau: profile.barreau || 'Tunis',
      },
      cabinet: {
        nom: profile.cabinet_nom || `Cabinet Maître ${profile.nom}`,
        adresse: profile.cabinet_adresse || profile.adresse || 'Adresse non renseignée',
      },
      dossier: {
        numero: dossier.numero,
        objet: dossier.objet,
        type_procedure: dossier.type_procedure || 'civil',
        tribunal: dossier.tribunal,
      },
      type_honoraires: derniereFact?.type_honoraires || 'forfait',
      montant_forfait: derniereFact?.type_honoraires === 'forfait' ? derniereFact.montant_ht : undefined,
      taux_horaire: derniereFact?.taux_horaire,
      honoraires_succes:
        derniereFact?.type_honoraires === 'resultat' || derniereFact?.type_honoraires === 'mixte' ? 15 : undefined,
      provision_initiale: derniereFact?.provisions_recues || 0,
      modalites_paiement: 'Paiement échelonné selon avancement du dossier',
      date_signature: new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      ville: profile.ville || 'Tunis',
    }

    // Générer PDF
    const pdfElement = createElement(ConventionPDF, conventionData)
    const pdfBuffer = await renderToBuffer(pdfElement as any)

    // Retourner PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Convention-Honoraires-${dossier.numero}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Erreur génération convention PDF:', error)
    return NextResponse.json(
      {
        error: 'Erreur génération PDF',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
