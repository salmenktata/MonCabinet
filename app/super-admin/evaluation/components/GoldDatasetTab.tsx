'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  Save,
  X,
  Search,
  BookOpen,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface GoldCase {
  id: string
  domain: string
  difficulty: string
  intentType: string
  question: string
  expectedAnswer: {
    keyPoints: string[]
    mandatoryCitations: string[]
  }
  expectedArticles: string[]
  goldChunkIds: string[]
  goldDocumentIds: string[]
  minRecallAt5: number | null
  notes: string | null
}

interface GoldStats {
  total: number
  byDomain: Record<string, number>
  byDifficulty: Record<string, number>
  byIntentType: Record<string, number>
}

interface ChunkPreview {
  id: string
  documentTitle: string
  documentId: string
  contentSnippet: string
  category: string | null
}

type EditForm = {
  domain: string
  difficulty: string
  intentType: string
  question: string
  keyPoints: string[]
  mandatoryCitations: string[]
  expectedArticles: string[]
  goldChunkIds: string[]
  goldDocumentIds: string[]
  minRecallAt5: string
  notes: string
}

const DOMAINS = [
  'droit_civil',
  'droit_penal',
  'droit_famille',
  'droit_travail',
  'droit_commercial',
  'droit_immobilier',
  'procedure',
  'droit_fiscal',
  'droit_administratif',
  'autre',
]

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']
const INTENT_TYPES = ['factual', 'citation_lookup', 'procedural', 'interpretive', 'comparative']

const DOMAIN_LABELS: Record<string, string> = {
  droit_civil: 'Civil',
  droit_penal: 'Pénal',
  droit_famille: 'Famille',
  droit_travail: 'Travail',
  droit_commercial: 'Commercial',
  droit_immobilier: 'Immobilier',
  procedure: 'Procédure',
  droit_fiscal: 'Fiscal',
  droit_administratif: 'Administratif',
  autre: 'Autre',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard: 'bg-orange-100 text-orange-800',
  expert: 'bg-red-100 text-red-800',
}

// =============================================================================
// SOUS-COMPOSANT : Éditeur de liste
// =============================================================================

function ArrayEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const addItem = () => onChange([...values, ''])
  const removeItem = (i: number) => onChange(values.filter((_, idx) => idx !== i))
  const updateItem = (i: number, v: string) =>
    onChange(values.map((item, idx) => (idx === i ? v : item)))

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1">
          <input
            type="text"
            value={v}
            onChange={e => updateItem(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="text-gray-400 hover:text-red-500 px-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Ajouter
      </button>
    </div>
  )
}

// =============================================================================
// SOUS-COMPOSANT : Sélecteur de chunks KB
// =============================================================================

