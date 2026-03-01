'use client'

/**
 * Hook pour gérer la sélection multiple et les actions groupées.
 * Remplace le pattern [selectedIds: Set<string>, bulkLoading] dupliqué 15+ fois.
 *
 * @example
 * const bulk = useBulkActions(files)
 *
 * // Case à cocher sur chaque ligne
 * <Checkbox checked={bulk.selectedIds.has(file.id)} onCheckedChange={() => bulk.toggle(file.id)} />
 *
 * // Case à cocher "Tout sélectionner"
 * <Checkbox checked={bulk.allSelected} onCheckedChange={bulk.toggleAll} />
 *
 * // Barre d'actions
 * {bulk.selectedIds.size > 0 && (
 *   <Button disabled={bulk.bulkLoading} onClick={async () => {
 *     bulk.setBulkLoading(true)
 *     await doAction([...bulk.selectedIds])
 *     bulk.clearSelection()
 *     bulk.setBulkLoading(false)
 *   }}>
 *     Supprimer {bulk.selectedIds.size} éléments
 *   </Button>
 * )}
 */

import { useState, useCallback, useMemo } from 'react'

interface UseBulkActionsResult {
  selectedIds: Set<string>
  /** Bascule la sélection d'un item */
  toggle: (id: string) => void
  /** Sélectionne/désélectionne tous les items */
  toggleAll: () => void
  /** Vide la sélection */
  clearSelection: () => void
  /** True si tous les items sont sélectionnés */
  allSelected: boolean
  /** True si certains items (mais pas tous) sont sélectionnés */
  partialSelected: boolean
  bulkLoading: boolean
  setBulkLoading: (loading: boolean) => void
}

export function useBulkActions(items: Array<{ id: string }>): UseBulkActionsResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const allSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  )

  const partialSelected = useMemo(
    () => selectedIds.size > 0 && !allSelected,
    [selectedIds.size, allSelected]
  )

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (items.every((item) => prev.has(item.id))) {
        return new Set()
      }
      return new Set(items.map((item) => item.id))
    })
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return {
    selectedIds,
    toggle,
    toggleAll,
    clearSelection,
    allSelected,
    partialSelected,
    bulkLoading,
    setBulkLoading,
  }
}
