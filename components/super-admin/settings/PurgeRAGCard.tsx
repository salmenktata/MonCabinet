'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Icons } from '@/lib/icons'
import { getRAGStatsAction, purgeRAGAction } from '@/app/actions/super-admin/purge-rag'
import type { PurgeStats, PurgeResult } from '@/app/actions/super-admin/purge-rag'
import { validatePurgeOptions } from '@/lib/ai/purge-options'
import { cn } from '@/lib/utils'

const CONFIRMATION_TEXT = 'PURGE'

interface PurgeSelection {
  // Knowledge Base
  purgeDocuments: boolean
  purgeChunks: boolean
  purgeVersions: boolean
  purgeCategories: boolean
  purgeKBFiles: boolean
  // Web Sources
  purgeSources: boolean
  purgePages: boolean
  purgeWebFiles: boolean
  purgeCrawlLogs: boolean
  purgeCrawlJobs: boolean
  purgeWebMinIO: boolean
}

const defaultSelection: PurgeSelection = {
  purgeDocuments: true,
  purgeChunks: true,
  purgeVersions: true,
  purgeCategories: false,
  purgeKBFiles: true,
  purgeSources: true,
  purgePages: true,
  purgeWebFiles: true,
  purgeCrawlLogs: true,
  purgeCrawlJobs: true,
  purgeWebMinIO: true,
}

