import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Route de diagnostic Google Drive
 * Test de la lecture depuis system_settings
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

export async function GET() {
  try {
    console.log('[DEBUG] Début test lecture system_settings...')

    const result = await db.query(
      `SELECT key, value FROM system_settings WHERE key = 'google_drive_service_account'`
    )

    console.log('[DEBUG] Requête exécutée, rows:', result.rows.length)

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Aucune configuration trouvée',
        rowCount: 0,
      })
    }

    const row = result.rows[0]
    const value = row.value

    console.log('[DEBUG] Type de value:', typeof value)
    console.log('[DEBUG] client_email:', value?.client_email)

    return NextResponse.json({
      success: true,
      rowCount: result.rows.length,
      valueType: typeof value,
      hasClientEmail: !!value?.client_email,
      hasPrivateKey: !!value?.private_key,
      hasType: !!value?.type,
      clientEmail: value?.client_email,
      type: value?.type,
    })
  } catch (error) {
    console.error('[DEBUG] Erreur:', error)
    return NextResponse.json({
      success: false,
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 })
  }
}
