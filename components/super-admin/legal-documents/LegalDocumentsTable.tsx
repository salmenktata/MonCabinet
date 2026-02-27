'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { bulkApproveLegalDocuments } from '@/app/actions/legal-documents'

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const NORM_LEVEL_BADGE: Record<string, string> = {
  constitution:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  traite_international: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  loi_organique:        'bg-blue-500/20 text-blue-300 border-blue-500/30',
  loi_ordinaire:        'bg-sky-500/20 text-sky-300 border-sky-500/30',
  marsoum:              'bg-green-500/20 text-green-300 border-green-500/30',
  ordre_reglementaire:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  arrete_ministeriel:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  acte_local:           'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const NORM_LEVEL_LABEL: Record<string, string> = {
  constitution:         'Constitution',
  traite_international: 'Traité int.',
  loi_organique:        'Loi org.',
  loi_ordinaire:        'Loi / Code',
  marsoum:              'Marsoum',
  ordre_reglementaire:  'Réglementaire',
  arrete_ministeriel:   'Arrêté min.',
  acte_local:           'Acte local',
}

const TYPE_BADGE: Record<string, string> = {
  code:         'bg-purple-500/20 text-purple-400 border-purple-500/30',
  loi:          'bg-blue-500/20 text-blue-400 border-blue-500/30',
  decret:       'bg-orange-500/20 text-orange-400 border-orange-500/30',
  arrete:       'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  circulaire:   'bg-teal-500/20 text-teal-400 border-teal-500/30',
  jurisprudence:'bg-amber-500/20 text-amber-400 border-amber-500/30',
  doctrine:     'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  guide:        'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  formulaire:   'bg-pink-500/20 text-pink-400 border-pink-500/30',
  autre:        'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const TYPE_LABEL: Record<string, string> = {
  code: 'Code', loi: 'Loi', decret: 'Décret', arrete: 'Arrêté',
  circulaire: 'Circulaire', jurisprudence: 'Juris.', doctrine: 'Doctrine',
  guide: 'Guide', formulaire: 'Formulaire', autre: 'Autre',
}

const CATEGORY_BADGE: Record<string, string> = {
  codes:         'bg-purple-500/15 text-purple-400 border-purple-500/25',
  code:          'bg-purple-500/15 text-purple-400 border-purple-500/25',
  legislation:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  jurisprudence: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  doctrine:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  constitution:  'bg-red-500/15 text-red-400 border-red-500/25',
  jort:          'bg-orange-500/15 text-orange-400 border-orange-500/25',
  lexique:       'bg-teal-500/15 text-teal-400 border-teal-500/25',
  conventions:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  procedures:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  autre:         'bg-slate-500/15 text-slate-400 border-slate-500/25',
}

const CATEGORY_LABEL: Record<string, string> = {
  codes: 'Codes', code: 'Codes', legislation: 'Légis.', jurisprudence: 'Juris.',
  doctrine: 'Doctrine', constitution: 'Constit.', jort: 'JORT', lexique: 'Lexique',
  conventions: 'Conv.', procedures: 'Proc.', autre: 'Autre',
}

