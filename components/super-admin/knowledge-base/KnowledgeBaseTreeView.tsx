'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCategoryLabel, getSubcategoryLabel } from '@/lib/knowledge-base/categories'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface TreeCategory {
  category: string
  doc_count: number
  indexed_count: number
  avg_quality: number | null
  stale_count: number
  last_updated: string | null
  subcategories: TreeSubcategory[]
}

interface TreeSubcategory {
  subcategory: string | null
  doc_count: number
  indexed_count: number
  avg_quality: number | null
  stale_count: number
  last_updated: string | null
}

interface TreeDocument {
  id: string
  title: string
  category: string
  subcategory: string | null
  isIndexed: boolean
  qualityScore: number | null
  updatedAt: string
  version: number
  chunkCount: number
  sourceUrl: string | null
  lastCrawledAt: string | null
  isStale: boolean
}

// =============================================================================
// CATEGORY STYLES
// =============================================================================

const CATEGORY_ICONS: Record<string, string> = {
  legislation: '📜',
  jurisprudence: '⚖️',
  doctrine: '📚',
  codes: '📖',
  modeles: '📄',
  procedures: '📋',
  jort: '📰',
  formulaires: '📝',
  google_drive: '☁️',
  actualites: '📢',
  autre: '📁',
}

// =============================================================================
// COMPONENT
// =============================================================================

