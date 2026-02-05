/**
 * Webhook Flouci - Notifications paiements
 *
 * URL webhook à configurer dans dashboard Flouci:
 * https://votre-domaine.tn/api/webhooks/flouci
 *
 * Événements reçus:
 * - Payment SUCCESS → Marquer facture PAYÉE (trigger auto DB)
 * - Payment FAILED → Log échec
 * - Payment EXPIRED → Log expiration
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { flouciClient, mapperStatutFlouci, FlouciUtils, type FlouciWebhookPayload } from '@/lib/integrations/flouci'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role pour bypass RLS
)

/**
 * POST /api/webhooks/flouci
 *
 * Webhook appelé par Flouci après changement statut paiement
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Lire payload
    const body = await request.text()
    const payload: FlouciWebhookPayload = JSON.parse(body)

    console.log('[Flouci Webhook] Payload reçu:', payload)

    // 2. Valider signature (si configuré)
    const signature = request.headers.get('x-flouci-signature')
    if (signature && !flouciClient.validateWebhookSignature(body, signature)) {
      console.error('[Flouci Webhook] Signature invalide')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // 3. Vérifier champs requis
    if (!payload.payment_id || !payload.status) {
      console.error('[Flouci Webhook] Champs manquants:', payload)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 4. Récupérer transaction Flouci existante
    const { data: transaction, error: fetchError } = await supabase
      .from('flouci_transactions')
      .select('*, factures(numero_facture, statut)')
      .eq('flouci_payment_id', payload.payment_id)
      .single()

    if (fetchError || !transaction) {
      console.error('[Flouci Webhook] Transaction introuvable:', payload.payment_id, fetchError)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // 5. Mapper statut Flouci
    const nouveauStatut = mapperStatutFlouci(payload.status)

    // 6. Mettre à jour transaction
    const updateData: any = {
      status: nouveauStatut,
      flouci_transaction_id: payload.transaction_id,
      flouci_response: payload,
      webhook_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Si completed, ajouter date completion
    if (nouveauStatut === 'completed') {
      updateData.completed_at = payload.created_at || new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('flouci_transactions')
      .update(updateData)
      .eq('id', transaction.id)

    if (updateError) {
      console.error('[Flouci Webhook] Erreur mise à jour transaction:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    console.log(`[Flouci Webhook] Transaction ${payload.payment_id} → ${nouveauStatut}`)

    // 7. Si SUCCESS, trigger DB marquera automatiquement facture comme PAYÉE
    if (nouveauStatut === 'completed') {
      console.log(`[Flouci Webhook] ✅ Paiement réussi - Facture ${transaction.factures?.numero_facture} marquée PAYÉE (trigger auto)`)

      // Optionnel: Envoyer email confirmation au client
      // await envoyerEmailConfirmationPaiement(transaction.facture_id)
    }

    // 8. Retourner succès à Flouci
    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
      payment_id: payload.payment_id,
      status: nouveauStatut,
    })
  } catch (error) {
    console.error('[Flouci Webhook] Erreur:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/webhooks/flouci
 *
 * Endpoint de test pour vérifier que le webhook est accessible
 */
export async function GET() {
  return NextResponse.json({
    service: 'Flouci Webhook',
    status: 'active',
    url: '/api/webhooks/flouci',
    methods: ['POST'],
  })
}
