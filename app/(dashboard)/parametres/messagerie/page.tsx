/**
 * Page Configuration Messagerie
 * Configuration WhatsApp Business pour réception automatique documents clients
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMessagingConfigAction } from '@/app/actions/messaging'
import MessagingConfig from '@/components/parametres/MessagingConfig'
import { MessageSquare, Lock, Globe } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default async function MessagerieSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/connexion')
  }

  // Récupérer configuration existante
  const result = await getMessagingConfigAction()
  const existingConfig = result.data || null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Réception Documents</h1>
        <p className="text-muted-foreground mt-2">
          Configurez WhatsApp Business pour recevoir automatiquement les documents de vos clients
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-green-100 p-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle className="text-base">Automatisation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Vos clients envoient documents par WhatsApp, rattachement automatique aux dossiers
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-100 p-2">
                <Lock className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle className="text-base">Sécurité</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Webhooks sécurisés avec validation HMAC SHA256, identification clients automatique
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-purple-100 p-2">
                <Globe className="h-5 w-5 text-purple-600" />
              </div>
              <CardTitle className="text-base">WhatsApp Business</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Intégration officielle avec WhatsApp Business API (Meta Graph API v21.0)
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Alert Guide Configuration */}
      <Alert>
        <AlertDescription>
          <div className="space-y-2">
            <p className="font-medium">📋 Guide de configuration WhatsApp Business</p>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>
                Créez un compte{' '}
                <a
                  href="https://business.facebook.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Meta Business Manager
                </a>
              </li>
              <li>
                Créez une application{' '}
                <a
                  href="https://developers.facebook.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Facebook Developers
                </a>
              </li>
              <li>Activez le produit &quot;WhatsApp&quot; dans votre application</li>
              <li>Ajoutez un numéro de téléphone WhatsApp Business</li>
              <li>Copiez les identifiants ci-dessous (Phone Number ID, Business Account ID, Access Token)</li>
              <li>Configurez le webhook dans Meta avec l&apos;URL affichée plus bas</li>
            </ol>
          </div>
        </AlertDescription>
      </Alert>

      {/* Composant Configuration */}
      <MessagingConfig existingConfig={existingConfig} />
    </div>
  )
}
