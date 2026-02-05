import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { FacturePDF } from '@/lib/pdf/facture-pdf'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Récupérer la facture avec les relations
    const { data: facture, error: factureError } = await supabase
      .from('factures')
      .select(
        `
        *,
        clients (
          id,
          nom,
          prenom,
          denomination,
          type,
          cin,
          adresse,
          ville,
          code_postal,
          telephone,
          email
        )
      `
      )
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (factureError || !facture) {
      return NextResponse.json(
        { error: 'Facture non trouvée' },
        { status: 404 }
      )
    }

    // Récupérer le profil de l'avocat
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profil avocat non trouvé' },
        { status: 404 }
      )
    }

    // Préparer les données pour le PDF
    const pdfData = {
      facture: {
        id: facture.id,
        numero_facture: facture.numero_facture,
        date_emission: facture.date_emission,
        date_echeance: facture.date_echeance,
        date_paiement: facture.date_paiement,
        montant_ht: parseFloat(facture.montant_ht),
        taux_tva: parseFloat(facture.taux_tva),
        montant_tva: parseFloat(facture.montant_tva),
        montant_ttc: parseFloat(facture.montant_ttc),
        statut: facture.statut,
        objet: facture.objet,
        notes: facture.notes,
      },
      client: {
        nom: facture.clients.nom,
        prenom: facture.clients.prenom,
        denomination: facture.clients.denomination,
        type: facture.clients.type,
        cin: facture.clients.cin,
        adresse: facture.clients.adresse,
        ville: facture.clients.ville,
        code_postal: facture.clients.code_postal,
        telephone: facture.clients.telephone,
        email: facture.clients.email,
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
      langue: 'fr' as const, // TODO: Récupérer depuis préférences utilisateur
    }

    // Générer le PDF
    const pdfBuffer = await renderToBuffer(React.createElement(FacturePDF, pdfData))

    // Retourner le PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="facture-${facture.numero_facture}.pdf"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Erreur génération PDF:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération du PDF' },
      { status: 500 }
    )
  }
}
