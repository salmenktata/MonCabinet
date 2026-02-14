'use client'

/**
 * Panel de configuration IA par opération
 *
 * Features:
 * - Accordion avec 6 opération cards
 * - Unsaved changes warning
 * - Clear cache button
 * - Real-time validation
 */

import React, { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Loader2, RefreshCw, AlertCircle, Save, X } from 'lucide-react'
import { useOperationsConfig } from '@/lib/hooks/useOperationsConfig'
import { OPERATION_LABELS, CATEGORY_COLORS } from '@/lib/types/ai-config.types'
import OperationConfigCard from './OperationConfigCard'
import type { OperationName } from '@/lib/ai/operations-config'
import type { OperationConfigUpdatePayload } from '@/lib/types/ai-config.types'

const OperationsConfigPanel: React.FC = () => {
  const { operations, loading, error, updateOperation, clearCache, refetch } =
    useOperationsConfig()

  const [pendingChanges, setPendingChanges] = useState<
    Record<OperationName, OperationConfigUpdatePayload>
  >({} as any)

  const [saving, setSaving] = useState(false)

  /**
   * Unsaved changes count
   */
  const hasUnsavedChanges = Object.keys(pendingChanges).length > 0

  /**
   * Handle config change dans une card
   */
  const handleConfigChange = useCallback(
    (operationName: OperationName, updates: OperationConfigUpdatePayload) => {
      setPendingChanges((prev) => ({
        ...prev,
        [operationName]: {
          ...(prev[operationName] || {}),
          ...updates,
        },
      }))
    },
    []
  )

  /**
   * Sauvegarde toutes les modifications
   */
  const handleSaveAll = useCallback(async () => {
    setSaving(true)

    try {
      const operations = Object.keys(pendingChanges) as OperationName[]

      // Update séquentiel (pour éviter race conditions)
      for (const operationName of operations) {
        const updates = pendingChanges[operationName]
        await updateOperation(operationName, updates)
      }

      // Clear pending changes
      setPendingChanges({} as any)
    } catch (error) {
      console.error('Error saving changes:', error)
    } finally {
      setSaving(false)
    }
  }, [pendingChanges, updateOperation])

  /**
   * Annule toutes les modifications
   */
  const handleCancelAll = useCallback(() => {
    setPendingChanges({} as any)
  }, [])

  /**
   * Warning beforeunload si unsaved changes
   */
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  /**
   * Loading state
   */
  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <span className="ml-3 text-slate-400">Chargement des configurations...</span>
        </CardContent>
      </Card>
    )
  }

  /**
   * Error state
   */
  if (error) {
    return (
      <Alert className="bg-red-500/10 border-red-500/50">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-white">
          Erreur lors du chargement des configurations: {error}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Configuration par Opération</h3>
          <p className="text-sm text-slate-400 mt-1">
            Gérer les providers, fallback et timeouts par type d'opération métier
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={refetch} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" onClick={clearCache}>
            Vider le cache
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{operations.length}</p>
              <p className="text-sm text-slate-400 mt-1">Opérations configurées</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {operations.filter((op) => op.source === 'database').length}
              </p>
              <p className="text-sm text-slate-400 mt-1">Configs personnalisées</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {operations.filter((op) => op.source === 'static').length}
              </p>
              <p className="text-sm text-slate-400 mt-1">Configs par défaut</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accordion */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Opérations métier</CardTitle>
          <CardDescription className="text-slate-400">
            Cliquez sur une opération pour configurer ses providers et timeouts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {operations.map((operation) => {
              const operationName = operation.operationName
              const label = OPERATION_LABELS[operationName]
              const categoryColor = CATEGORY_COLORS[operation.category]

              return (
                <AccordionItem key={operationName} value={operationName}>
                  <AccordionTrigger className="hover:bg-slate-700/50 px-4 rounded">
                    <div className="flex items-center gap-3 w-full">
                      <Badge className={`${categoryColor} text-white`}>
                        {operation.category}
                      </Badge>

                      <div className="flex-1 text-left">
                        <p className="font-semibold text-white">{label.fr}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{operation.description}</p>
                      </div>

                      {operation.source === 'database' && (
                        <Badge variant="outline" className="bg-blue-500/20 border-blue-500/50">
                          Personnalisé
                        </Badge>
                      )}

                      {pendingChanges[operationName] && (
                        <Badge variant="outline" className="bg-yellow-500/20 border-yellow-500/50">
                          Modifié
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pt-4">
                    <OperationConfigCard
                      operation={operation}
                      onConfigChange={(updates) => handleConfigChange(operationName, updates)}
                      pendingChanges={pendingChanges[operationName]}
                    />
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Sticky unsaved changes bar */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-500/10 border-t border-yellow-500/50 p-4 z-50 backdrop-blur-sm">
          <div className="container mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-semibold text-white">
                  {Object.keys(pendingChanges).length} modification(s) non sauvegardée(s)
                </p>
                <p className="text-sm text-slate-400">
                  Opérations:{' '}
                  {Object.keys(pendingChanges)
                    .map((op) => OPERATION_LABELS[op as OperationName].fr)
                    .join(', ')}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancelAll} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                Annuler
              </Button>
              <Button onClick={handleSaveAll} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Enregistrer tout
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OperationsConfigPanel
