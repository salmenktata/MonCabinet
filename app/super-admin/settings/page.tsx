import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getConfigsByCategory } from '@/lib/config/platform-config'
import AIFlowDiagram from '@/components/super-admin/settings/AIFlowDiagram'
import ProviderConfigTable from '@/components/super-admin/settings/ProviderConfigTable'

const BrevoTestButton = dynamic(
  () => import('@/components/super-admin/settings/BrevoTestButton').then(mod => mod.BrevoTestButton),
  { loading: () => <Skeleton className="h-9 w-24" /> }
)
const DailyDigestStatus = dynamic(
  () => import('@/components/super-admin/settings/DailyDigestStatus').then(mod => mod.DailyDigestStatus),
  { loading: () => <Skeleton className="h-24 w-full" /> }
)
const ApiKeysDBCard = dynamic(
  () => import('@/components/super-admin/settings/ApiKeysDBCard').then(mod => mod.ApiKeysDBCard),
  { loading: () => <Skeleton className="h-64 w-full" /> }
)
const PurgeRAGCard = dynamic(
  () => import('@/components/super-admin/settings/PurgeRAGCard').then(mod => mod.PurgeRAGCard),
  { loading: () => <Skeleton className="h-32 w-full" /> }
)

export default async function SettingsPage() {
  // Charger les clés depuis la base de données
  const emailConfigs = await getConfigsByCategory('email')
  const authConfigs = await getConfigsByCategory('auth')

  // Helper pour obtenir la valeur d'une clé
  const getValue = (key: string): string | undefined => {
    const config = [...emailConfigs, ...authConfigs].find(c => c.key === key)
    return config?.value || process.env[key]
  }

  // Ces variables sont lues côté serveur (avec fallback env)
  const brevoConfigured = !!getValue('BREVO_API_KEY')
  const resendConfigured = !!getValue('RESEND_API_KEY')
  const cronConfigured = !!getValue('CRON_SECRET')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Paramètres</h2>
        <p className="text-slate-400">Configuration globale de la plateforme</p>
      </div>

      <Tabs defaultValue="ai-architecture" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800 border-slate-700">
          <TabsTrigger value="ai-architecture" className="data-[state=active]:bg-slate-700">
            ⚡ Architecture IA
          </TabsTrigger>
          <TabsTrigger value="email" className="data-[state=active]:bg-slate-700">
            📧 Email
          </TabsTrigger>
          <TabsTrigger value="system" className="data-[state=active]:bg-slate-700">
            🗄️ Système
          </TabsTrigger>
          <TabsTrigger value="danger-zone" className="data-[state=active]:bg-slate-700">
            ⚠️ Zone Dangereuse
          </TabsTrigger>
        </TabsList>

        {/* Tab 1 : Architecture IA */}
        <TabsContent value="ai-architecture" className="space-y-6 mt-6">
          {/* Schéma de flux IA */}
          <AIFlowDiagram />

          {/* Configuration des providers */}
          <ProviderConfigTable />
        </TabsContent>

        {/* Tab 2 : Email */}
        <TabsContent value="email" className="space-y-6 mt-6">
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
        </TabsContent>

        {/* Tab 3 : Système */}
        <TabsContent value="system" className="space-y-6 mt-6">
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
                <p className="text-sm text-slate-400 mt-2">
                  Les limites sont actuellement codées en dur dans l'application
                </p>
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
                  <p className="text-white font-medium">Qadhya v1.0.0</p>
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

          {/* Clés API depuis Base de Données (référence historique) */}
          <ApiKeysDBCard />
        </TabsContent>

        {/* Tab 4 : Zone Dangereuse */}
        <TabsContent value="danger-zone" className="space-y-6 mt-6">
          <PurgeRAGCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
