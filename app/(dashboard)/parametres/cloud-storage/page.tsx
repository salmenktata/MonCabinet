import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CloudStorageConfig from '@/components/parametres/CloudStorageConfig'

export const metadata = {
  title: 'Stockage Cloud - MonCabinet',
  description: 'Configurer le stockage de vos documents sur Google Drive',
}

export default async function CloudStorageParametresPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer la configuration cloud
  const { data: cloudConfigs } = await supabase
    .from('cloud_providers_config')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

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
        <h1 className="text-3xl font-bold">Stockage Cloud</h1>
        <p className="mt-2 text-muted-foreground">
          Connectez votre Google Drive pour stocker vos documents de manière sécurisée
        </p>
      </div>

      <CloudStorageConfig
        initialConfigs={sanitizedConfigs || []}
        searchParams={searchParams}
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">🔐 Sécurité et Confidentialité</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            • Vos documents sont stockés sur <strong>VOTRE</strong> Google Drive, pas sur nos serveurs
          </li>
          <li>
            • L'application n'a accès qu'aux fichiers qu'elle crée (scope <code>drive.file</code>)
          </li>
          <li>• Les tokens sont chiffrés et stockés de manière sécurisée</li>
          <li>
            • Vous pouvez révoquer l'accès à tout moment depuis cette page ou votre compte Google
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="font-semibold text-green-900">📁 Structure des Dossiers</h3>
        <div className="mt-2 text-sm text-green-800">
          <p className="mb-2">L'application crée automatiquement cette structure dans votre Google Drive :</p>
          <pre className="rounded bg-green-100 p-2 font-mono text-xs">
            {`Clients MonCabinet/
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
        <h3 className="font-semibold text-purple-900">🔄 Synchronisation Bidirectionnelle</h3>
        <ul className="mt-2 space-y-1 text-sm text-purple-800">
          <li>
            • Activez la synchronisation pour que les documents ajoutés manuellement dans Google Drive apparaissent automatiquement dans l'application
          </li>
          <li>
            • Les fichiers placés dans "Documents non classés/" apparaîtront dans le widget "Documents à classer"
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
