'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { NORM_LEVEL_CONFIG, type NormLevel } from '@/lib/categories/norm-levels'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { bulkApproveLegalDocuments } from '@/app/actions/legal-documents'

// Couleurs dark-theme pour les badges norm_level dans la table
const NORM_LEVEL_DARK_BADGE: Record<string, string> = {
  constitution:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  traite_international: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  loi_organique:        'bg-blue-500/20 text-blue-300 border-blue-500/30',
  loi_ordinaire:        'bg-sky-500/20 text-sky-300 border-sky-500/30',
  marsoum:              'bg-green-500/20 text-green-300 border-green-500/30',
  ordre_reglementaire:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  arrete_ministeriel:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  acte_local:           'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

// Labels courts pour la table
const NORM_LEVEL_SHORT: Record<string, string> = {
  constitution:         'Constitution',
  traite_international: 'Traité int.',
  loi_organique:        'Loi org.',
  loi_ordinaire:        'Loi / Code',
  marsoum:              'Marsoum',
  ordre_reglementaire:  'Réglementaire',
  arrete_ministeriel:   'Arrêté',
  acte_local:           'Acte local',
}

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
}

const CATEGORY_COLORS: Record<string, string> = {
  codes:         'bg-purple-500/20 text-purple-400 border-purple-500/30',
  code:          'bg-purple-500/20 text-purple-400 border-purple-500/30',
  legislation:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  jurisprudence: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  doctrine:      'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  constitution:  'bg-red-500/20 text-red-400 border-red-500/30',
  jort:          'bg-orange-500/20 text-orange-400 border-orange-500/30',
  lexique:       'bg-teal-500/20 text-teal-400 border-teal-500/30',
  conventions:   'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  actualites:    'bg-slate-500/20 text-slate-400 border-slate-500/30',
  procedures:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  autre:         'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const CATEGORY_LABELS: Record<string, string> = {
  codes:         'Code',
  code:          'Code',
  legislation:   'Législation',
  jurisprudence: 'Jurisprudence',
  doctrine:      'Doctrine',
  constitution:  'Constitution',
  jort:          'JORT',
  lexique:       'Lexique',
  conventions:   'Conventions',
  actualites:    'Actualités',
  procedures:    'Procédures',
  autre:         'Autre',
}

interface LegalDocumentsTableProps {
  docs: LegalDoc[]
  hasFilters: boolean
  typeColors: Record<string, string>
  consolidationColors: Record<string, string>
  consolidationLabels: Record<string, string>
}

export function LegalDocumentsTable({
  docs,
  hasFilters,
  typeColors,
  consolidationColors,
  consolidationLabels,
}: LegalDocumentsTableProps) {
  const router = useRouter()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === docs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(docs.map(d => d.id)))
    }
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
        toast.success(`Action effectu\u00e9e \u2014 ${result.count} document(s) ${label}`)
        setSelectedIds(new Set())
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'action group\u00e9e")
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <>
      {/* Toolbar bulk */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 mb-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-sm text-blue-300">
            {selectedIds.size} document(s) sélectionné(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('approve')}
              disabled={bulkLoading}
              className="border-green-500/30 text-green-400"
            >
              {bulkLoading ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Icons.checkCircle className="h-4 w-4 mr-1" />
                  Approuver
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('revoke')}
              disabled={bulkLoading}
              className="border-orange-500/30 text-orange-400"
            >
              {bulkLoading ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Icons.shield className="h-4 w-4 mr-1" />
                  Révoquer
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400"
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
            <TableRow className="border-slate-700 hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={docs.length > 0 && selectedIds.size === docs.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-slate-400">Citation Key</TableHead>
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-slate-400">Catégorie</TableHead>
              <TableHead className="text-slate-400">Hiérarchie</TableHead>
              <TableHead className="text-slate-400">Titre (AR)</TableHead>
              <TableHead className="text-slate-400">Consolidation</TableHead>
              <TableHead className="text-slate-400 text-center">Articles</TableHead>
              <TableHead className="text-slate-400 text-center">Pages</TableHead>
              <TableHead className="text-slate-400 text-center">Chunks KB</TableHead>
              <TableHead className="text-slate-400">Approbation</TableHead>
              <TableHead className="text-slate-400">Fraîcheur</TableHead>
              <TableHead className="text-slate-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8 text-slate-400">
                  <Icons.scale className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  {hasFilters ? 'Aucun document ne correspond aux filtres' : 'Aucun document juridique'}
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className={`border-slate-700 hover:bg-slate-800/50 ${
                    selectedIds.has(doc.id) ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => toggleSelect(doc.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-white" dir={/[\u0600-\u06FF]/.test(doc.citation_key) ? 'rtl' : 'ltr'}>
                    {doc.citation_key}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={typeColors[doc.document_type] || typeColors.autre}>
                      {doc.document_type || 'autre'}
                    </Badge>
                    {doc.is_abrogated && (
                      <Badge variant="outline" className="ml-1 bg-red-500/20 text-red-400 border-red-500/30">
                        Abrogé
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.primary_category ? (
                      <Badge variant="outline" className={CATEGORY_COLORS[doc.primary_category] || CATEGORY_COLORS.autre}>
                        {CATEGORY_LABELS[doc.primary_category] || doc.primary_category}
                      </Badge>
                    ) : (
                      <span className="text-slate-600 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.norm_level ? (
                      <Badge variant="outline" className={NORM_LEVEL_DARK_BADGE[doc.norm_level] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                        {NORM_LEVEL_SHORT[doc.norm_level] || doc.norm_level}
                      </Badge>
                    ) : (
                      <span className="text-slate-600 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {doc.official_title_ar ? (
                      <span className="text-sm text-slate-300 truncate block" dir="rtl">
                        {doc.official_title_ar}
                      </span>
                    ) : doc.official_title_fr ? (
                      <span className="text-sm text-slate-400 truncate block italic">
                        {doc.official_title_fr}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={consolidationColors[doc.consolidation_status] || consolidationColors.pending}>
                      {consolidationLabels[doc.consolidation_status] || doc.consolidation_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-white font-medium">
                    {parseInt(doc.articles_count)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-300">
                    {parseInt(doc.linked_pages)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-300">
                    {parseInt(doc.chunks_count)}
                  </TableCell>
                  <TableCell>
                    {doc.is_approved ? (
                      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                        Approuvé
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                        En attente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm ${doc.freshness_color}`}>
                      {doc.staleness_days ?? 0}j / {doc.staleness_threshold}j
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/super-admin/legal-documents/${doc.id}`}>
                      <Button variant="ghost" size="sm">
                        <Icons.eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
