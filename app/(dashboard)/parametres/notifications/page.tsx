import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NotificationPreferencesForm from '@/components/parametres/NotificationPreferencesForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell } from 'lucide-react'

export const metadata = {
  title: 'Préférences Notifications - Paramètres',
  description: 'Gérer vos préférences de notifications email',
}

export default async function NotificationsPreferencesPage() {
  const supabase = await createClient()

  // Vérifier authentification
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer préférences actuelles (ou créer par défaut)
  let { data: preferences, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Si pas de préférences, créer avec valeurs par défaut
  if (error && error.code === 'PGRST116') {
    const { data: newPrefs, error: insertError } = await supabase
      .from('notification_preferences')
      .insert({
        user_id: user.id,
        // Valeurs par défaut déjà définies dans la migration
      })
      .select()
      .single()

    if (!insertError && newPrefs) {
      preferences = newPrefs
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-2">
          Gérez vos préférences de notifications et alertes par email
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Préférences de notifications</CardTitle>
            </div>
            <CardDescription>
              Personnalisez les alertes que vous souhaitez recevoir par email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPreferencesForm preferences={preferences} userId={user.id} />
          </CardContent>
        </Card>

        {/* Informations */}
        <Card>
          <CardHeader>
            <CardTitle>À propos des notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-semibold text-foreground mb-2">Email quotidien</h4>
              <p>
                Recevez un récapitulatif quotidien de vos échéances, actions urgentes et audiences à venir.
                L'email est envoyé tous les matins à l'heure que vous avez choisie.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">Alertes échéances</h4>
              <p>
                Soyez alerté automatiquement avant les échéances importantes (J-15, J-7, J-3, J-1).
                Cela vous aide à ne jamais manquer un délai légal.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">Délais légaux</h4>
              <p>
                Les alertes pour les délais légaux (appel, cassation, opposition) sont calculées automatiquement
                selon le type de procédure :
              </p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Appel civil : 20 jours</li>
                <li>Appel commercial : 10 jours ⚠️</li>
                <li>Cassation : 60 jours</li>
                <li>Opposition : 10 jours</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">Factures impayées</h4>
              <p>
                Recevez une alerte lorsqu'une facture reste impayée au-delà du délai que vous avez défini
                (par défaut : 30 jours).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
