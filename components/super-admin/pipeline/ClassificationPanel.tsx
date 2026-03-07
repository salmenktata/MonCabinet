'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'
import { ALL_DOC_TYPES, DOC_TYPE_TRANSLATIONS, type DocumentType } from '@/lib/categories/doc-types'

const CATEGORIES = getCategoriesForContext('knowledge_base').map(c => c.value)

const DOC_TYPE_COLORS: Record<string, string> = {
  TEXTES: 'bg-blue-100 text-blue-800 border-blue-200',
  JURIS: 'bg-red-100 text-red-800 border-red-200',
  PROC: 'bg-green-100 text-green-800 border-green-200',
  TEMPLATES: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  DOCTRINE: 'bg-gray-100 text-gray-700 border-gray-200',
}

interface ClassificationPanelProps {
  document: {
    id: string
    category: string
    subcategory: string | null
    tags: string[]
    metadata: Record<string, unknown>
  }
  onSave: (updates: { category?: string; subcategory?: string | null; tags?: string[] }) => Promise<void>
  onReplay: () => Promise<void>
  isLoading: boolean
}

export function ClassificationPanel({ document, onSave, onReplay, isLoading }: ClassificationPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [category, setCategory] = useState(document.category)
  const [subcategory, setSubcategory] = useState(document.subcategory || '')
  const [tagsInput, setTagsInput] = useState((document.tags || []).join(', '))
  const [docType, setDocType] = useState((document.metadata?.doc_type as string) || '')

  const metadata = document.metadata || {}
  const classificationSource = metadata.classification_source as string
  const classificationConfidence = metadata.classification_confidence as number

  const handleSave = async () => {
    const updates: Record<string, unknown> = {}
    if (category !== document.category) updates.category = category
    if (subcategory !== (document.subcategory || '')) updates.subcategory = subcategory || null
    const newTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    if (JSON.stringify(newTags) !== JSON.stringify(document.tags || [])) updates.tags = newTags
    if (Object.keys(updates).length > 0) {
      await onSave(updates as any)
    }
    // doc_type override : appel PATCH séparé si modifié
    if (docType && docType !== (document.metadata?.doc_type as string || '')) {
      await fetch(`/api/admin/knowledge-base/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType }),
      })
    }
    setIsEditing(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Classification</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReplay} disabled={isLoading}>
            <Icons.refresh className="h-4 w-4 mr-1" />
            Re-classifier (LLM)
          </Button>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Icons.edit className="h-4 w-4 mr-1" />
              Modifier
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={handleSave} disabled={isLoading}>
                <Icons.save className="h-4 w-4 mr-1" />
                Enregistrer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Annuler
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Classification source */}
      {classificationSource && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Source:</span>
          <Badge variant={classificationSource === 'ai' ? 'default' : 'secondary'}>
            {classificationSource === 'ai' ? 'IA' : classificationSource === 'url_pattern' ? 'URL Pattern' : 'Par défaut'}
          </Badge>
          {classificationConfidence !== undefined && classificationConfidence !== null && (
            <span className="text-muted-foreground">
              Confiance: {Math.round(classificationConfidence * 100)}%
            </span>
          )}
          {!!metadata.needs_review && (
            <Badge variant="destructive">Révision requise</Badge>
          )}
        </div>
      )}

      {/* Category */}
      <div>
        <label className="text-sm font-medium">Catégorie</label>
        {isEditing ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <p className="mt-1">
            <Badge variant="outline">{document.category}</Badge>
          </p>
        )}
      </div>

      {/* Doc type */}
      <div>
        <label className="text-sm font-medium">Type de document</label>
        {isEditing ? (
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— Auto (depuis catégorie) —</option>
            {ALL_DOC_TYPES.map(dt => (
              <option key={dt} value={dt}>
                {dt} — {DOC_TYPE_TRANSLATIONS[dt as DocumentType]?.fr}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1">
            {docType ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${DOC_TYPE_COLORS[docType] || 'bg-gray-100 text-gray-700'}`}>
                {docType}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Auto</span>
            )}
          </p>
        )}
      </div>

      {/* Subcategory */}
      <div>
        <label className="text-sm font-medium">Sous-catégorie</label>
        {isEditing ? (
          <input
            type="text"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ex: droit commercial, droit pénal..."
          />
        ) : (
          <p className="mt-1 text-sm">{document.subcategory || <span className="text-muted-foreground">Non défini</span>}</p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="text-sm font-medium">Tags</label>
        {isEditing ? (
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="tag1, tag2, tag3..."
          />
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {(document.tags || []).length > 0 ? (
              document.tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Aucun tag</span>
            )}
          </div>
        )}
      </div>

      {/* Metadata structured */}
      {Object.keys(metadata).filter(k => !['classification_source', 'classification_confidence', 'classification_signals', 'needs_review', 'source', 'sourceId', 'sourceName', 'pageId', 'url', 'crawledAt'].includes(k)).length > 0 && (
        <div>
          <label className="text-sm font-medium">Métadonnées</label>
          <pre className="mt-1 rounded-md border bg-muted p-3 text-xs overflow-auto max-h-48">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(metadata).filter(([k]) => !['classification_source', 'classification_confidence', 'classification_signals', 'needs_review', 'source', 'sourceId', 'sourceName', 'pageId', 'url', 'crawledAt'].includes(k))
              ),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  )
}