function ChunkSelector({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ChunkPreview[]>([])
  const [previews, setPreviews] = useState<ChunkPreview[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Charger les aperçus des chunks déjà sélectionnés
  useEffect(() => {
    if (selected.length === 0) { setPreviews([]); return }
    fetch(`/api/admin/eval/gold/chunks?ids=${selected.join(',')}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPreviews(data) })
      .catch(() => {})
  }, [selected.join(',')])

  // Recherche avec debounce
  useEffect(() => {
    if (!open || search.length < 2) { setResults([]); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/eval/gold/chunks?search=${encodeURIComponent(search)}&limit=15`)
        const data = await res.json()
        if (Array.isArray(data)) setResults(data)
      } catch {
        toast.error('Erreur recherche chunks')
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [search, open])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const removeChunk = (id: string) => onChange(selected.filter(s => s !== id))

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">
        Gold Chunk IDs ({selected.length})
      </label>

      {/* Chips des chunks sélectionnés */}
      {selected.length > 0 && (
        <div className="space-y-1">
          {selected.map(id => {
            const preview = previews.find(p => p.id === id)
            return (
              <div key={id} className="flex items-start gap-2 bg-blue-50 rounded px-2 py-1 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-gray-500 truncate">{id}</div>
                  {preview && (
                    <div className="text-gray-700 truncate">
                      <span className="font-medium">{preview.documentTitle}</span>
                      {' — '}
                      <span className="text-gray-500">{preview.contentSnippet.slice(0, 80)}…</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeChunk(id)}
                  className="text-gray-400 hover:text-red-500 shrink-0 mt-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Bouton ouvrir sélecteur */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
      >
        <BookOpen className="w-3 h-3" />
        {open ? 'Fermer le sélecteur' : 'Rechercher un chunk dans la KB'}
      </button>

      {/* Panneau de recherche */}
      {open && (
        <div className="border rounded-lg p-3 bg-white shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans le contenu ou titre du document…"
              className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            {searching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {results.map(chunk => {
                const isSelected = selected.includes(chunk.id)
                return (
                  <button
                    key={chunk.id}
                    type="button"
                    onClick={() => toggle(chunk.id)}
                    className={`w-full text-left px-2 py-2 rounded text-xs hover:bg-gray-50 flex items-start gap-2 ${isSelected ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'}`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />}
                    {!isSelected && <div className="w-3 h-3 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{chunk.documentTitle}</div>
                      <div className="text-gray-500 truncate">{chunk.contentSnippet.slice(0, 120)}…</div>
                      <div className="font-mono text-gray-400 text-[10px] truncate">{chunk.id}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {search.length >= 2 && !searching && results.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Aucun chunk trouvé</p>
          )}
          {search.length < 2 && (
            <p className="text-xs text-gray-400 text-center py-2">Saisissez au moins 2 caractères</p>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SOUS-COMPOSANT : Formulaire d'édition
// =============================================================================

function GoldCaseForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: EditForm
  onSave: (form: EditForm) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<EditForm>(initial)
  const set = (key: keyof EditForm, v: unknown) =>
    setForm(prev => ({ ...prev, [key]: v }))

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
      {/* Ligne 1 : domaine / difficulté / intent */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Domaine *</label>
          <select
            value={form.domain}
            onChange={e => set('domain', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1 mt-1"
          >
            {DOMAINS.map(d => (
              <option key={d} value={d}>{DOMAIN_LABELS[d] ?? d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Difficulté *</label>
          <select
            value={form.difficulty}
            onChange={e => set('difficulty', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1 mt-1"
          >
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Type d'intent *</label>
          <select
            value={form.intentType}
            onChange={e => set('intentType', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1 mt-1"
          >
            {INTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Question */}
      <div>
        <label className="text-xs font-medium text-gray-600">Question *</label>
        <textarea
          value={form.question}
          onChange={e => set('question', e.target.value)}
          rows={3}
          className="w-full text-sm border rounded px-2 py-1 mt-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Question juridique…"
          dir="auto"
        />
      </div>

      {/* Key points + Citations */}
      <div className="grid grid-cols-2 gap-4">
        <ArrayEditor
          label="Points clés attendus *"
          values={form.keyPoints}
          onChange={v => set('keyPoints', v)}
          placeholder="Point clé attendu dans la réponse…"
        />
        <ArrayEditor
          label="Citations obligatoires"
          values={form.mandatoryCitations}
          onChange={v => set('mandatoryCitations', v)}
          placeholder="ex: Article 402 COC"
        />
      </div>

      {/* Articles attendus */}
      <ArrayEditor
        label="Articles attendus (expectedArticles)"
        values={form.expectedArticles}
        onChange={v => set('expectedArticles', v)}
        placeholder="ex: art. 82 COC"
      />

      {/* Gold Chunk IDs */}
      <ChunkSelector
        selected={form.goldChunkIds}
        onChange={v => set('goldChunkIds', v)}
      />

      {/* minRecallAt5 + notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">
            Seuil min Recall@5 (optionnel)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={form.minRecallAt5}
            onChange={e => set('minRecallAt5', e.target.value)}
            className="w-full text-sm border rounded px-2 py-1 mt-1"
            placeholder="ex: 0.8"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Notes internes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            className="w-full text-sm border rounded px-2 py-1 mt-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Annotations, corrections, contexte…"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function GoldDatasetTab() {
  const [cases, setCases] = useState<GoldCase[]>([])
  const [stats, setStats] = useState<GoldStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Filtres
  const [filterDomain, setFilterDomain] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filterDomain) params.set('domain', filterDomain)
      if (filterDifficulty) params.set('difficulty', filterDifficulty)
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/admin/eval/gold?${params}`)
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      setCases(data.cases || [])
      setStats(data.stats || null)
    } catch {
      toast.error('Erreur chargement Gold Dataset')
    } finally {
      setLoading(false)
    }
  }, [filterDomain, filterDifficulty, searchQuery])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Debounce recherche texte
  const handleSearchInput = (v: string) => {
    setSearchInput(v)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => setSearchQuery(v), 400)
  }

  // --- Export JSON ---
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/admin/eval/gold?export=true')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'gold-eval-dataset.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export téléchargé')
    } catch {
      toast.error('Erreur export')
    } finally {
      setExporting(false)
    }
  }

  // --- Créer ---
  const emptyForm = (): EditForm => ({
    domain: 'droit_civil',
    difficulty: 'easy',
    intentType: 'factual',
    question: '',
    keyPoints: [''],
    mandatoryCitations: [],
    expectedArticles: [],
    goldChunkIds: [],
    goldDocumentIds: [],
    minRecallAt5: '',
    notes: '',
  })

  const handleCreate = async (form: EditForm) => {
    setSavingId('__new__')
    try {
      const res = await fetch('/api/admin/eval/gold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: form.domain,
          difficulty: form.difficulty,
          intentType: form.intentType,
          question: form.question,
          keyPoints: form.keyPoints.filter(Boolean),
          mandatoryCitations: form.mandatoryCitations.filter(Boolean),
          expectedArticles: form.expectedArticles.filter(Boolean),
          goldChunkIds: form.goldChunkIds,
          goldDocumentIds: form.goldDocumentIds,
          minRecallAt5: form.minRecallAt5 ? parseFloat(form.minRecallAt5) : null,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur création')
      }
      toast.success('Question créée')
      setShowCreateForm(false)
      fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur création')
    } finally {
      setSavingId(null)
    }
  }

  // --- Modifier ---
  const caseToForm = (c: GoldCase): EditForm => ({
    domain: c.domain,
    difficulty: c.difficulty,
    intentType: c.intentType,
    question: c.question,
    keyPoints: c.expectedAnswer.keyPoints.length > 0 ? c.expectedAnswer.keyPoints : [''],
    mandatoryCitations: c.expectedAnswer.mandatoryCitations,
    expectedArticles: c.expectedArticles,
    goldChunkIds: c.goldChunkIds,
    goldDocumentIds: c.goldDocumentIds,
    minRecallAt5: c.minRecallAt5 !== null ? String(c.minRecallAt5) : '',
    notes: c.notes ?? '',
  })

  const handleUpdate = async (id: string, form: EditForm) => {
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/eval/gold?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: form.domain,
          difficulty: form.difficulty,
          intentType: form.intentType,
          question: form.question,
          keyPoints: form.keyPoints.filter(Boolean),
          mandatoryCitations: form.mandatoryCitations.filter(Boolean),
          expectedArticles: form.expectedArticles.filter(Boolean),
          goldChunkIds: form.goldChunkIds,
          goldDocumentIds: form.goldDocumentIds,
          minRecallAt5: form.minRecallAt5 ? parseFloat(form.minRecallAt5) : null,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur modification')
      }
      toast.success('Question mise à jour')
      setEditingId(null)
      fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur modification')
    } finally {
      setSavingId(null)
    }
  }

  // --- Supprimer ---
  const handleDelete = async (id: string) => {
    if (!confirm(`Supprimer la question "${id}" ? Cette action est irréversible.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/eval/gold?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur suppression')
      toast.success('Question supprimée')
      fetchData()
    } catch {
      toast.error('Erreur suppression')
    } finally {
      setDeletingId(null)
    }
  }

  // =============================================================================
  // RENDU
  // =============================================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Gold Eval Dataset</h3>
          <p className="text-sm text-gray-500">
            Questions de référence pour l'évaluation du RAG —{' '}
            <span className="font-medium">{stats?.total ?? '…'} questions</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => { setShowCreateForm(v => !v); setEditingId(null) }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle question
          </Button>
        </div>
      </div>

      {/* Stats par domaine */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byDomain)
            .sort((a, b) => b[1] - a[1])
            .map(([domain, count]) => (
              <button
                key={domain}
                onClick={() => setFilterDomain(filterDomain === domain ? '' : domain)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  filterDomain === domain
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {DOMAIN_LABELS[domain] ?? domain} ({count})
              </button>
            ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Rechercher…"
            className="pl-7 pr-3 py-1 text-sm border rounded w-52 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <select
          value={filterDifficulty}
          onChange={e => setFilterDifficulty(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="">Toutes difficultés</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(filterDomain || filterDifficulty || searchQuery) && (
          <button
            onClick={() => {
              setFilterDomain('')
              setFilterDifficulty('')
              setSearchQuery('')
              setSearchInput('')
            }}
            className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Réinitialiser filtres
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      {showCreateForm && (
        <GoldCaseForm
          initial={emptyForm()}
          onSave={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          saving={savingId === '__new__'}
        />
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400 text-sm">
            {filterDomain || filterDifficulty || searchQuery
              ? 'Aucune question ne correspond aux filtres'
              : 'Dataset vide — lancez le script seed pour importer le JSON existant'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Ligne principale */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    if (editingId === c.id) return
                    setExpandedId(expandedId === c.id ? null : c.id)
                  }}
                >
                  {expandedId === c.id
                    ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  }
                  <code className="text-xs text-gray-400 w-36 shrink-0 truncate">{c.id}</code>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {DOMAIN_LABELS[c.domain] ?? c.domain}
                  </Badge>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${DIFFICULTY_COLORS[c.difficulty] ?? 'bg-gray-100 text-gray-700'}`}>
                    {c.difficulty}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{c.intentType}</span>
                  <p className="text-sm text-gray-700 flex-1 truncate" dir="auto">{c.question}</p>
                  <span className="text-xs text-gray-400 shrink-0">
                    {c.expectedAnswer.keyPoints.length} pts · {c.goldChunkIds.length} chunks
                  </span>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditingId(editingId === c.id ? null : c.id)
                        setExpandedId(c.id)
                      }}
                      className="p-1 text-gray-400 hover:text-blue-500 rounded"
                      title="Modifier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Supprimer"
                    >
                      {deletingId === c.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                </div>

                {/* Zone expandée */}
                {expandedId === c.id && (
                  <div className="border-t px-4 py-3">
                    {editingId === c.id ? (
                      <GoldCaseForm
                        initial={caseToForm(c)}
                        onSave={form => handleUpdate(c.id, form)}
                        onCancel={() => setEditingId(null)}
                        saving={savingId === c.id}
                      />
                    ) : (
                      <div className="space-y-3 text-sm">
                        {/* Question complète */}
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Question</span>
                          <p className="mt-1 text-gray-800" dir="auto">{c.question}</p>
                        </div>

                        {/* Key points */}
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Points clés attendus ({c.expectedAnswer.keyPoints.length})
                          </span>
                          <ul className="mt-1 space-y-1">
                            {c.expectedAnswer.keyPoints.map((kp, i) => (
                              <li key={i} className="text-gray-700 flex gap-2">
                                <span className="text-gray-400 shrink-0">{i + 1}.</span>
                                <span dir="auto">{kp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Citations */}
                        {c.expectedAnswer.mandatoryCitations.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Citations obligatoires</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.expectedAnswer.mandatoryCitations.map((cit, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{cit}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Chunks */}
                        {c.goldChunkIds.length > 0 && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Gold Chunk IDs ({c.goldChunkIds.length})
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.goldChunkIds.map(id => (
                                <code key={id} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{id.slice(0, 8)}…</code>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {c.notes && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</span>
                            <p className="mt-1 text-gray-500 text-xs">{c.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
