/**
 * Webhook Flouci — Confirmation paiement facture
 *
 * POST /api/flouci/webhook
 *
 * Flouci appelle cet endpoint quand un paiement est confirmé, échoué ou expiré.
 * La signature HMAC SHA-256 est vérifiée avant tout traitement.
 *
 * Flux:
 * 1. Flouci POST → vérification signature → mise à jour flouci_transactions
 * 2. Si SUCCESS → mise à jour facture.statut = 'payee'
 */

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { query } from '@/lib/db/postgres'
import { flouciClient, FlouciWebhookPayload, mapperStatutFlouci } from '@/lib/integrations/flouci'
import { createLogger } from '@/lib/logger'

const log = createLogger('FlouciWebhook')

// Endpoint non authentifié (appelé par Flouci), mais signé HMAC
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let rawBody: string

  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Corps de requête illisible' }, { status: 400 })
  }

  // 1. Valider la signature HMAC
  const signature = request.headers.get('x-flouci-signature') || ''
  if (!signature) {
    log.warn('Webhook Flouci sans signature')
    return NextResponse.json({ error: 'Signature manquante' }, { status: 401 })
  }

  const isValid = flouciClient.validateWebhookSignature(rawBody, signature)
  if (!isValid) {
    log.warn('Webhook Flouci signature invalide', { signature: signature.slice(0, 20) })
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  // 2. Parser le payload
  let payload: FlouciWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Payload JSON invalide' }, { status: 400 })
  }

  const { payment_id, transaction_id, amount, status, developer_tracking_id } = payload

  if (!payment_id || !status) {
    return NextResponse.json({ error: 'payment_id et status requis' }, { status: 400 })
  }

  log.info('Webhook Flouci reçu', { payment_id, status, developer_tracking_id })

  const dbStatus = mapperStatutFlouci(status)

  try {
    // 3. Mettre à jour la transaction Flouci
    // Note: le trigger DB `trigger_flouci_marquer_facture_payee` met automatiquement
    // la facture en statut PAYEE quand status passe à 'completed'
    const transactionResult = await query(
      `UPDATE flouci_transactions
       SET status = $1,
           flouci_transaction_id = COALESCE($2, flouci_transaction_id),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           webhook_received_at = NOW()
       WHERE flouci_payment_id = $3
       RETURNING id, facture_id, montant`,
      [dbStatus, transaction_id || null, payment_id]
    )

    if (transactionResult.rows.length === 0) {
      log.warn('Webhook Flouci: transaction inconnue', { payment_id })
      // Répondre 200 pour éviter que Flouci ne réessaie indéfiniment
      return NextResponse.json({ received: true })
    }

    const transaction = transactionResult.rows[0]

    if (status === 'SUCCESS') {
      log.info('Paiement Flouci confirmé', {
        facture_id: transaction.facture_id,
        montant: transaction.montant,
        payment_id,
      })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    log.error('Erreur traitement webhook Flouci', { error, payment_id })
    Sentry.captureException(error, { extra: { payment_id, status } })
    // Répondre 500 pour que Flouci réessaie
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
