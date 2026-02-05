'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface NotificationPreferences {
  enabled: boolean
  send_time: string
  notify_echeances: {
    j15: boolean
    j7: boolean
    j3: boolean
    j1: boolean
  }
  notify_actions_urgentes: boolean
  notify_audiences: boolean
  notify_factures_impayees: boolean
  factures_seuil_jours: number
  langue_email: 'fr' | 'ar'
  format_email: 'html' | 'text'
}

export async function updateNotificationPreferencesAction(
  preferences: NotificationPreferences
) {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Validation
    if (preferences.enabled) {
      // Vérifier qu'au moins un type de notification est activé
      const hasAnyNotification =
        Object.values(preferences.notify_echeances).some((v) => v) ||
        preferences.notify_actions_urgentes ||
        preferences.notify_audiences ||
        preferences.notify_factures_impayees

      if (!hasAnyNotification) {
        return {
          error: 'Veuillez activer au moins un type de notification',
        }
      }
    }

    // Valider heure (06:00-10:00)
    const [hours] = preferences.send_time.split(':').map(Number)
    if (hours < 6 || hours > 10) {
      return {
        error: 'L\'heure d\'envoi doit être entre 06:00 et 10:00',
      }
    }

    // Valider seuil factures (15-90 jours)
    if (
      preferences.factures_seuil_jours < 15 ||
      preferences.factures_seuil_jours > 90
    ) {
      return {
        error: 'Le seuil des factures doit être entre 15 et 90 jours',
      }
    }

    // Mettre à jour les préférences
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        notification_preferences: preferences,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Erreur mise à jour préférences:', updateError)
      return { error: 'Erreur lors de la mise à jour des préférences' }
    }

    revalidatePath('/parametres/notifications')
    return { success: true }
  } catch (error) {
    console.error('Erreur updateNotificationPreferences:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function testNotificationAction() {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Non authentifié' }
    }

    // Appeler la Edge Function directement
    const { data, error } = await supabase.functions.invoke('send-notifications', {
      body: {
        test_mode: true,
        user_id: user.id,
      },
    })

    if (error) {
      console.error('Erreur test notification:', error)
      return {
        error: 'Erreur lors du test de notification',
      }
    }

    return {
      success: true,
      message: 'Email de test envoyé avec succès ! Vérifiez votre boîte de réception.',
      data,
    }
  } catch (error) {
    console.error('Erreur testNotification:', error)
    return { error: 'Erreur lors du test' }
  }
}
