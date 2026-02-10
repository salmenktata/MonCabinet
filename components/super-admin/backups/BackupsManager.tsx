'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface BackupFile {
  name: string
  size: string
  date: string
  fileCount?: number
}

interface BackupsData {
  backups: {
    database: BackupFile[]
    minio: BackupFile[]
    code: BackupFile[]
  }
  diskUsage: {
    used: string
    available: string
  }
  backupDir: string
}

export default function BackupsManager() {
  const [data, setData] = useState<BackupsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [backupInProgress, setBackupInProgress] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null)
  const [restoreInProgress, setRestoreInProgress] = useState(false)
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; filename: string }>({ open: false, filename: '' })
  const [restoreConfirmInput, setRestoreConfirmInput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Charger les backups
  const loadBackups = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/backup')
      if (!res.ok) throw new Error('Erreur lors du chargement')
      const json = await res.json()
      setData(json)
      setError('')
    } catch (err) {
      setError('Impossible de charger les backups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  // Déclencher un backup
  const triggerBackup = async () => {
    if (!confirm('Lancer un backup complet maintenant ?')) return

    setBackupInProgress(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        if (json.error === 'Script de backup non trouvé') {
          throw new Error('Script de backup non configuré. Cette fonctionnalité n\'est disponible qu\'en production.')
        }
        throw new Error(json.error || 'Échec du backup')
      }

      setSuccess(`Backup terminé en ${json.duration}`)
      loadBackups()
    } catch (err: any) {
      setError(err.message || 'Erreur lors du backup')
    } finally {
      setBackupInProgress(false)
    }
  }

  // Supprimer un backup
  const deleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer le backup "${filename}" ?`)) return

    setDeleteInProgress(filename)
    setError('')

    try {
      const res = await fetch(`/api/admin/backup?file=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la suppression')
      }

      setSuccess(`Backup "${filename}" supprimé`)
      loadBackups()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleteInProgress(null)
    }
  }

  // Ouvrir le dialogue de restauration
  const openRestoreDialog = (filename: string) => {
    setRestoreDialog({ open: true, filename })
    setRestoreConfirmInput('')
  }

  // Restaurer un backup
  const restoreBackup = async () => {
    const { filename } = restoreDialog
    setRestoreDialog({ open: false, filename: '' })
    setRestoreConfirmInput('')
    setRestoreInProgress(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/backup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Échec de la restauration')
      }

      setSuccess(`Base de données restaurée depuis "${filename}" en ${json.duration}`)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la restauration')
    } finally {
      setRestoreInProgress(false)
    }
  }

  // Formater la date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.spinner className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const diskUsagePercent = data?.diskUsage?.used
    ? parseInt(data.diskUsage.used.replace('%', ''))
    : 0

  return (
    <div className="space-y-6">
      {/* Info mode local */}
      <div className="rounded-lg bg-blue-900/50 border border-blue-700 p-4 text-blue-200">
        <strong>Note:</strong> Les sauvegardes manuelles nécessitent le script de backup configuré sur le serveur de production.
      </div>

      {/* Messages */}
      {restoreInProgress && (
        <div className="rounded-lg bg-amber-900/50 border border-amber-700 p-4 text-amber-200 flex items-center gap-3">
          <Icons.spinner className="h-5 w-5 animate-spin shrink-0" />
          <span>Restauration de la base de données en cours... Ne fermez pas cette page.</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
          {success}
        </div>
      )}

      {/* Actions et Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Bouton Backup */}
        <Card>
          <CardContent className="pt-6">
            <Button
              onClick={triggerBackup}
              disabled={backupInProgress || restoreInProgress}
              className="w-full"
              size="lg"
            >
              {backupInProgress ? (
                <>
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  Backup en cours...
                </>
              ) : (
                <>
                  <Icons.database className="mr-2 h-4 w-4" />
                  Lancer un Backup
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Stats DB */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Base de données</CardDescription>
            <CardTitle className="text-2xl">
              {data?.backups.database.length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">backups disponibles</p>
          </CardContent>
        </Card>

        {/* Stats MinIO */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents (MinIO)</CardDescription>
            <CardTitle className="text-2xl">
              {data?.backups.minio.length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">backups disponibles</p>
          </CardContent>
        </Card>

        {/* Espace disque */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Espace disque</CardDescription>
            <CardTitle className="text-2xl">{data?.diskUsage?.used || 'N/A'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={cn(
                    'h-2 rounded-full transition-all',
                    diskUsagePercent > 80 ? 'bg-red-500' : diskUsagePercent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${Math.min(diskUsagePercent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Disponible: {data?.diskUsage?.available || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listes des backups */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Base de données */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.database className="h-5 w-5 text-blue-500" />
              PostgreSQL
            </CardTitle>
            <CardDescription>Dumps de la base de données</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupList
              backups={data?.backups.database || []}
              onDelete={deleteBackup}
              onRestore={openRestoreDialog}
              deleteInProgress={deleteInProgress}
              restoreInProgress={restoreInProgress}
              formatDate={formatDate}
              type="database"
            />
          </CardContent>
        </Card>

        {/* MinIO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.folder className="h-5 w-5 text-amber-500" />
              MinIO
            </CardTitle>
            <CardDescription>Documents et fichiers</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupList
              backups={data?.backups.minio || []}
              onDelete={deleteBackup}
              deleteInProgress={deleteInProgress}
              formatDate={formatDate}
              type="minio"
            />
          </CardContent>
        </Card>

        {/* Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.code className="h-5 w-5 text-green-500" />
              Code Source
            </CardTitle>
            <CardDescription>Archives du code</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupList
              backups={data?.backups.code || []}
              onDelete={deleteBackup}
              deleteInProgress={deleteInProgress}
              formatDate={formatDate}
              type="code"
            />
          </CardContent>
        </Card>
      </div>

      {/* Informations */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Répertoire:</span>{' '}
            <code className="rounded bg-muted px-2 py-1">{data?.backupDir || '/opt/backups/qadhya'}</code>
          </p>
          <p>
            <span className="font-medium">Rétention:</span> 14 jours
          </p>
          <p>
            <span className="font-medium">Cron recommandé:</span>{' '}
            <code className="rounded bg-muted px-2 py-1">0 3 * * * /opt/qadhya/backup.sh --notify</code>
          </p>
        </CardContent>
      </Card>

      {/* Dialogue de confirmation restauration */}
      <AlertDialog
        open={restoreDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreDialog({ open: false, filename: '' })
            setRestoreConfirmInput('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Icons.alertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex-1 space-y-2">
                <AlertDialogTitle>Restaurer la base de données</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      Cette action va <strong className="text-destructive">ÉCRASER</strong> la base de données actuelle
                      avec le backup <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{restoreDialog.filename}</code>.
                    </p>
                    <p className="font-medium text-destructive">
                      Cette opération est irréversible. Toutes les données actuelles seront perdues.
                    </p>
                    <div className="space-y-2 pt-2">
                      <label className="text-sm font-medium">
                        Tapez <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{restoreDialog.filename}</code> pour confirmer :
                      </label>
                      <Input
                        value={restoreConfirmInput}
                        onChange={(e) => setRestoreConfirmInput(e.target.value)}
                        placeholder="Nom du fichier..."
                        className="font-mono text-sm"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={restoreBackup}
              disabled={restoreConfirmInput !== restoreDialog.filename}
            >
              <Icons.undo className="mr-2 h-4 w-4" />
              Restaurer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Composant liste de backups
interface BackupListProps {
  backups: BackupFile[]
  onDelete: (filename: string) => void
  onRestore?: (filename: string) => void
  deleteInProgress: string | null
  restoreInProgress?: boolean
  formatDate: (date: string) => string
  type: 'database' | 'minio' | 'code'
}

function BackupList({ backups, onDelete, onRestore, deleteInProgress, restoreInProgress, formatDate, type }: BackupListProps) {
  if (backups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Aucun backup disponible
      </p>
    )
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {backups.map((backup, index) => (
        <div
          key={backup.name}
          className={cn(
            'flex items-center justify-between rounded-lg border p-3 text-sm',
            index === 0 && 'border-green-200 bg-green-50'
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate" title={backup.name}>
              {backup.name}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{backup.size}</span>
              {backup.fileCount !== undefined && (
                <>
                  <span>•</span>
                  <span>{backup.fileCount} fichiers</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(backup.date)}</p>
          </div>
          <div className="flex items-center gap-1">
            {index === 0 && (
              <Badge variant="outline" className="text-green-600 border-green-300">
                Dernier
              </Badge>
            )}
            {type === 'database' && onRestore && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRestore(backup.name)}
                disabled={restoreInProgress || deleteInProgress === backup.name}
                className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                title="Restaurer ce backup"
              >
                {restoreInProgress ? (
                  <Icons.spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.undo className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(backup.name)}
              disabled={deleteInProgress === backup.name || restoreInProgress}
              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              {deleteInProgress === backup.name ? (
                <Icons.spinner className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.trash className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