const CONSOLIDATION_BADGE: Record<string, string> = {
  pending:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  partial:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  complete: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const CONSOLIDATION_LABEL: Record<string, string> = {
  pending: 'En attente',
  partial: 'Partiel',
  complete: 'Complet',
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface LegalDoc {
  id: string
  citation_key: string
  document_type: string
  primary_category: string | null
  norm_level: string | null
  official_title_ar: string | null
  official_title_fr: string | null
  consolidation_status: string
  is_abrogated: boolean
  is_approved: boolean
  page_count: number
  last_verified_at: string | null
  created_at: string
  linked_pages: string
  articles_count: string
  chunks_count: string
  staleness_days: number | null
  staleness_threshold: number
  freshness_color: string
  kb_is_active: boolean | null
  kb_rag_enabled: boolean | null
}

interface LegalDocumentsTableProps {
  docs: LegalDoc[]
  hasFilters: boolean
  typeColors?: Record<string, string>
  consolidationColors?: Record<string, string>
  consolidationLabels?: Record<string, string>
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function LegalDocumentsTable({
  docs,
  hasFilters,
}: LegalDocumentsTableProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === docs.length ? new Set() : new Set(docs.map(d => d.id)))
  }

  const handleBulkAction = async (action: 'approve' | 'revoke') => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const result = await bulkApproveLegalDocuments(action, Array.from(selectedIds))
      if (result.error) {
        toast.error(result.error)
      } else {
        const label = action === 'approve' ? 'approuvé(s)' : 'révoqué(s)'
        toast.success(`${result.count} document(s) ${label}`)
        setSelectedIds(new Set())
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'action groupée")
    } finally {
      setBulkLoading(false)
    }
  }

  const handleQuickApprove = async (docId: string) => {
    setApprovingId(docId)
    try {
      const res = await fetch(`/api/admin/legal-documents/${docId}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'approbation")
      } else {
        toast.success(`Approuvé — ${data.chunks_count ?? 0} chunks indexés`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <>
      {/* Bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 mb-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-sm text-blue-300 font-medium">
            {selectedIds.size} document{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('approve')}
              disabled={bulkLoading}
              className="border-green-500/30 text-green-400 hover:bg-green-500/10 h-7 text-xs"
            >
              {bulkLoading ? (
                <Icons.loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Icons.checkCircle className="h-3.5 w-3.5 mr-1" />
                  Approuver
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('revoke')}
              disabled={bulkLoading}
              className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 h-7 text-xs"
            >
              {bulkLoading ? (
                <Icons.loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Icons.shield className="h-3.5 w-3.5 mr-1" />
                  Révoquer
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 h-7 text-xs"
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent bg-slate-900/80">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={docs.length > 0 && selectedIds.size === docs.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide">Document</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide">Hiérarchie</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide">Type / Cat.</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide">Consolidation</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide text-center">Métriques</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide">Statut</TableHead>
              <TableHead className="text-slate-400 font-medium text-xs uppercase tracking-wide text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Icons.scale className="h-10 w-10 opacity-30" />
                    <p className="text-sm">
                      {hasFilters ? 'Aucun document ne correspond aux filtres' : 'Aucun document juridique'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => {
                const canQuickApprove = doc.consolidation_status === 'complete' && !doc.is_approved
                const isApproving = approvingId === doc.id
                const stalenessRatio = doc.staleness_threshold > 0
                  ? Math.min((doc.staleness_days ?? 0) / doc.staleness_threshold, 1)
                  : 0

                return (
                  <TableRow
                    key={doc.id}
                    className={`border-slate-700/50 hover:bg-slate-800/40 transition-colors group ${
                      selectedIds.has(doc.id) ? 'bg-blue-500/5' : ''
                    } ${doc.is_abrogated ? 'opacity-60' : ''}`}
                  >
                    {/* Checkbox */}
                    <TableCell className="pl-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(doc.id)}
                        onCheckedChange={() => toggleSelect(doc.id)}
                      />
                    </TableCell>

                    {/* Document: key + titres */}
                    <TableCell className="py-3 max-w-[260px]">
                      <div className="space-y-0.5">
                        <div className="font-mono text-[11px] text-slate-500 leading-none tracking-tight">
                          {doc.citation_key}
                        </div>
                        {doc.official_title_ar && (
                          <div
                            className="text-sm text-white font-medium truncate leading-snug"
                            dir="rtl"
                            lang="ar"
                            title={doc.official_title_ar}
                          >
                            {doc.official_title_ar}
                          </div>
                        )}
                        {doc.official_title_fr && (
                          <div
                            className="text-[11px] text-slate-400 truncate leading-snug"
                            title={doc.official_title_fr}
                          >
                            {doc.official_title_fr}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Hiérarchie */}
                    <TableCell className="py-3">
                      {doc.norm_level ? (
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${NORM_LEVEL_BADGE[doc.norm_level] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
                        >
                          {NORM_LEVEL_LABEL[doc.norm_level] ?? doc.norm_level}
                        </Badge>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Type + Catégorie */}
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[11px] w-fit ${TYPE_BADGE[doc.document_type] ?? TYPE_BADGE.autre}`}
                        >
                          {TYPE_LABEL[doc.document_type] ?? doc.document_type}
                        </Badge>
                        {doc.primary_category && (
                          <Badge
                            variant="outline"
                            className={`text-[11px] w-fit ${CATEGORY_BADGE[doc.primary_category] ?? CATEGORY_BADGE.autre}`}
                          >
                            {CATEGORY_LABEL[doc.primary_category] ?? doc.primary_category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Consolidation + Fraîcheur */}
                    <TableCell className="py-3">
                      <div className="space-y-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${CONSOLIDATION_BADGE[doc.consolidation_status] ?? CONSOLIDATION_BADGE.pending}`}
                        >
                          {CONSOLIDATION_LABEL[doc.consolidation_status] ?? doc.consolidation_status}
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                doc.freshness_color === 'text-red-400'
                                  ? 'bg-red-500'
                                  : doc.freshness_color === 'text-yellow-400'
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.round(stalenessRatio * 100)}%` }}
                            />
                          </div>
                          <span className={`text-[11px] tabular-nums ${doc.freshness_color}`}>
                            {doc.staleness_days ?? 0}j
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Métriques */}
                    <TableCell className="py-3 text-center">
                      <div className="flex items-center justify-center gap-2.5 text-[11px] text-slate-400">
                        <span className="flex items-center gap-0.5" title="Articles">
                          <Icons.hash className="h-3 w-3" />
                          <span className="tabular-nums text-slate-300">{parseInt(doc.articles_count)}</span>
                        </span>
                        <span className="flex items-center gap-0.5" title="Pages liées">
                          <Icons.link className="h-3 w-3" />
                          <span className="tabular-nums">{parseInt(doc.linked_pages)}</span>
                        </span>
                        <span className="flex items-center gap-0.5" title="Chunks KB">
                          <Icons.database className="h-3 w-3" />
                          <span className={`tabular-nums ${parseInt(doc.chunks_count) > 0 ? 'text-blue-400' : ''}`}>
                            {parseInt(doc.chunks_count)}
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    {/* Statut */}
                    <TableCell className="py-3">
                      <div className="flex flex-col gap-1">
                        {doc.is_approved ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-green-400">
                            <Icons.checkCircle className="h-3 w-3 shrink-0" />
                            Approuvé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <Icons.clock className="h-3 w-3 shrink-0" />
                            En attente
                          </span>
                        )}
                        {doc.is_abrogated && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                            <Icons.xCircle className="h-3 w-3 shrink-0" />
                            Abrogé
                          </span>
                        )}
                        {/* Visibilité client KB */}
                        {(() => {
                          const chunks = parseInt(doc.chunks_count)
                          const visible = doc.is_approved && chunks > 0 && doc.kb_is_active === true && doc.kb_rag_enabled !== false
                          const indexed = chunks > 0 && (!doc.is_approved || doc.kb_is_active === false)
                          const pendingIndex = doc.is_approved && chunks === 0
                          if (visible) {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                                <Icons.eye className="h-3 w-3 shrink-0" />
                                Visible KB
                              </span>
                            )
                          }
                          if (indexed) {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] text-orange-400">
                                <Icons.eyeOff className="h-3 w-3 shrink-0" />
                                Indexé / caché
                              </span>
                            )
                          }
                          if (pendingIndex) {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500">
                                <Icons.loader className="h-3 w-3 shrink-0" />
                                À indexer
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3 pr-4">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {canQuickApprove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleQuickApprove(doc.id)}
                            disabled={isApproving}
                            className="h-7 w-7 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            title="Approuver et indexer"
                          >
                            {isApproving ? (
                              <Icons.loader className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Icons.checkCircle className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Link href={`/super-admin/legal-documents/${doc.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                            title="Voir le document"
                          >
                            <Icons.eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
