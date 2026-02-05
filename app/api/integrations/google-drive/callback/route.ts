/**
 * Route OAuth Callback Google Drive
 * Gère le retour de l'autorisation utilisateur et échange le code contre les tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGoogleDriveAuthProvider } from '@/lib/integrations/cloud-storage'

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
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[GoogleDrive OAuth] Utilisateur non authentifié:', authError)
      return NextResponse.redirect(
        `${FRONTEND_URL}/login?error=unauthorized&message=${encodeURIComponent('Veuillez vous connecter')}`
      )
    }

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

    // 5. Vérifier si configuration existe déjà
    const { data: existingConfig } = await supabase
      .from('cloud_providers_config')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', 'google_drive')
      .single()

    if (existingConfig) {
      // Mettre à jour configuration existante
      const { error: updateError } = await supabase
        .from('cloud_providers_config')
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: tokenExpiresAt.toISOString(),
          enabled: true,
          default_provider: true,
          provider_email: userInfo.email,
          scopes: tokens.scope.split(' '),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConfig.id)

      if (updateError) {
        throw new Error(
          `Échec mise à jour configuration: ${updateError.message}`
        )
      }

      console.log('[GoogleDrive OAuth] Configuration mise à jour avec succès')
    } else {
      // Créer nouvelle configuration
      const { error: insertError } = await supabase
        .from('cloud_providers_config')
        .insert({
          user_id: user.id,
          provider: 'google_drive',
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: tokenExpiresAt.toISOString(),
          enabled: true,
          default_provider: true,
          root_folder_name: 'Clients MonCabinet',
          provider_email: userInfo.email,
          scopes: tokens.scope.split(' '),
        })

      if (insertError) {
        throw new Error(
          `Échec création configuration: ${insertError.message}`
        )
      }

      console.log('[GoogleDrive OAuth] Configuration créée avec succès')
    }

    // 6. Rediriger vers page configuration avec message succès
    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?success=true&provider=google_drive&email=${encodeURIComponent(userInfo.email)}`
    )
  } catch (error: any) {
    console.error('[GoogleDrive OAuth] Erreur callback:', error)

    const errorMessage =
      error.message || 'Erreur lors de la connexion à Google Drive'

    return NextResponse.redirect(
      `${FRONTEND_URL}/settings/cloud-storage?error=oauth_failed&message=${encodeURIComponent(errorMessage)}`
    )
  }
}