export function PurgeRAGCard() {
  const [stats, setStats] = useState<PurgeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selection, setSelection] = useState<PurgeSelection>(defaultSelection)
  const [checkboxConfirmed, setCheckboxConfirmed] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [purging, setPurging] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [warnings, setWarnings] = useState<string[]>([])
  const [result, setResult] = useState<{
    success: boolean
    message: string
    deletedCounts?: PurgeResult['deletedCounts']
  } | null>(null)

  // Charger les stats au montage
  useEffect(() => {
    loadStats()
  }, [])

  // Compte à rebours avant purge
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // Valider les options et afficher les warnings
  useEffect(() => {
    const validation = validatePurgeOptions(selection)
    setWarnings(validation.warnings)
  }, [selection])

  async function loadStats() {
    setLoading(true)
    const response = await getRAGStatsAction()
    if ('stats' in response) {
      setStats(response.stats)
    }
    setLoading(false)
  }

  function resetForm() {
    setCheckboxConfirmed(false)
    setConfirmText('')
    setResult(null)
    setCountdown(0)
    setSelection(defaultSelection)
    setWarnings([])
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      resetForm()
    }
  }

  const updateSelection = useCallback((key: keyof PurgeSelection, value: boolean) => {
    setSelection(prev => {
      const updated = { ...prev, [key]: value }

      // Appliquer les dépendances FK automatiquement
      if (key === 'purgeDocuments' && value) {
        updated.purgeChunks = true
        updated.purgeVersions = true
      }
      if (key === 'purgeSources' && value) {
        updated.purgePages = true
        updated.purgeWebFiles = true
        updated.purgeCrawlLogs = true
        updated.purgeCrawlJobs = true
      }
      if (key === 'purgePages' && value) {
        updated.purgeWebFiles = true
      }

      return updated
    })
  }, [])

  function selectAll() {
    setSelection({
      purgeDocuments: true,
      purgeChunks: true,
      purgeVersions: true,
      purgeCategories: true,
      purgeKBFiles: true,
      purgeSources: true,
      purgePages: true,
      purgeWebFiles: true,
      purgeCrawlLogs: true,
      purgeCrawlJobs: true,
      purgeWebMinIO: true,
    })
  }

  function deselectAll() {
    setSelection({
      purgeDocuments: false,
      purgeChunks: false,
      purgeVersions: false,
      purgeCategories: false,
      purgeKBFiles: false,
      purgeSources: false,
      purgePages: false,
      purgeWebFiles: false,
      purgeCrawlLogs: false,
      purgeCrawlJobs: false,
      purgeWebMinIO: false,
    })
  }

  const hasAnySelection = Object.values(selection).some(v => v)

  async function handlePurge() {
    if (!checkboxConfirmed || confirmText !== CONFIRMATION_TEXT || !hasAnySelection) {
      return
    }

    // Démarrer le compte à rebours
    setCountdown(5)
    setPurging(true)

    // Attendre 5 secondes côté client aussi
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Exécuter la purge avec les options sélectionnées
    const response = await purgeRAGAction(confirmText, checkboxConfirmed, selection)

    if (response.success) {
      setResult({
        success: true,
        message: 'Les données sélectionnées ont été supprimées avec succès.',
        deletedCounts: response.deletedCounts,
      })
      // Recharger les stats après purge
      loadStats()
    } else {
      setResult({
        success: false,
        message: response.error || 'Erreur lors de la purge des données.',
      })
    }

    setPurging(false)
    setCountdown(0)
  }

  const canPurge = checkboxConfirmed && confirmText === CONFIRMATION_TEXT && !purging && hasAnySelection

  const totalItems = stats
    ? stats.knowledgeBase.documents +
      stats.knowledgeBase.chunks +
      stats.webSources.sources +
      stats.webSources.pages +
      stats.webSources.files
    : 0

  // Calculer le nombre d'éléments sélectionnés
  const selectedItemCount = stats ? (
    (selection.purgeDocuments ? stats.knowledgeBase.documents : 0) +
    (selection.purgeChunks ? stats.knowledgeBase.chunks : 0) +
    (selection.purgeVersions ? stats.knowledgeBase.versions : 0) +
    (selection.purgeSources ? stats.webSources.sources : 0) +
    (selection.purgePages ? stats.webSources.pages : 0) +
    (selection.purgeWebFiles ? stats.webSources.files : 0) +
    (selection.purgeCrawlLogs ? stats.webSources.crawlLogs : 0) +
    (selection.purgeCrawlJobs ? stats.webSources.crawlJobs : 0) +
    (selection.purgeKBFiles ? stats.storage.knowledgeBaseFiles : 0) +
    (selection.purgeWebMinIO ? stats.storage.webFiles : 0)
  ) : 0

  return (
    <Card className="bg-slate-800 border-red-900/50">
      <CardHeader>
        <CardTitle className="text-red-400 flex items-center gap-2">
          <Icons.alertTriangle className="h-5 w-5" />
          Zone Dangereuse - Purge RAG Sélective
        </CardTitle>
        <CardDescription className="text-slate-400">
          Sélectionnez précisément les données à supprimer (base de connaissances et/ou sources web)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistiques actuelles */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Icons.loader className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : stats ? (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Knowledge Base */}
            <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600">
              <div className="flex items-center gap-2 mb-3">
                <Icons.database className="h-4 w-4 text-blue-400" />
                <span className="font-medium text-white">Base de connaissances</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Documents</span>
                  <span className="font-mono">{stats.knowledgeBase.documents}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Chunks (embeddings)</span>
                  <span className="font-mono">{stats.knowledgeBase.chunks}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Versions</span>
                  <span className="font-mono">{stats.knowledgeBase.versions}</span>
                </div>
              </div>
            </div>

            {/* Web Sources */}
            <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600">
              <div className="flex items-center gap-2 mb-3">
                <Icons.globe className="h-4 w-4 text-green-400" />
                <span className="font-medium text-white">Sources Web</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Sources configurées</span>
                  <span className="font-mono">{stats.webSources.sources}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Pages crawlées</span>
                  <span className="font-mono">{stats.webSources.pages}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Fichiers téléchargés</span>
                  <span className="font-mono">{stats.webSources.files}</span>
                </div>
              </div>
            </div>

            {/* Stockage */}
            <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600">
              <div className="flex items-center gap-2 mb-3">
                <Icons.hardDrive className="h-4 w-4 text-purple-400" />
                <span className="font-medium text-white">Stockage MinIO</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Fichiers KB</span>
                  <span className="font-mono">{stats.storage.knowledgeBaseFiles}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Fichiers Web</span>
                  <span className="font-mono">{stats.storage.webFiles}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Alert variant="destructive">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>
              Impossible de charger les statistiques RAG.
            </AlertDescription>
          </Alert>
        )}

        {/* Bouton de purge */}
        <div className="pt-4 border-t border-slate-700">
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={loading || totalItems === 0}
              >
                <Icons.trash className="h-4 w-4 mr-2" />
                Purger les données RAG (sélection)
                {totalItems > 0 && (
                  <span className="ml-2 text-red-200">({totalItems} éléments)</span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-red-400 flex items-center gap-2">
                  <Icons.alertTriangle className="h-5 w-5" />
                  Purge RAG Sélective
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Sélectionnez les données à supprimer. Cette action est <strong className="text-red-400">IRRÉVERSIBLE</strong>.
                </DialogDescription>
              </DialogHeader>

              {result ? (
                <div className="py-4">
                  <Alert
                    variant={result.success ? 'default' : 'destructive'}
                    className={cn(
                      result.success
                        ? 'border-green-500 bg-green-900/20'
                        : 'border-red-500 bg-red-900/20'
                    )}
                  >
                    {result.success ? (
                      <Icons.checkCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <Icons.xCircle className="h-4 w-4 text-red-400" />
                    )}
                    <AlertTitle className={result.success ? 'text-green-400' : 'text-red-400'}>
                      {result.success ? 'Purge terminée' : 'Erreur'}
                    </AlertTitle>
                    <AlertDescription className="text-slate-300">
                      {result.message}
                      {result.success && result.deletedCounts && (
                        <div className="mt-2 text-sm">
                          <p>Éléments supprimés :</p>
                          <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                            {result.deletedCounts.documents !== undefined && (
                              <li>{result.deletedCounts.documents} documents</li>
                            )}
                            {result.deletedCounts.chunks !== undefined && (
                              <li>{result.deletedCounts.chunks} chunks</li>
                            )}
                            {result.deletedCounts.versions !== undefined && (
                              <li>{result.deletedCounts.versions} versions</li>
                            )}
                            {result.deletedCounts.categories !== undefined && (
                              <li>{result.deletedCounts.categories} catégories</li>
                            )}
                            {result.deletedCounts.sources !== undefined && (
                              <li>{result.deletedCounts.sources} sources web</li>
                            )}
                            {result.deletedCounts.pages !== undefined && (
                              <li>{result.deletedCounts.pages} pages</li>
                            )}
                            {result.deletedCounts.webFiles !== undefined && (
                              <li>{result.deletedCounts.webFiles} fichiers web</li>
                            )}
                            {result.deletedCounts.crawlLogs !== undefined && (
                              <li>{result.deletedCounts.crawlLogs} logs de crawl</li>
                            )}
                            {result.deletedCounts.crawlJobs !== undefined && (
                              <li>{result.deletedCounts.crawlJobs} jobs de crawl</li>
                            )}
                            {result.deletedCounts.kbMinIOFiles !== undefined && (
                              <li>{result.deletedCounts.kbMinIOFiles} fichiers MinIO KB</li>
                            )}
                            {result.deletedCounts.webMinIOFiles !== undefined && (
                              <li>{result.deletedCounts.webMinIOFiles} fichiers MinIO Web</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  {/* Sélection des éléments à purger */}
                  <div className="space-y-4">
                    {/* Boutons tout sélectionner / désélectionner */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAll}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Tout sélectionner
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={deselectAll}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Tout désélectionner
                      </Button>
                    </div>

                    {/* Base de connaissances */}
                    <div className="p-4 rounded-lg bg-slate-800 border border-blue-900/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Icons.database className="h-4 w-4 text-blue-400" />
                        <span className="font-medium text-blue-400">BASE DE CONNAISSANCES</span>
                      </div>
                      <div className="space-y-3">
                        <SelectionItem
                          id="purgeDocuments"
                          label={`Documents (${stats?.knowledgeBase.documents || 0})`}
                          description="Supprime les documents juridiques uploadés"
                          checked={selection.purgeDocuments}
                          onChange={(v) => updateSelection('purgeDocuments', v)}
                          disabled={purging}
                        />
                        <SelectionItem
                          id="purgeChunks"
                          label={`Chunks/Embeddings (${stats?.knowledgeBase.chunks || 0})`}
                          description="Supprime les vecteurs de recherche sémantique"
                          checked={selection.purgeChunks}
                          onChange={(v) => updateSelection('purgeChunks', v)}
                          disabled={purging || selection.purgeDocuments}
                          forced={selection.purgeDocuments}
                        />
                        <SelectionItem
                          id="purgeVersions"
                          label={`Historique versions (${stats?.knowledgeBase.versions || 0})`}
                          description="Supprime l'historique des modifications"
                          checked={selection.purgeVersions}
                          onChange={(v) => updateSelection('purgeVersions', v)}
                          disabled={purging || selection.purgeDocuments}
                          forced={selection.purgeDocuments}
                        />
                        <SelectionItem
                          id="purgeCategories"
                          label="Catégories"
                          description="Supprime la structure des catégories (généralement non coché)"
                          checked={selection.purgeCategories}
                          onChange={(v) => updateSelection('purgeCategories', v)}
                          disabled={purging}
                          warning
                        />
                        <SelectionItem
                          id="purgeKBFiles"
                          label={`Fichiers MinIO KB (${stats?.storage.knowledgeBaseFiles || 0})`}
                          description="Supprime les fichiers sources stockés"
                          checked={selection.purgeKBFiles}
                          onChange={(v) => updateSelection('purgeKBFiles', v)}
                          disabled={purging}
                        />
                      </div>
                    </div>

                    {/* Sources Web */}
                    <div className="p-4 rounded-lg bg-slate-800 border border-green-900/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Icons.globe className="h-4 w-4 text-green-400" />
                        <span className="font-medium text-green-400">SOURCES WEB</span>
                      </div>
                      <div className="space-y-3">
                        <SelectionItem
                          id="purgeSources"
                          label={`Configuration sources (${stats?.webSources.sources || 0})`}
                          description="Supprime les URLs et paramètres de crawl"
                          checked={selection.purgeSources}
                          onChange={(v) => updateSelection('purgeSources', v)}
                          disabled={purging}
                        />
                        <SelectionItem
                          id="purgePages"
                          label={`Pages crawlées (${stats?.webSources.pages || 0})`}
                          description="Supprime le contenu des pages web"
                          checked={selection.purgePages}
                          onChange={(v) => updateSelection('purgePages', v)}
                          disabled={purging || selection.purgeSources}
                          forced={selection.purgeSources}
                        />
                        <SelectionItem
                          id="purgeWebFiles"
                          label={`Fichiers téléchargés (${stats?.webSources.files || 0})`}
                          description="Supprime les PDF/docs téléchargés"
                          checked={selection.purgeWebFiles}
                          onChange={(v) => updateSelection('purgeWebFiles', v)}
                          disabled={purging || selection.purgePages || selection.purgeSources}
                          forced={selection.purgePages || selection.purgeSources}
                        />
                        <SelectionItem
                          id="purgeCrawlLogs"
                          label={`Logs de crawl (${stats?.webSources.crawlLogs || 0})`}
                          description="Supprime l'historique des crawls"
                          checked={selection.purgeCrawlLogs}
                          onChange={(v) => updateSelection('purgeCrawlLogs', v)}
                          disabled={purging || selection.purgeSources}
                          forced={selection.purgeSources}
                        />
                        <SelectionItem
                          id="purgeCrawlJobs"
                          label={`Jobs de crawl (${stats?.webSources.crawlJobs || 0})`}
                          description="Supprime les jobs en attente/terminés"
                          checked={selection.purgeCrawlJobs}
                          onChange={(v) => updateSelection('purgeCrawlJobs', v)}
                          disabled={purging || selection.purgeSources}
                          forced={selection.purgeSources}
                        />
                        <SelectionItem
                          id="purgeWebMinIO"
                          label={`Fichiers MinIO Web (${stats?.storage.webFiles || 0})`}
                          description="Supprime les fichiers web stockés"
                          checked={selection.purgeWebMinIO}
                          onChange={(v) => updateSelection('purgeWebMinIO', v)}
                          disabled={purging}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Warnings sur les dépendances */}
                  {warnings.length > 0 && (
                    <Alert className="border-yellow-500/50 bg-yellow-900/20">
                      <Icons.alertTriangle className="h-4 w-4 text-yellow-400" />
                      <AlertTitle className="text-yellow-400">Dépendances FK</AlertTitle>
                      <AlertDescription className="text-slate-300">
                        <ul className="list-disc list-inside mt-1">
                          {warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Résumé de la sélection */}
                  {hasAnySelection && (
                    <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/50">
                      <p className="text-sm text-red-300">
                        <strong>{selectedItemCount}</strong> élément{selectedItemCount > 1 ? 's' : ''} sélectionné{selectedItemCount > 1 ? 's' : ''} pour suppression
                      </p>
                    </div>
                  )}

                  {/* Checkbox de confirmation */}
                  <div className="flex items-start space-x-2 p-3 rounded-lg bg-red-900/20 border border-red-900/50">
                    <Checkbox
                      id="confirm-checkbox"
                      checked={checkboxConfirmed}
                      onCheckedChange={(checked) => setCheckboxConfirmed(checked === true)}
                      className="mt-0.5"
                      disabled={purging || !hasAnySelection}
                    />
                    <Label
                      htmlFor="confirm-checkbox"
                      className="text-sm text-red-300 cursor-pointer leading-relaxed"
                    >
                      Je comprends que cette action supprimera les données sélectionnées
                      et est <strong>irréversible</strong>
                    </Label>
                  </div>

                  {/* Texte de confirmation */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm-text" className="text-sm text-slate-300">
                      Tapez <code className="px-1.5 py-0.5 rounded bg-slate-700 text-red-400 font-mono text-xs">{CONFIRMATION_TEXT}</code> pour confirmer :
                    </Label>
                    <Input
                      id="confirm-text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Tapez PURGE pour confirmer..."
                      className="bg-slate-800 border-slate-600 text-white font-mono"
                      disabled={purging || !hasAnySelection}
                    />
                  </div>

                  {/* Compte à rebours */}
                  {countdown > 0 && (
                    <div className="flex items-center justify-center p-4 rounded-lg bg-red-900/30 border border-red-900/50">
                      <Icons.loader className="h-5 w-5 animate-spin text-red-400 mr-3" />
                      <span className="text-red-300 font-medium">
                        Purge dans {countdown} seconde{countdown > 1 ? 's' : ''}...
                      </span>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                {result ? (
                  <Button
                    variant="outline"
                    onClick={() => handleDialogOpenChange(false)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    Fermer
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleDialogOpenChange(false)}
                      disabled={purging}
                      className="border-slate-600 text-slate-300 hover:bg-slate-800"
                    >
                      Annuler
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handlePurge}
                      disabled={!canPurge}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {purging ? (
                        <>
                          <Icons.loader className="h-4 w-4 animate-spin mr-2" />
                          Purge en cours...
                        </>
                      ) : (
                        <>
                          <Icons.trash className="h-4 w-4 mr-2" />
                          Supprimer les éléments sélectionnés
                        </>
                      )}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// SOUS-COMPOSANT: ITEM DE SÉLECTION
// =============================================================================

interface SelectionItemProps {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  forced?: boolean
  warning?: boolean
}

function SelectionItem({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  forced = false,
  warning = false,
}: SelectionItemProps) {
  return (
    <div className={cn(
      "flex items-start space-x-3 p-2 rounded-lg transition-colors",
      checked && !warning && "bg-slate-700/30",
      checked && warning && "bg-yellow-900/20",
      forced && "opacity-70"
    )}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <Label
          htmlFor={id}
          className={cn(
            "text-sm font-medium cursor-pointer flex items-center gap-2",
            checked ? "text-white" : "text-slate-400",
            warning && checked && "text-yellow-300"
          )}
        >
          {label}
          {forced && (
            <span className="text-xs text-blue-400 font-normal">(forcé par dépendance)</span>
          )}
        </Label>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}
