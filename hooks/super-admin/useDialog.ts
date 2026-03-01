'use client'

/**
 * Hook pour gérer l'état d'un dialog/modal avec item sélectionné.
 * Remplace le pattern [open, selectedItem] dupliqué 40+ fois.
 *
 * @example
 * const deleteDialog = useDialog<WebFile>()
 *
 * // Ouvrir avec un item
 * <Button onClick={() => deleteDialog.openWith(file)}>Supprimer</Button>
 *
 * // Dans la dialog
 * <AlertDialog open={deleteDialog.open} onOpenChange={(o) => !o && deleteDialog.close()}>
 *   <AlertDialogDescription>{deleteDialog.item?.name}</AlertDialogDescription>
 *   <AlertDialogAction onClick={async () => { await doDelete(deleteDialog.item!.id); deleteDialog.close() }}>
 *     Supprimer
 *   </AlertDialogAction>
 * </AlertDialog>
 */

import { useState, useCallback } from 'react'

interface UseDialogResult<T> {
  open: boolean
  item: T | null
  openWith: (item: T) => void
  openEmpty: () => void
  close: () => void
}

export function useDialog<T = unknown>(): UseDialogResult<T> {
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState<T | null>(null)

  const openWith = useCallback((newItem: T) => {
    setItem(newItem)
    setOpen(true)
  }, [])

  const openEmpty = useCallback(() => {
    setItem(null)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    // Délai pour laisser l'animation de fermeture se terminer
    setTimeout(() => setItem(null), 200)
  }, [])

  return { open, item, openWith, openEmpty, close }
}
