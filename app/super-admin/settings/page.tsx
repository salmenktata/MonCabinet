import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { BrevoTestButton } from '@/components/super-admin/settings/BrevoTestButton'
import { DailyDigestStatus } from '@/components/super-admin/settings/DailyDigestStatus'

export default function SettingsPage() {
  // Ces variables sont lues côté serveur
  const brevoConfigured = !!process.env.BREVO_API_KEY
  const resendConfigured = !!process.env.RESEND_API_KEY
  const openaiConfigured = !!process.env.OPENAI_API_KEY
  const ollamaConfigured = !!process.env.OLLAMA_BASE_URL
  const cronConfigured = !!process.env.CRON_SECRET

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Paramètres</h2>
        <p className="text-slate-400">Configuration globale de la plateforme</p>
      </div>

      {/* Configuration Email */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.mail className="h-5 w-5" />
            Configuration Email
          </CardTitle>
          <CardDescription className="text-slate-400">
            Paramètres Resend / Brevo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div>
                <p className="font-medium text-white">Resend API</p>
                <p className="text-sm text-slate-400">Service d'envoi d'emails transactionnels</p>
              </div>
              <Badge className={resendConfigured ? 'bg-green-500' : 'bg-red-500'}>
                {resendConfigured ? 'Configuré' : 'Non configuré'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div className="flex-1">
                <p className="font-medium text-white">Brevo API</p>
                <p className="text-sm text-slate-400">Service de notifications quotidiennes</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={brevoConfigured ? 'bg-green-500' : 'bg-red-500'}>
                  {brevoConfigured ? 'Configuré' : 'Non configuré'}
                </Badge>
                {brevoConfigured && <BrevoTestButton />}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Quotidiennes */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.bell className="h-5 w-5" />
            Notifications Quotidiennes
          </CardTitle>
          <CardDescription className="text-slate-400">
            Daily Digest - Récapitulatif quotidien envoyé aux utilisateurs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyDigestStatus
            brevoConfigured={brevoConfigured}
            cronConfigured={cronConfigured}
          />
        </CardContent>
      </Card>

      {/* Configuration Plans */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.creditCard className="h-5 w-5" />
            Configuration des Plans
          </CardTitle>
          <CardDescription className="text-slate-400">
            Définir les limites par plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-slate-400 text-center py-8">
            <Icons.settings className="h-12 w-12 mx-auto mb-4 text-slate-600" />
            <p>Configuration des plans à venir</p>
            <p className="text-sm text-slate-500 mt-2">
              Les limites sont actuellement codées en dur dans l'application
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuration IA */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.zap className="h-5 w-5" />
            Configuration IA
          </CardTitle>
          <CardDescription className="text-slate-400">
            Paramètres OpenAI / Ollama
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div>
                <p className="font-medium text-white">OpenAI API</p>
                <p className="text-sm text-slate-400">GPT-4, Embeddings, etc.</p>
              </div>
              <Badge className={openaiConfigured ? 'bg-green-500' : 'bg-red-500'}>
                {openaiConfigured ? 'Configuré' : 'Non configuré'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div>
                <p className="font-medium text-white">Ollama (Local)</p>
                <p className="text-sm text-slate-400">Modèles locaux</p>
              </div>
              <Badge className={ollamaConfigured ? 'bg-green-500' : 'bg-yellow-500'}>
                {ollamaConfigured ? 'Configuré' : 'Optionnel'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Base de données */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.layers className="h-5 w-5" />
            Base de Données
          </CardTitle>
          <CardDescription className="text-slate-400">
            PostgreSQL avec pgvector
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div>
                <p className="font-medium text-white">PostgreSQL</p>
                <p className="text-sm text-slate-400">Base de données principale</p>
              </div>
              <Badge className="bg-green-500">Connecté</Badge>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
              <div>
                <p className="font-medium text-white">pgvector</p>
                <p className="text-sm text-slate-400">Extension pour embeddings</p>
              </div>
              <Badge className="bg-green-500">Activé</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations système */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Icons.info className="h-5 w-5" />
            Informations Système
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-slate-700/50">
              <p className="text-sm text-slate-400">Version</p>
              <p className="text-white font-medium">MonCabinet v1.0.0</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-700/50">
              <p className="text-sm text-slate-400">Environnement</p>
              <p className="text-white font-medium">{process.env.NODE_ENV}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-700/50">
              <p className="text-sm text-slate-400">URL de l'application</p>
              <p className="text-white font-medium">{process.env.NEXT_PUBLIC_APP_URL || 'Non défini'}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-700/50">
              <p className="text-sm text-slate-400">Timezone</p>
              <p className="text-white font-medium">Africa/Tunis (UTC+1)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
