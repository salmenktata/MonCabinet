/**
 * API: Créer paiement Flouci pour une facture
 *
 * POST /api/factures/flouci/create-payment
 *
 * Body:
 * - facture_id: UUID de la facture
 * - montant_ttc: Montant TTC en TND
 * - client_telephone: Téléphone client (optionnel)
 * - client_nom: Nom client
 *
 * Retourne:
 * - payment_id: ID unique paiement Flouci
 * - qr_code_url: URL image QR code
 * - payment_url: URL paiement web
 * - deep_link: Deep link app Flouci
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/postgres'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { flouciClient, FlouciUtils } from '@/lib/integrations/flouci'

export async function POST(request: NextRequest) {
  try {
    // 1. Vérifier authentification
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const userId = session.user.id

    // 2. Lire body
    const body = await request.json()
    const { facture_id, montant_ttc, client_telephone, client_nom } = body

    if (!facture_id || !montant_ttc) {
      return NextResponse.json({ error: 'facture_id et montant_ttc requis' }, { status: 400 })
    }

    // 3. Vérifier que la facture existe et n'est pas déjà payée
    const factureResult = await query(
      'SELECT id, numero, montant_ttc, statut FROM factures WHERE id = $1 AND user_id = $2',
      [facture_id, userId]
    )

    if (factureResult.rows.length === 0) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    const facture = factureResult.rows[0]

    if (facture.statut === 'payee') {
      return NextResponse.json({ error: 'Facture déjà payée' }, { status: 400 })
    }

    // 4. Vérifier si un paiement Flouci existe déjà pour cette facture (non expiré)
    const existingTransactionResult = await query(
      `SELECT flouci_payment_id, qr_code_url, payment_url, deep_link, status, expired_at
       FROM flouci_transactions
       WHERE facture_id = $1
         AND status IN ('pending', 'initiated')
         AND expired_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [facture_id]
    )

    if (existingTransactionResult.rows.length > 0) {
      // Retourner paiement existant
      const existingTransaction = existingTransactionResult.rows[0]
      const commission = FlouciUtils.calculerCommission(montant_ttc)

      return NextResponse.json({
        payment_id: existingTransaction.flouci_payment_id,
        qr_code_url: existingTransaction.qr_code_url,
        payment_url: existingTransaction.payment_url,
        deep_link: existingTransaction.deep_link,
        montant: montant_ttc,
        commission,
        status: existingTransaction.status,
        message: 'Paiement existant retourné',
      })
    }

    // 5. Créer nouveau paiement Flouci
    const montantMillimes = FlouciUtils.tndToMillimes(montant_ttc)
    const commission = FlouciUtils.calculerCommission(montant_ttc)

    const paymentResponse = await flouciClient.createPayment({
      amount: montantMillimes,
      developer_tracking_id: facture_id,
      session_timeout_secs: 900, // 15 minutes
      success_link: `${process.env.NEXT_PUBLIC_APP_URL}/factures/${facture_id}?payment=success`,
      fail_link: `${process.env.NEXT_PUBLIC_APP_URL}/factures/${facture_id}?payment=failed`,
    })

    if (!paymentResponse.result?.success || !paymentResponse.result?.payment_id) {
      throw new Error('Échec création paiement Flouci: ' + (paymentResponse.result?.message || 'Erreur inconnue'))
    }

    const paymentId = paymentResponse.result.payment_id
    const qrCodeURL = flouciClient.getQRCodeURL(paymentId)
    const deepLink = flouciClient.getDeepLink(paymentId)
    const paymentURL = paymentResponse.result._link || `${process.env.FLOUCI_API_URL}/payment/${paymentId}`

    // 6. Enregistrer transaction dans la base de données
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000)

    await query(
      `INSERT INTO flouci_transactions (
        facture_id, flouci_payment_id, montant, commission_flouci, status,
        client_telephone, client_nom, qr_code_url, payment_url, deep_link,
        flouci_response, initiated_at, expired_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)`,
      [
        facture_id,
        paymentId,
        montant_ttc,
        commission,
        'pending',
        client_telephone || null,
        client_nom || null,
        qrCodeURL,
        paymentURL,
        deepLink,
        JSON.stringify(paymentResponse.result),
        expiredAt
      ]
    )

    // 7. Retourner données paiement
    return NextResponse.json({
      success: true,
      payment_id: paymentId,
      qr_code_url: qrCodeURL,
      payment_url: paymentURL,
      deep_link: deepLink,
      montant: montant_ttc,
      commission,
      expires_in_minutes: 15,
    })
  } catch (error) {
    console.error('Erreur création paiement Flouci:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
