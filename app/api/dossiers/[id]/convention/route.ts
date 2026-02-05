/**
 * API: Génération PDF Convention d'Honoraires
 *
 * GET /api/dossiers/[id]/convention
 *
 * Génère une convention d'honoraires PDF conforme ONAT pour un dossier
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { ConventionPDF } from '@/lib/pdf/convention-pdf'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    // Vérifier authentification
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const dossierId = params.id

    // Récupérer dossier avec relations
    const { data: dossier, error: dossierError } = await supabase
      .from('dossiers')
      .select(
        `
        *,
        client:clients(*),
        profile:profiles(*)
      `
      )
      .eq('id', dossierId)
      .eq('user_id', user.id)
      .single()

    if (dossierError || !dossier) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
    }

    if (!dossier.client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    // Récupérer profil avocat complet
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

    if (!profile) {
      return NextResponse.json({ error: 'Profil avocat introuvable' }, { status: 404 })
    }

    // Déterminer type honoraires et montants depuis dernière facture ou dossier
    const { data: factures } = await supabase
      .from('factures')
      .select('type_honoraires, taux_horaire, montant_ht, provisions_recues')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })
      .limit(1)

    const derniereFact = factures?.[0]

    // Données convention
    const conventionData = {
      client: {
        nom_complet: dossier.client.denomination
          ? dossier.client.denomination
          : `${dossier.client.nom} ${dossier.client.prenom || ''}`.trim(),
        adresse: dossier.client.adresse || 'Adresse non renseignée',
        cin: dossier.client.cin,
        type_client: dossier.client.type_client || 'PERSONNE_PHYSIQUE',
        denomination: dossier.client.denomination,
        registre_commerce: dossier.client.registre_commerce,
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
        numero_dossier: dossier.numero_dossier,
        objet: dossier.objet,
        type_procedure: dossier.type_procedure || 'Civil',
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
    const pdfBuffer = await renderToBuffer(pdfElement)

    // Retourner PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Convention-Honoraires-${dossier.numero_dossier}.pdf"`,
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
