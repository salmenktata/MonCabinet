import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import CloudStorageConfig from '@/components/parametres/CloudStorageConfig'

export const metadata = {
  title: 'Stockage Cloud - Qadhya',
  description: 'Configurer le stockage de vos documents sur Google Drive',
}

export default async function CloudStorageParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const t = await getTranslations('settings')

  // Récupérer la configuration cloud
  const result = await query(
    'SELECT * FROM cloud_providers_config WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.id]
  )
  const cloudConfigs = result.rows

  // Sanitize tokens sensibles avant d'envoyer au client
  const sanitizedConfigs = cloudConfigs?.map((config) => ({
    id: config.id,
    provider: config.provider,
    enabled: config.enabled,
    default_provider: config.default_provider,
    provider_email: config.provider_email,
    sync_enabled: config.sync_enabled,
    sync_frequency: config.sync_frequency,
    last_sync_at: config.last_sync_at,
    created_at: config.created_at,
    updated_at: config.updated_at,
    root_folder_name: config.root_folder_name,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('cloudStorageTitle')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('cloudStorageSubtitle')}
        </p>
      </div>

      <CloudStorageConfig
        initialConfigs={sanitizedConfigs || []}
        searchParams={params}
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">🔐 {t('cloudSecurityTitle')}</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            • Vos documents sont stockés sur <strong>VOTRE</strong> Google Drive, pas sur nos serveurs
          </li>
          <li>
            • L&apos;application n&apos;a accès qu&apos;aux fichiers qu&apos;elle crée (scope <code>drive.file</code>)
          </li>
          <li>• Les tokens sont chiffrés et stockés de manière sécurisée</li>
          <li>
            • Vous pouvez révoquer l&apos;accès à tout moment depuis cette page ou votre compte Google
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="font-semibold text-green-900">📁 {t('cloudFolderTitle')}</h3>
        <div className="mt-2 text-sm text-green-800">
          <p className="mb-2">L&apos;application crée automatiquement cette structure dans votre Google Drive :</p>
          <pre className="rounded bg-green-100 p-2 font-mono text-xs">
            {`Clients Qadhya/
├── [DUPONT Jean - CIN 12345678]/
│   ├── Dossier 2025-001 (Divorce)/
│   │   ├── Requête.pdf
│   │   └── Jugement.pdf
│   ├── Dossier 2025-015 (Succession)/
│   └── Documents non classés/
│
└── [MARTIN Sophie - Société SARL]/
    └── Dossier 2025-003 (Commercial)/`}
          </pre>
          <p className="mt-2">
            • <strong>Dossier client</strong> : Un dossier par client (nom + CIN ou dénomination sociale)
          </p>
          <p>
            • <strong>Dossier juridique</strong> : Un sous-dossier par dossier juridique (numéro + objet)
          </p>
          <p>
            • <strong>Documents non classés</strong> : Zone tampon pour documents reçus avant rattachement
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h3 className="font-semibold text-purple-900">🔄 {t('cloudSyncTitle')}</h3>
        <ul className="mt-2 space-y-1 text-sm text-purple-800">
          <li>
            • Activez la synchronisation pour que les documents ajoutés manuellement dans Google Drive apparaissent automatiquement dans l&apos;application
          </li>
          <li>
            • Les fichiers placés dans &quot;Documents non classés/&quot; apparaîtront dans le widget &quot;Documents à classer&quot;
          </li>
          <li>
            • Fréquence de synchronisation : Choisissez entre 15, 30 ou 60 minutes
          </li>
          <li>
            • La synchronisation utilise les Push Notifications de Google Drive pour des mises à jour en temps réel
          </li>
        </ul>
      </div>
    </div>
  )
}
