import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationPreferencesForm from '@/components/parametres/NotificationPreferencesForm'
import type { NotificationPreferences } from '@/app/actions/notifications'

export const metadata = {
  title: 'Notifications - Paramètres - Avocat SaaS',
  description: 'Gérer vos préférences de notifications quotidiennes',
}

// Préférences par défaut
const defaultPreferences: NotificationPreferences = {
  enabled: true,
  send_time: '06:00',
  notify_echeances: {
    j15: true,
    j7: true,
    j3: true,
    j1: true,
  },
  notify_actions_urgentes: true,
  notify_audiences: true,
  notify_factures_impayees: true,
  factures_seuil_jours: 30,
  langue_email: 'fr',
  format_email: 'html',
}

export default async function NotificationParametresPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le profil avec les préférences
  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', user.id)
    .single()

  // Fusionner avec les préférences par défaut
  const preferences: NotificationPreferences = {
    ...defaultPreferences,
    ...(profile?.notification_preferences || {}),
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Paramètres de Notifications</h1>
        <p className="mt-2 text-muted-foreground">
          Configurez vos notifications quotidiennes pour rester informé de vos tâches importantes
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <NotificationPreferencesForm preferences={preferences} />
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="font-semibold text-yellow-900">📬 Que contient le digest quotidien ?</h3>
        <ul className="mt-2 space-y-1 text-sm text-yellow-800">
          <li>
            • <strong>Échéances</strong> : Délais légaux à surveiller (appel, cassation, etc.)
          </li>
          <li>
            • <strong>Actions urgentes</strong> : Tâches avec priorité HAUTE ou URGENTE
          </li>
          <li>
            • <strong>Audiences</strong> : Séances prévues dans les 7 prochains jours
          </li>
          <li>
            • <strong>Factures</strong> : Factures impayées dépassant le seuil configuré
          </li>
        </ul>
      </div>
    </div>
  )
}
