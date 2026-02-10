'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { uploadKnowledgeDocumentAction } from '@/app/actions/knowledge-base'
import type { KnowledgeCategory } from '@/lib/categories/legal-categories'

// Utiliser le type du système centralisé
export type KnowledgeBaseCategory = KnowledgeCategory
export type KnowledgeBaseLanguage = 'ar' | 'fr'

interface KnowledgeBaseUploadFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

const CATEGORY_OPTIONS: { value: KnowledgeBaseCategory; label: string; description: string }[] = [
  {
    value: 'jurisprudence',
    label: 'Jurisprudence',
    description: 'Décisions de justice, arrêts',
  },
  {
    value: 'codes',
    label: 'Codes juridiques',
    description: 'Codes, lois, textes réglementaires',
  },
  {
    value: 'doctrine',
    label: 'Doctrine',
    description: 'Articles, commentaires, études',
  },
  {
    value: 'modeles',
    label: 'Modèles de documents',
    description: 'Templates, modèles types',
  },
  {
    value: 'autre',
    label: 'Autre',
    description: 'Autres documents de référence',
  },
]

const LANGUAGE_OPTIONS: { value: KnowledgeBaseLanguage; label: string; flag: string }[] = [
  { value: 'ar', label: 'العربية (Arabe)', flag: '🇹🇳' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
]

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.txt'

export default function KnowledgeBaseUploadForm({
  onSuccess,
  onCancel,
}: KnowledgeBaseUploadFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [category, setCategory] = useState<KnowledgeBaseCategory | ''>('')
  const [language, setLanguage] = useState<KnowledgeBaseLanguage>('ar')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [autoIndex, setAutoIndex] = useState(true)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      validateAndSetFile(droppedFile)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      validateAndSetFile(selectedFile)
    }
  }

  const validateAndSetFile = (selectedFile: File) => {
    setError('')

    // Vérifier le type
    if (!ACCEPTED_TYPES.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|docx|doc|txt)$/i)) {
      setError('Format non supporté. Utilisez PDF, DOCX, DOC ou TXT.')
      return
    }

    // Vérifier la taille (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('Fichier trop volumineux. Taille maximum : 50MB.')
      return
    }

    setFile(selectedFile)

    // Auto-remplir le titre si vide
    if (!title) {
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '') // Enlever extension
      setTitle(fileName)
    }
  }

  const removeFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validation
    if (!category) {
      setError('Veuillez sélectionner une catégorie')
      return
    }

    if (!title.trim()) {
      setError('Veuillez saisir un titre')
      return
    }

    if (!file) {
      setError('Veuillez sélectionner un fichier')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('category', category)
      formData.append('language', language)
      formData.append('title', title.trim())
      formData.append('description', description.trim())
      formData.append('file', file)
      formData.append('autoIndex', autoIndex.toString())

      const result = await uploadKnowledgeDocumentAction(formData)

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setSuccess('Document ajouté avec succès')
      router.refresh()

      // Reset form
      setCategory('')
      setTitle('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      if (onSuccess) {
        setTimeout(onSuccess, 1000)
      }
    } catch (err) {
      setError('Erreur lors de l\'upload')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Catégorie et Langue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Catégorie */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Catégorie <span className="text-red-500">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KnowledgeBaseCategory)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          >
            <option value="">Sélectionner...</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Langue */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Langue <span className="text-red-500">*</span>
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as KnowledgeBaseLanguage)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.flag} {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Titre */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Code des Obligations et Contrats (COC)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description optionnelle du document..."
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Zone de drop fichier */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Fichier (PDF, DOCX, TXT) <span className="text-red-500">*</span>
        </label>

        {!file ? (
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Glissez un fichier ici ou{' '}
              <span className="text-primary font-medium">cliquez pour parcourir</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PDF, DOCX, DOC, TXT (max 50MB)
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-gray-50">
            <FileText className="h-10 w-10 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={removeFile}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        )}
      </div>

      {/* Option auto-index */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoIndex"
          checked={autoIndex}
          onChange={(e) => setAutoIndex(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="autoIndex" className="text-sm">
          Indexer automatiquement pour la recherche sémantique
        </label>
      </div>

      {/* Boutons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !category || !title || !file}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Upload en cours...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Ajouter le document
            </>
          )}
        </button>
      </div>
    </form>
  )
}
