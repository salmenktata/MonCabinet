'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr, arDZ } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { restoreKnowledgeDocumentVersionAction } from '@/app/actions/knowledge-base'
import { useRouter } from 'next/navigation'

interface Version {
  id: string
  version: number
  title: string
  changeType: 'create' | 'update' | 'content_update' | 'file_replace' | 'restore'
  changeReason: string | null
  changedBy: string | null
  changedByEmail?: string
  changedAt: Date | string
}

interface VersionHistoryProps {
  documentId: string
  versions: Version[]
  currentVersion: number
  lang?: 'fr' | 'ar'
  onVersionRestored?: () => void
}

const CHANGE_TYPE_LABELS: Record<string, { fr: string; ar: string; color: string }> = {
  create: { fr: 'Création', ar: 'إنشاء', color: 'bg-green-500/20 text-green-300' },
  update: { fr: 'Mise à jour', ar: 'تحديث', color: 'bg-blue-500/20 text-blue-300' },
  content_update: { fr: 'Contenu modifié', ar: 'تعديل المحتوى', color: 'bg-yellow-500/20 text-yellow-300' },
  file_replace: { fr: 'Fichier remplacé', ar: 'استبدال الملف', color: 'bg-orange-500/20 text-orange-300' },
  restore: { fr: 'Restauration', ar: 'استعادة', color: 'bg-purple-500/20 text-purple-300' },
}

export function VersionHistory({
  documentId,
  versions,
  currentVersion,
  lang = 'fr',
  onVersionRestored,
}: VersionHistoryProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [restoreReason, setRestoreReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRestore = async () => {
    if (!selectedVersion) return

    setLoading(true)
    try {
      const result = await restoreKnowledgeDocumentVersionAction(
        documentId,
        selectedVersion.id,
        restoreReason || undefined
      )

      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Version restaurée',
          description: `Le document a été restauré à la version ${selectedVersion.version}.`,
        })
        setRestoreDialogOpen(false)
        setSelectedVersion(null)
        setRestoreReason('')
        onVersionRestored?.()
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return formatDistanceToNow(d, {
      addSuffix: true,
      locale: lang === 'fr' ? fr : arDZ,
    })
  }

  return (
    <>
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Icons.history className="h-4 w-4" />
            {lang === 'fr' ? 'Historique des versions' : 'سجل النسخ'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-slate-400 text-sm">
              {lang === 'fr' ? 'Aucune version enregistrée.' : 'لا توجد نسخ مسجلة.'}
            </p>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => {
                const typeInfo = CHANGE_TYPE_LABELS[version.changeType] || CHANGE_TYPE_LABELS.update
                const isCurrent = version.version === currentVersion

                return (
                  <div
                    key={version.id}
                    className={`flex items-start justify-between p-3 rounded-lg ${
                      isCurrent ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-700/50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium">
                          v{version.version}
                        </span>
                        <Badge className={typeInfo.color}>
                          {lang === 'fr' ? typeInfo.fr : typeInfo.ar}
                        </Badge>
                        {isCurrent && (
                          <Badge className="bg-blue-500/30 text-blue-300">
                            {lang === 'fr' ? 'Actuelle' : 'الحالية'}
                          </Badge>
                        )}
                      </div>

                      {version.changeReason && (
                        <p className="text-sm text-slate-400 mb-1">
                          {version.changeReason}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{formatDate(version.changedAt)}</span>
                        {version.changedByEmail && (
                          <>
                            <span>•</span>
                            <span>{version.changedByEmail}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedVersion(version)
                          setRestoreDialogOpen(true)
                        }}
                        className="text-slate-400 hover:text-white hover:bg-slate-600"
                      >
                        <Icons.undo className="h-4 w-4 mr-1" />
                        {lang === 'fr' ? 'Restaurer' : 'استعادة'}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmation de restauration */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {lang === 'fr'
                ? `Restaurer la version ${selectedVersion?.version}`
                : `استعادة النسخة ${selectedVersion?.version}`}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {lang === 'fr'
                ? 'Cette action va remplacer le contenu actuel par celui de la version sélectionnée. Une sauvegarde de la version actuelle sera créée.'
                : 'سيحل هذا الإجراء محل المحتوى الحالي بمحتوى النسخة المحددة. سيتم إنشاء نسخة احتياطية من النسخة الحالية.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-slate-300">
                {lang === 'fr' ? 'Raison de la restauration (optionnel)' : 'سبب الاستعادة (اختياري)'}
              </Label>
              <Textarea
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
                placeholder={
                  lang === 'fr'
                    ? 'Ex: Restauration suite à une erreur...'
                    : 'مثال: استعادة بسبب خطأ...'
                }
                className="mt-1 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRestoreDialogOpen(false)
                setSelectedVersion(null)
                setRestoreReason('')
              }}
              className="text-slate-400"
            >
              {lang === 'fr' ? 'Annuler' : 'إلغاء'}
            </Button>
            <Button
              onClick={handleRestore}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                  {lang === 'fr' ? 'Restauration...' : 'جاري الاستعادة...'}
                </>
              ) : (
                <>
                  <Icons.undo className="h-4 w-4 mr-2" />
                  {lang === 'fr' ? 'Restaurer' : 'استعادة'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Indicateur de version simple
 */
export function VersionBadge({ version }: { version: number }) {
  return (
    <span className="inline-flex items-center text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
      v{version}
    </span>
  )
}
