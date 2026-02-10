'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Scale,
  BookOpen,
  FileCode,
  FileQuestion,
  CheckCircle,
  Clock,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Loader2,
} from 'lucide-react'
import {
  deleteKnowledgeDocumentAction,
  indexKnowledgeDocumentAction,
} from '@/app/actions/knowledge-base'
import type { KnowledgeCategory } from '@/lib/categories/legal-categories'

// Utiliser le type du système centralisé
export type KnowledgeBaseCategory = KnowledgeCategory
export type KnowledgeBaseLanguage = 'ar' | 'fr'

export interface KnowledgeBaseDocumentData {
  id: string
  category: KnowledgeBaseCategory
  language: KnowledgeBaseLanguage
  title: string
  description: string | null
  isIndexed: boolean
  chunkCount?: number
  createdAt: Date | string
  updatedAt: Date | string
}

interface KnowledgeBaseListProps {
  documents: KnowledgeBaseDocumentData[]
  total: number
  onRefresh?: () => void
}

const CATEGORY_CONFIG: Record<
  KnowledgeBaseCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  jurisprudence: {
    label: 'Jurisprudence',
    icon: Scale,
    color: 'text-blue-600 bg-blue-100',
  },
  doctrine: {
    label: 'Doctrine',
    icon: FileText,
    color: 'text-purple-600 bg-purple-100',
  },
  autre: {
    label: 'Autre',
    icon: FileQuestion,
    color: 'text-gray-600 bg-gray-100',
  },
  // Nouvelles catégories centralisées
  codes: {
    label: 'Codes',
    icon: BookOpen,
    color: 'text-green-600 bg-green-100',
  },
  legislation: {
    label: 'Législation',
    icon: Scale,
    color: 'text-blue-600 bg-blue-100',
  },
  modeles: {
    label: 'Modèles',
    icon: FileCode,
    color: 'text-orange-600 bg-orange-100',
  },
  procedures: {
    label: 'Procédures',
    icon: FileText,
    color: 'text-cyan-600 bg-cyan-100',
  },
  jort: {
    label: 'JORT',
    icon: FileText,
    color: 'text-red-600 bg-red-100',
  },
  formulaires: {
    label: 'Formulaires',
    icon: FileCode,
    color: 'text-yellow-600 bg-yellow-100',
  },
  constitution: {
    label: 'Constitution',
    icon: Scale,
    color: 'text-pink-600 bg-pink-100',
  },
  conventions: {
    label: 'Conventions',
    icon: FileText,
    color: 'text-teal-600 bg-teal-100',
  },
  guides: {
    label: 'Guides',
    icon: BookOpen,
    color: 'text-lime-600 bg-lime-100',
  },
  lexique: {
    label: 'Lexique',
    icon: FileText,
    color: 'text-emerald-600 bg-emerald-100',
  },
}

const LANGUAGE_CONFIG: Record<KnowledgeBaseLanguage, { label: string; flag: string }> = {
  ar: { label: 'Arabe', flag: '🇹🇳' },
  fr: { label: 'Français', flag: '🇫🇷' },
}

export default function KnowledgeBaseList({
  documents,
  total,
  onRefresh,
}: KnowledgeBaseListProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<KnowledgeBaseCategory | 'all'>('all')
  const [filterLanguage, setFilterLanguage] = useState<KnowledgeBaseLanguage | 'all'>('all')
  const [filterIndexed, setFilterIndexed] = useState<'all' | 'yes' | 'no'>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'delete' | 'index' | null>(null)

  const filteredDocuments = documents.filter((doc) => {
    // Filtre par recherche
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      if (
        !doc.title.toLowerCase().includes(search) &&
        !(doc.description?.toLowerCase().includes(search))
      ) {
        return false
      }
    }

    // Filtre par catégorie
    if (filterCategory !== 'all' && doc.category !== filterCategory) {
      return false
    }

    // Filtre par langue
    if (filterLanguage !== 'all' && doc.language !== filterLanguage) {
      return false
    }

    // Filtre par statut indexation
    if (filterIndexed === 'yes' && !doc.isIndexed) return false
    if (filterIndexed === 'no' && doc.isIndexed) return false

    return true
  })

  const handleDelete = async (doc: KnowledgeBaseDocumentData) => {
    if (!confirm(`Supprimer "${doc.title}" ?`)) return

    setLoadingId(doc.id)
    setActionType('delete')

    try {
      const result = await deleteKnowledgeDocumentAction(doc.id)
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
        onRefresh?.()
      }
    } catch (error) {
      alert('Erreur lors de la suppression')
    } finally {
      setLoadingId(null)
      setActionType(null)
    }
  }

  const handleReindex = async (doc: KnowledgeBaseDocumentData) => {
    setLoadingId(doc.id)
    setActionType('index')

    try {
      const result = await indexKnowledgeDocumentAction(doc.id)
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
        onRefresh?.()
      }
    } catch (error) {
      alert('Erreur lors de l\'indexation')
    } finally {
      setLoadingId(null)
      setActionType(null)
    }
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Aucun document
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          La base de connaissances est vide. Ajoutez des documents de référence.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Recherche */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Filtre catégorie */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}
            className="text-sm border rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Toutes catégories</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>

        {/* Filtre langue */}
        <select
          value={filterLanguage}
          onChange={(e) => setFilterLanguage(e.target.value as typeof filterLanguage)}
          className="text-sm border rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Toutes langues</option>
          {Object.entries(LANGUAGE_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {config.flag} {config.label}
            </option>
          ))}
        </select>

        {/* Filtre indexation */}
        <select
          value={filterIndexed}
          onChange={(e) => setFilterIndexed(e.target.value as typeof filterIndexed)}
          className="text-sm border rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Tous statuts</option>
          <option value="yes">Indexés</option>
          <option value="no">Non indexés</option>
        </select>
      </div>

      {/* Compteur */}
      <p className="text-sm text-muted-foreground">
        {filteredDocuments.length} document{filteredDocuments.length > 1 ? 's' : ''} sur {total}
      </p>

      {/* Liste */}
      <div className="space-y-2">
        {filteredDocuments.map((doc) => {
          const categoryConfig = CATEGORY_CONFIG[doc.category]
          const CategoryIcon = categoryConfig.icon
          const isLoading = loadingId === doc.id

          return (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              {/* Icône catégorie */}
              <div className={`p-2 rounded-lg ${categoryConfig.color}`}>
                <CategoryIcon className="h-5 w-5" />
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{doc.title}</h3>
                  <span className="text-base" title={LANGUAGE_CONFIG[doc.language || 'ar'].label}>
                    {LANGUAGE_CONFIG[doc.language || 'ar'].flag}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {categoryConfig.label}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    {doc.isIndexed ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        Indexé
                      </>
                    ) : (
                      <>
                        <Clock className="h-3.5 w-3.5 text-orange-500" />
                        Non indexé
                      </>
                    )}
                  </span>
                  {doc.chunkCount !== undefined && doc.chunkCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{doc.chunkCount} chunks</span>
                    </>
                  )}
                  <span>•</span>
                  <span>Ajouté le {formatDate(doc.createdAt)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Réindexer */}
                <button
                  onClick={() => handleReindex(doc)}
                  disabled={isLoading}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                  title={doc.isIndexed ? 'Réindexer' : 'Indexer'}
                >
                  {isLoading && actionType === 'index' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>

                {/* Supprimer */}
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={isLoading}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  title="Supprimer"
                >
                  {isLoading && actionType === 'delete' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {filteredDocuments.length === 0 && documents.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Aucun document ne correspond aux filtres
        </div>
      )}
    </div>
  )
}
