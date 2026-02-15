'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  detectDocumentGroupsAction,
  importLegalDocumentsAction,
} from '@/app/actions/legal-documents'
import type { DocumentGroup } from '@/lib/legal-documents/document-group-detector'

interface Props {
  sources: { id: string; name: string; base_url: string }[]
}

type Step = 'select' | 'groups' | 'importing' | 'done'

export function ImportLegalDocumentsDialog({ sources }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('select')
  const [selectedSource, setSelectedSource] = useState('')
  const [groups, setGroups] = useState<DocumentGroup[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    imported: number
    errors: string[]
  } | null>(null)

  function reset() {
    setStep('select')
    setSelectedSource('')
    setGroups([])
    setSelectedSlugs(new Set())
    setLoading(false)
    setError(null)
    setImportResult(null)
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) reset()
  }

  async function handleAnalyze() {
    if (!selectedSource) return
    setLoading(true)
    setError(null)

    const result = await detectDocumentGroupsAction(selectedSource)

    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }

    setGroups(result.groups)
    // Présélectionner les groupes non-existants
    const newSlugs = new Set(
      result.groups.filter(g => !g.alreadyExists).map(g => g.slug)
    )
    setSelectedSlugs(newSlugs)
    setStep('groups')
  }

  function toggleSlug(slug: string) {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedSlugs(new Set(groups.map(g => g.slug)))
  }

  function selectNewOnly() {
    setSelectedSlugs(
      new Set(groups.filter(g => !g.alreadyExists).map(g => g.slug))
    )
  }

  async function handleImport() {
    if (selectedSlugs.size === 0) return
    setStep('importing')
    setError(null)

    const result = await importLegalDocumentsAction(
      selectedSource,
      Array.from(selectedSlugs)
    )

    setImportResult(result)
    setStep('done')
  }

  const newGroupsCount = groups.filter(g => !g.alreadyExists).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Icons.download className="h-4 w-4 mr-2" />
          Importer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">
            Importer des documents juridiques
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Importer des documents depuis les pages web crawlees
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* STEP: SELECT SOURCE */}
          {step === 'select' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Source web
                </label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Choisir une source...</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.base_url})
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleAnalyze}
                  disabled={!selectedSource || loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Icons.search className="h-4 w-4 mr-2" />
                      Analyser
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* STEP: SELECT GROUPS */}
          {step === 'groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  {groups.length} groupe{groups.length > 1 ? 's' : ''} detecte{groups.length > 1 ? 's' : ''} ({newGroupsCount} nouveau{newGroupsCount > 1 ? 'x' : ''})
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                    className="text-xs"
                  >
                    Tout selectionner
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectNewOnly}
                    className="text-xs"
                  >
                    Nouveaux uniquement
                  </Button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                {groups.map((group) => (
                  <div
                    key={group.slug}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSlugs.has(group.slug)
                        ? 'border-blue-500/50 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                    onClick={() => toggleSlug(group.slug)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSlugs.has(group.slug)}
                          onChange={() => toggleSlug(group.slug)}
                          className="rounded border-slate-600 bg-slate-700 text-blue-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-white">
                            {group.label}
                          </span>
                          {group.alreadyExists && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                              Deja importe
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-700">
                          {group.documentType}
                        </span>
                        <span>{group.pageCount} pages</span>
                      </div>
                    </div>
                    {group.sampleUrls.length > 0 && (
                      <div className="mt-2 ml-8 space-y-0.5">
                        {group.sampleUrls.map((url, i) => (
                          <div
                            key={i}
                            className="text-xs text-slate-500 truncate"
                          >
                            {url}
                          </div>
                        ))}
                        {group.pageCount > 3 && (
                          <div className="text-xs text-slate-600">
                            ...et {group.pageCount - 3} autres
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {groups.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  Aucun groupe de pages consolidable detecte pour cette source.
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('select')
                    setGroups([])
                  }}
                >
                  <Icons.arrowLeft className="h-4 w-4 mr-2" />
                  Retour
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedSlugs.size === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Icons.download className="h-4 w-4 mr-2" />
                  Importer {selectedSlugs.size} document{selectedSlugs.size > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* STEP: IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Icons.loader className="h-8 w-8 animate-spin text-blue-400" />
              <p className="text-slate-300">
                Import en cours... ({selectedSlugs.size} document{selectedSlugs.size > 1 ? 's' : ''})
              </p>
              <p className="text-xs text-slate-500">
                Creation, liaison des pages et consolidation
              </p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <Icons.checkCircle className="h-6 w-6 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-400">
                    {importResult.imported} document{importResult.imported > 1 ? 's' : ''} importe{importResult.imported > 1 ? 's' : ''} avec succes
                  </p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-sm font-medium text-red-400 mb-2">
                    {importResult.errors.length} erreur{importResult.errors.length > 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1">
                    {importResult.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-300">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    handleOpenChange(false)
                    router.refresh()
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
