import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * Route OAuth Callback Google Drive
 * Gère le retour de l'autorisation utilisateur et échange le code contre les tokens
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { createGoogleDriveAuthProvider } from '@/lib/integrations/cloud-storage'
import { encrypt } from '@/lib/crypto'

const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7002'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Vérifier erreur OAuth (utilisateur a refusé)
  if (error) {
    console.error('[GoogleDrive OAuth] Erreur:', error)
    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?error=access_denied&message=${encodeURIComponent('Autorisation refusée')}`
    )
  }

  // Vérifier présence code
  if (!code) {
    console.error('[GoogleDrive OAuth] Code manquant')
    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?error=missing_code&message=${encodeURIComponent('Code OAuth manquant')}`
    )
  }

  try {
    // 1. Vérifier que l'utilisateur est authentifié
    const session = await getSession()

    if (!session?.user?.id) {
      console.error('[GoogleDrive OAuth] Utilisateur non authentifié')
      return NextResponse.redirect(
        `${FRONTEND_URL}/login?error=unauthorized&message=${encodeURIComponent('Veuillez vous connecter')}`
      )
    }

    const userId = session.user.id

    // 2. Échanger code contre tokens
    console.log('[GoogleDrive OAuth] Échange code contre tokens...')
    const provider = createGoogleDriveAuthProvider()
    const tokens = await provider.exchangeCodeForTokens(code)

    // 3. Obtenir informations utilisateur Google
    console.log('[GoogleDrive OAuth] Récupération infos utilisateur...')
    const googleProvider = createGoogleDriveAuthProvider()
    googleProvider['oauth2Client'].setCredentials({
      access_token: tokens.accessToken,
    })
    const userInfo = await googleProvider.getUserInfo()

    // 4. Calculer date expiration token
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000)

    // 4.5. Chiffrer les tokens avant stockage
    console.log('[GoogleDrive OAuth] Chiffrement des tokens...')
    const encryptedAccessToken = await encrypt(tokens.accessToken)
    const encryptedRefreshToken = await encrypt(tokens.refreshToken)

    // 5. Vérifier si configuration existe déjà
    const existingConfigResult = await query(
      'SELECT id FROM cloud_providers_config WHERE user_id = $1 AND provider = $2',
      [userId, 'google_drive']
    )

    if (existingConfigResult.rows.length > 0) {
      // Mettre à jour configuration existante
      const existingConfigId = existingConfigResult.rows[0].id
      await query(
        `UPDATE cloud_providers_config SET
          access_token = $1,
          refresh_token = $2,
          token_expires_at = $3,
          enabled = $4,
          default_provider = $5,
          provider_email = $6,
          scopes = $7,
          updated_at = NOW()
        WHERE id = $8`,
        [
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          true,
          true,
          userInfo.email,
          tokens.scope.split(' '),
          existingConfigId
        ]
      )

      console.log('[GoogleDrive OAuth] Configuration mise à jour avec succès')
    } else {
      // Créer nouvelle configuration
      await query(
        `INSERT INTO cloud_providers_config (
          user_id, provider, access_token, refresh_token, token_expires_at,
          enabled, default_provider, root_folder_name, provider_email, scopes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          'google_drive',
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          true,
          true,
          'Clients Qadhya',
          userInfo.email,
          tokens.scope.split(' ')
        ]
      )

      console.log('[GoogleDrive OAuth] Configuration créée avec succès')
    }

    // 6. Rediriger vers page configuration avec message succès
    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?success=true&provider=google_drive&email=${encodeURIComponent(userInfo.email)}`
    )
  } catch (error) {
    console.error('[GoogleDrive OAuth] Erreur callback:', error)

    const errorMessage =
      getErrorMessage(error) || 'Erreur lors de la connexion à Google Drive'

    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?error=oauth_failed&message=${encodeURIComponent(errorMessage)}`
    )
  }
}
