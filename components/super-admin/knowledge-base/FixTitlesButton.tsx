'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
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

export function FixTitlesButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handlePreview = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/knowledge-base/fix-titles?limit=500')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setPreviewCount(data.count)
      setDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'analyse')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    setDialogOpen(false)
    setLoading(true)
    toast.info('Correction des titres en cours (peut prendre 1-2 min)...')
    try {
      const res = await fetch('/api/admin/knowledge-base/fix-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 200 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      toast.success(
        `Titres corrigés : ${data.fixed} (${data.skipped} ignorés, ${data.errors} erreurs)`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la correction')
    } finally {
      setLoading(false)
      setPreviewCount(null)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 h-9"
        onClick={handlePreview}
        disabled={loading}
      >
        {loading ? (
          <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Icons.sparkles className="h-4 w-4 mr-2" />
        )}
        Corriger les titres
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Correction des titres non-significatifs
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {previewCount !== null && previewCount > 0 ? (
                <>
                  <strong className="text-amber-400">{previewCount} document(s)</strong> ont un titre
                  non-significatif (URL brute, nom de fichier, titre trop court...).
                  <br /><br />
                  L&apos;IA (Ollama) va générer un titre pertinent pour chacun à partir du contenu.
                  <br />
                  Cette opération peut prendre <strong className="text-foreground">1 à 2 minutes</strong>.
                </>
              ) : (
                <strong className="text-emerald-400">Aucun titre problématique trouvé.</strong>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground">
              Annuler
            </AlertDialogCancel>
            {previewCount !== null && previewCount > 0 && (
              <AlertDialogAction
                onClick={handleApply}
                className="bg-amber-600 hover:bg-amber-700 text-foreground"
              >
                Corriger {previewCount} document(s)
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
