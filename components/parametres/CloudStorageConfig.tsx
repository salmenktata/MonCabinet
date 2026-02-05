'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Cloud, Check, X, RefreshCw, AlertCircle } from 'lucide-react'
import {
  getGoogleDriveAuthUrlAction,
  disconnectCloudProviderAction,
  toggleSyncAction,
} from '@/app/actions/cloud-storage'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface CloudConfig {
  id: string
  provider: string
  enabled: boolean
  default_provider: boolean
  provider_email: string | null
  sync_enabled: boolean
  sync_frequency: number | null
  last_sync_at: string | null
  created_at: string
  updated_at: string
  root_folder_name: string | null
}

interface CloudStorageConfigProps {
  initialConfigs: CloudConfig[]
  searchParams: { [key: string]: string | string[] | undefined }
}

export default function CloudStorageConfig({
  initialConfigs,
  searchParams,
}: CloudStorageConfigProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [configs, setConfigs] = useState<CloudConfig[]>(initialConfigs)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<CloudConfig | null>(null)

  // Gérer les messages de succès/erreur OAuth
  useEffect(() => {
    const success = searchParams.success
    const error = searchParams.error
    const message = searchParams.message as string
    const email = searchParams.email as string

    if (success === 'true') {
      toast.success(`Google Drive connecté avec succès (${email || 'compte connecté'})`)
      // Nettoyer URL
      router.replace('/parametres/cloud-storage')
    } else if (error) {
      const errorMessage = message || 'Erreur de connexion'
      toast.error(decodeURIComponent(errorMessage))
      // Nettoyer URL
      router.replace('/parametres/cloud-storage')
    }
  }, [searchParams, router])

  // Connecter Google Drive
  const handleConnectGoogleDrive = async () => {
    startTransition(async () => {
      const result = await getGoogleDriveAuthUrlAction()

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (result.data?.authUrl) {
        // Rediriger vers URL OAuth Google
        window.location.href = result.data.authUrl
      }
    })
  }

  // Déconnecter provider
  const handleDisconnect = async () => {
    if (!selectedConfig) return

    startTransition(async () => {
      const result = await disconnectCloudProviderAction(selectedConfig.id)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Google Drive déconnecté avec succès')
      setConfigs((prev) => prev.filter((c) => c.id !== selectedConfig.id))
      setDisconnectDialogOpen(false)
      setSelectedConfig(null)
      router.refresh()
    })
  }

  // Toggle synchronisation
  const handleToggleSync = async (config: CloudConfig, enabled: boolean) => {
    startTransition(async () => {
      const result = await toggleSyncAction({
        providerId: config.id,
        enabled,
        frequency: config.sync_frequency?.toString() as '15' | '30' | '60' || '15',
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(
        enabled
          ? 'Synchronisation activée avec succès'
          : 'Synchronisation désactivée avec succès'
      )

      setConfigs((prev) =>
        prev.map((c) =>
          c.id === config.id
            ? { ...c, sync_enabled: enabled }
            : c
        )
      )
      router.refresh()
    })
  }

  // Changer fréquence synchronisation
  const handleChangeSyncFrequency = async (
    config: CloudConfig,
    frequency: '15' | '30' | '60'
  ) => {
    startTransition(async () => {
      const result = await toggleSyncAction({
        providerId: config.id,
        enabled: config.sync_enabled,
        frequency,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Fréquence de synchronisation mise à jour')

      setConfigs((prev) =>
        prev.map((c) =>
          c.id === config.id
            ? { ...c, sync_frequency: parseInt(frequency) }
            : c
        )
      )
      router.refresh()
    })
  }

  const googleDriveConfig = configs.find((c) => c.provider === 'google_drive')

  return (
    <div className="space-y-6">
      {/* Google Drive */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Cloud className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Google Drive</h2>
              <p className="text-sm text-muted-foreground">
                Stockage cloud par défaut pour vos documents
              </p>
            </div>
          </div>

          {googleDriveConfig ? (
            <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700">
              <Check className="h-3 w-3" />
              Connecté
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1 bg-gray-50 text-gray-700">
              <X className="h-3 w-3" />
              Non connecté
            </Badge>
          )}
        </div>

        {googleDriveConfig ? (
          <div className="mt-6 space-y-4">
            {/* Compte connecté */}
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Compte connecté</p>
                  <p className="text-sm text-muted-foreground">
                    {googleDriveConfig.provider_email || 'Compte Google'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedConfig(googleDriveConfig)
                    setDisconnectDialogOpen(true)
                  }}
                  disabled={isPending}
                >
                  Déconnecter
                </Button>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                Connecté le{' '}
                {new Date(googleDriveConfig.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>

            {/* Synchronisation bidirectionnelle */}
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="sync-enabled" className="cursor-pointer">
                      Synchronisation bidirectionnelle
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Les fichiers ajoutés manuellement dans Google Drive apparaîtront dans l'app
                    </p>
                  </div>
                </div>
                <Switch
                  id="sync-enabled"
                  checked={googleDriveConfig.sync_enabled}
                  onCheckedChange={(checked) => handleToggleSync(googleDriveConfig, checked)}
                  disabled={isPending}
                />
              </div>

              {googleDriveConfig.sync_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="sync-frequency">Fréquence de synchronisation</Label>
                  <Select
                    value={googleDriveConfig.sync_frequency?.toString() || '15'}
                    onValueChange={(value) =>
                      handleChangeSyncFrequency(googleDriveConfig, value as '15' | '30' | '60')
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger id="sync-frequency" className="w-full">
                      <SelectValue placeholder="Choisir la fréquence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">Toutes les 15 minutes</SelectItem>
                      <SelectItem value="30">Toutes les 30 minutes</SelectItem>
                      <SelectItem value="60">Toutes les 60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    La synchronisation utilise les Push Notifications de Google Drive pour des mises à
                    jour en temps réel
                  </p>
                </div>
              )}

              {googleDriveConfig.last_sync_at && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  Dernière synchronisation :{' '}
                  {new Date(googleDriveConfig.last_sync_at).toLocaleString('fr-FR')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Button
              onClick={handleConnectGoogleDrive}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  <Cloud className="mr-2 h-4 w-4" />
                  Connecter Google Drive
                </>
              )}
            </Button>

            <p className="mt-3 text-sm text-muted-foreground">
              En cliquant sur "Connecter", vous serez redirigé vers Google pour autoriser l'accès à
              votre Drive.
            </p>
          </div>
        )}
      </div>

      {/* Dialog confirmation déconnexion */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déconnecter Google Drive ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne pourrez plus uploader de nouveaux documents tant que vous ne reconnectez pas
              votre compte. Les documents existants resteront accessibles sur votre Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Déconnexion...
                </>
              ) : (
                'Déconnecter'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
