'use client'

/**
 * Arbre hiérarchique des pages d'une source web
 * Groupé par catégorie juridique > code/sujet > pages
 */

import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getUnifiedLabel } from '@/lib/categories/taxonomy-bridge'

interface CodeStats {
  code_name: string
  code_slug: string
  total_pages: number
  pending: number
  crawled: number
  unchanged: number
  failed: number
  indexed: number
  last_crawl_at: string | null
}

interface CategoryGroup {
  legal_domain: string | null
  total_pages: number
  codes: CodeStats[]
}

interface WebSourceTreeViewProps {
  groups: CategoryGroup[]
  sourceId: string
}

const CATEGORY_STYLES: Record<string, { icon: string; color: string }> = {
  legislation: { icon: '📜', color: 'text-blue-400' },
  jurisprudence: { icon: '⚖️', color: 'text-purple-400' },
  doctrine: { icon: '📚', color: 'text-green-400' },
  codes: { icon: '📖', color: 'text-cyan-400' },
  autre: { icon: '📄', color: 'text-muted-foreground' },
  null: { icon: '❓', color: 'text-orange-400' },
}

export function WebSourceTreeView({ groups, sourceId }: WebSourceTreeViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['legislation', 'codes']) // Législation et codes expanded par défaut
  )
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set())

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleCode = (codeSlug: string) => {
    const newExpanded = new Set(expandedCodes)
    if (newExpanded.has(codeSlug)) {
      newExpanded.delete(codeSlug)
    } else {
      newExpanded.add(codeSlug)
    }
    setExpandedCodes(newExpanded)
  }

  return (
    <div className="space-y-2">
      {groups
        .sort((a, b) => b.total_pages - a.total_pages)
        .map(group => {
          const category = group.legal_domain || 'null'
          const style = CATEGORY_STYLES[category] || { icon: '📄', color: 'text-muted-foreground' }
          const labelAr = category === 'null' ? 'غير مصنف' : getUnifiedLabel(category, 'ar')
          const isExpanded = expandedCategories.has(category)

          return (
            <div key={category} className="border border-border rounded-lg overflow-hidden">
              {/* Niveau 1 : Catégorie juridique */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 bg-card hover:bg-muted flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icons.chevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-90'
                    )}
                  />
                  <span className={cn('text-lg', style.color)}>{style.icon}</span>
                  <span className="font-medium text-foreground">{labelAr}</span>
                  <Badge variant="outline" className="bg-muted border-border text-foreground">
                    {group.codes.length} code{group.codes.length > 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="bg-muted border-border text-foreground">
                    {group.total_pages} page{group.total_pages > 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {group.codes.reduce((sum, c) => sum + c.indexed, 0)} indexées
                  </span>
                </div>
              </button>

              {/* Niveau 2 : Codes */}
              {isExpanded && (
                <div className="bg-card/50">
                  {group.codes
                    .sort((a, b) => b.total_pages - a.total_pages)
                    .map(code => {
                      const isCodeExpanded = expandedCodes.has(code.code_slug)
                      const progress = code.total_pages > 0
                        ? Math.round((code.crawled + code.unchanged) / code.total_pages * 100)
                        : 0

                      return (
                        <div
                          key={code.code_slug}
                          className="border-t border-border/50"
                        >
                          <button
                            onClick={() => toggleCode(code.code_slug)}
                            className="w-full px-6 py-2.5 hover:bg-muted/30 flex items-center justify-between transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Icons.chevronRight
                                className={cn(
                                  'h-3 w-3 text-muted-foreground transition-transform',
                                  isCodeExpanded && 'rotate-90'
                                )}
                              />
                              <span className="text-sm font-medium text-foreground">
                                {code.code_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Barre de progression */}
                              <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full transition-all',
                                      progress === 0 && 'bg-muted-foreground/30',
                                      progress > 0 && progress < 50 && 'bg-yellow-500',
                                      progress >= 50 && progress < 100 && 'bg-blue-500',
                                      progress === 100 && 'bg-green-500'
                                    )}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-12 text-right">
                                  {progress}%
                                </span>
                              </div>

                              {/* Stats */}
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="bg-muted/50 border-border text-foreground">
                                  {code.total_pages} pages
                                </Badge>
                                {code.indexed > 0 && (
                                  <Badge variant="outline" className="bg-green-900/20 border-green-700 text-green-400">
                                    {code.indexed} ✓
                                  </Badge>
                                )}
                                {code.pending > 0 && (
                                  <Badge variant="outline" className="bg-yellow-900/20 border-yellow-700 text-yellow-400">
                                    {code.pending} ⏳
                                  </Badge>
                                )}
                                {code.failed > 0 && (
                                  <Badge variant="outline" className="bg-red-900/20 border-red-700 text-red-400">
                                    {code.failed} ✗
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Niveau 3 : Détails du code (expandable) */}
                          {isCodeExpanded && (
                            <div className="px-6 py-3 bg-card/50 text-xs text-muted-foreground space-y-2">
                              <div className="grid grid-cols-4 gap-4">
                                <div>
                                  <span className="text-muted-foreground">En attente</span>
                                  <p className="text-foreground font-medium">{code.pending}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Crawlées</span>
                                  <p className="text-foreground font-medium">{code.crawled}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Inchangées</span>
                                  <p className="text-foreground font-medium">{code.unchanged}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Indexées</span>
                                  <p className="text-foreground font-medium">{code.indexed}</p>
                                </div>
                              </div>
                              {code.last_crawl_at && (
                                <div>
                                  <span className="text-muted-foreground">Dernier crawl : </span>
                                  <span className="text-foreground">
                                    {new Date(code.last_crawl_at).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' })}
                                  </span>
                                </div>
                              )}
                              <div className="pt-2">
                                <a
                                  href={`/super-admin/web-sources/${sourceId}/pages?code=${code.code_slug}`}
                                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                                >
                                  <Icons.externalLink className="h-3 w-3" />
                                  Voir toutes les pages de ce code
                                </a>
                              </div>
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
