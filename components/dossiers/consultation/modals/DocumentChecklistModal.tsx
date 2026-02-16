/**
 * Modal d'affichage de la checklist des documents requis
 * Affiche les documents extraits de la consultation avec checkboxes
 *
 * @module components/dossiers/consultation/modals
 * @see Phase 4.3 - TODOs Critiques - Modals Consultation
 */

'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileCheck, Download, Copy, CheckCircle2 } from 'lucide-react'
import { useToastNotifications } from '@/components/feedback'
import { cn } from '@/lib/utils'

interface DocumentChecklistModalProps {
  /**
   * État d'ouverture du modal
   */
  open: boolean

  /**
   * Callback de fermeture
   */
  onClose: () => void

  /**
   * Liste des documents extraits de la consultation
   */
  documents: string[]

  /**
   * Question de consultation (pour contexte)
   */
  question?: string
}

/**
 * Modal de checklist des documents requis
 */
export function DocumentChecklistModal({
  open,
  onClose,
  documents,
  question,
}: DocumentChecklistModalProps) {
  const toast = useToastNotifications()
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())

  /**
   * Toggle checkbox
   */
  const handleToggle = (index: number) => {
    setCheckedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  /**
   * Copier la liste dans le presse-papier
   */
  const handleCopy = async () => {
    const text = documents
      .map((doc, index) => `${index + 1}. ${doc}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copié', 'La liste des documents a été copiée')
    } catch (error) {
      toast.error('Erreur', 'Impossible de copier la liste')
    }
  }

  /**
   * Télécharger la checklist en format texte
   */
  const handleDownload = () => {
    const text = [
      '═══════════════════════════════════════════════════',
      '  CHECKLIST DOCUMENTS REQUIS',
      '═══════════════════════════════════════════════════',
      '',
      question ? `Consultation: ${question}` : '',
      question ? '' : null,
      'Documents à préparer:',
      '',
      ...documents.map((doc, index) => `☐ ${index + 1}. ${doc}`),
      '',
      '═══════════════════════════════════════════════════',
      `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
    ]
      .filter((line) => line !== null)
      .join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `checklist-documents-${Date.now()}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Téléchargé', 'La checklist a été téléchargée')
  }

  const completionRate = documents.length > 0
    ? Math.round((checkedItems.size / documents.length) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" />
            Documents requis
          </DialogTitle>
          <DialogDescription>
            {documents.length} document{documents.length > 1 ? 's' : ''} identifié{documents.length > 1 ? 's' : ''} dans la consultation
          </DialogDescription>
        </DialogHeader>

        {/* Barre de progression */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-semibold text-blue-600">
              {checkedItems.size}/{documents.length} ({completionRate}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                completionRate === 100 ? 'bg-green-600' : 'bg-blue-600'
              )}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Liste des documents */}
        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-3">
            {documents.map((document, index) => {
              const isChecked = checkedItems.has(index)

              return (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 transition-colors',
                    isChecked && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                  )}
                >
                  <Checkbox
                    id={`doc-${index}`}
                    checked={isChecked}
                    onCheckedChange={() => handleToggle(index)}
                    className="mt-1"
                  />
                  <label
                    htmlFor={`doc-${index}`}
                    className={cn(
                      'flex-1 cursor-pointer text-sm',
                      isChecked && 'line-through text-muted-foreground'
                    )}
                  >
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {index + 1}.
                    </span>{' '}
                    {document}
                  </label>
                  {isChecked && (
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopy} size="sm">
            <Copy className="mr-2 h-4 w-4" />
            Copier
          </Button>
          <Button variant="outline" onClick={handleDownload} size="sm">
            <Download className="mr-2 h-4 w-4" />
            Télécharger
          </Button>
          <Button onClick={onClose} size="sm">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