export function KnowledgeBaseTreeView() {
  const [categories, setCategories] = useState<TreeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set())
  const [documents, setDocuments] = useState<Record<string, TreeDocument[]>>({})
  const [loadingDocs, setLoadingDocs] = useState<Set<string>>(new Set())
  const [reindexing, setReindexing] = useState<Set<string>>(new Set())

  // Charger l'arbre initial
  const loadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/kb/tree')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch {
      toast.error('Impossible de charger l\'arbre KB')
    } finally {
      setLoading(false)
    }
  }, [])

  // Charger au premier rendu
  useState(() => { loadTree() })

  // Charger les documents d'une catégorie/sous-catégorie
  const loadDocuments = async (key: string) => {
    if (documents[key]) return // Déjà chargés

    setLoadingDocs(prev => new Set(prev).add(key))
    try {
      const res = await fetch(`/api/admin/kb/tree/${encodeURIComponent(key)}`)
      const data = await res.json()
      setDocuments(prev => ({ ...prev, [key]: data.documents || [] }))
    } catch {
      toast.error('Impossible de charger les documents')
    } finally {
      setLoadingDocs(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const toggleCategory = (category: string) => {
    const next = new Set(expandedCategories)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    setExpandedCategories(next)
  }

  const toggleSubcategory = (key: string) => {
    const next = new Set(expandedSubcategories)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
      loadDocuments(key)
    }
    setExpandedSubcategories(next)
  }

  const handleReindexCategory = async (category: string) => {
    setReindexing(prev => new Set(prev).add(category))
    try {
      const res = await fetch('/api/admin/kb/rechunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, dryRun: false }),
      })
      const data = await res.json()
      toast.success(`Re-indexation lancée — ${data.processed || 0} documents traités pour "${getCategoryLabel(category, 'ar')}"`)
    } catch {
      toast.error('Échec de la re-indexation')
    } finally {
      setReindexing(prev => {
        const next = new Set(prev)
        next.delete(category)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-slate-800 animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Icons.folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Aucun document dans la base de connaissances</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {categories.map(cat => {
        const icon = CATEGORY_ICONS[cat.category] || '📁'
        const isExpanded = expandedCategories.has(cat.category)
        const indexedPercent = cat.doc_count > 0
          ? Math.round((cat.indexed_count / cat.doc_count) * 100)
          : 0

        return (
          <div key={cat.category} className="border border-slate-700 rounded-lg overflow-hidden">
            {/* Niveau 1 : Catégorie */}
            <div className="flex items-center bg-slate-800 hover:bg-slate-750 transition-colors">
              <button
                onClick={() => toggleCategory(cat.category)}
                className="flex-1 px-4 py-3 flex items-center gap-3"
              >
                <Icons.chevronRight
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
                <span className="text-lg">{icon}</span>
                <span className="font-medium text-white" dir="rtl">
                  {getCategoryLabel(cat.category, 'ar')}
                </span>
                <span className="text-sm text-slate-500">
                  ({getCategoryLabel(cat.category, 'fr')})
                </span>
                <Badge variant="outline" className="bg-slate-700 border-slate-600 text-slate-300">
                  {cat.doc_count} doc{cat.doc_count > 1 ? 's' : ''}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-slate-600',
                    indexedPercent === 100 ? 'bg-green-900/20 text-green-400 border-green-700' :
                    indexedPercent > 0 ? 'bg-blue-900/20 text-blue-400 border-blue-700' :
                    'bg-slate-700 text-slate-400'
                  )}
                >
                  {indexedPercent}% indexé
                </Badge>
                {cat.stale_count > 0 && (
                  <Badge variant="outline" className="bg-orange-900/20 border-orange-700 text-orange-400">
                    {cat.stale_count} obsolète{cat.stale_count > 1 ? 's' : ''}
                  </Badge>
                )}
              </button>

              {/* Actions catégorie */}
              {isExpanded && (
                <div className="flex items-center gap-2 pr-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-blue-400 h-8"
                    onClick={() => handleReindexCategory(cat.category)}
                    disabled={reindexing.has(cat.category)}
                  >
                    {reindexing.has(cat.category) ? (
                      <Icons.loader className="h-3 w-3 animate-spin" />
                    ) : (
                      <Icons.refresh className="h-3 w-3" />
                    )}
                    <span className="ml-1 text-xs">Re-indexer</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Niveau 2 : Sous-catégories */}
            {isExpanded && (
              <div className="bg-slate-800/50">
                {cat.subcategories.map(sub => {
                  const subKey = `${cat.category}:${sub.subcategory || '_null'}`
                  const isSubExpanded = expandedSubcategories.has(subKey)
                  const subDocs = documents[subKey] || []
                  const isLoadingDocs = loadingDocs.has(subKey)
                  const subLabel = sub.subcategory
                    ? getSubcategoryLabel(sub.subcategory, 'ar')
                    : 'غير مصنف'
                  const subLabelFr = sub.subcategory
                    ? getSubcategoryLabel(sub.subcategory, 'fr')
                    : 'Non classé'

                  return (
                    <div key={subKey} className="border-t border-slate-700/50">
                      <button
                        onClick={() => toggleSubcategory(subKey)}
                        className="w-full px-8 py-2.5 hover:bg-slate-700/30 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Icons.chevronRight
                            className={cn(
                              'h-3 w-3 text-slate-500 transition-transform',
                              isSubExpanded && 'rotate-90'
                            )}
                          />
                          <span className="text-sm font-medium text-slate-200" dir="rtl">
                            {subLabel}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({subLabelFr})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="bg-slate-700/50 border-slate-600 text-slate-300">
                            {sub.doc_count} doc{sub.doc_count > 1 ? 's' : ''}
                          </Badge>
                          {sub.indexed_count > 0 && (
                            <Badge variant="outline" className="bg-green-900/20 border-green-700 text-green-400">
                              {sub.indexed_count} indexé{sub.indexed_count > 1 ? 's' : ''}
                            </Badge>
                          )}
                          {sub.avg_quality != null && (
                            <QualityBadge score={sub.avg_quality} />
                          )}
                        </div>
                      </button>

                      {/* Niveau 3 : Documents */}
                      {isSubExpanded && (
                        <div className="bg-slate-900/50 px-8 py-2">
                          {isLoadingDocs ? (
                            <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
                              <Icons.loader className="h-4 w-4 animate-spin" />
                              Chargement des documents...
                            </div>
                          ) : subDocs.length === 0 ? (
                            <p className="py-4 text-slate-500 text-sm">Aucun document</p>
                          ) : (
                            <div className="space-y-1">
                              {subDocs.map(doc => (
                                <DocumentRow key={doc.id} doc={doc} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function QualityBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-400 border-green-700 bg-green-900/20' :
    score >= 60 ? 'text-yellow-400 border-yellow-700 bg-yellow-900/20' :
    'text-red-400 border-red-700 bg-red-900/20'

  return (
    <Badge variant="outline" className={color}>
      Q: {Math.round(score)}
    </Badge>
  )
}

function DocumentRow({ doc }: { doc: TreeDocument }) {
  return (
    <Link
      href={`/super-admin/knowledge-base/${doc.id}`}
      className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-800/50 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Icons.fileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
        <span className="text-sm text-slate-300 truncate group-hover:text-white" dir="rtl">
          {doc.title}
        </span>
        {doc.version > 1 && (
          <span className="text-xs text-slate-500">v{doc.version}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {doc.chunkCount > 0 && (
          <span className="text-xs text-slate-500">{doc.chunkCount} chunks</span>
        )}
        {doc.isIndexed ? (
          <Icons.checkCircle className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Icons.clock className="h-3.5 w-3.5 text-yellow-500" />
        )}
        {doc.isStale && (
          <Icons.alertTriangle className="h-3.5 w-3.5 text-orange-500" />
        )}
        {doc.qualityScore != null && (
          <QualityBadge score={doc.qualityScore} />
        )}
        <Icons.chevronRight className="h-3 w-3 text-slate-600 group-hover:text-slate-400" />
      </div>
    </Link>
  )
}
