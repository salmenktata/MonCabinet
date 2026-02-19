'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategorySelector } from './CategorySelector'
import { TagsInput, SUGGESTED_TAGS } from './TagsInput'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

interface FileEntry {
  id: string
  file: File
  title: string
}

interface KnowledgeBaseBulkUploadProps {
  onComplete?: () => void
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt']

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function fileNameToTitle(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function KnowledgeBaseBulkUpload({ onComplete }: KnowledgeBaseBulkUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<FileEntry[]>([])
  const [defaultCategory, setDefaultCategory] = useState<KnowledgeCategory>('legislation')
  const [defaultSubcategory, setDefaultSubcategory] = useState<string | null>(null)
  const [defaultLanguage, setDefaultLanguage] = useState('ar')
  const [defaultTags, setDefaultTags] = useState<string[]>([])
  const [autoIndex, setAutoIndex] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted: FileEntry[] = []
    const rejected: string[] = []

    Array.from(newFiles).forEach((file) => {
      if (isAcceptedFile(file)) {
        accepted.push({
          id: generateId(),
          file,
          title: fileNameToTitle(file.name),
        })
      } else {
        rejected.push(file.name)
      }
    })

    if (rejected.length > 0) {
      toast.error(`Fichiers ignorés — ${rejected.length} fichier(s) non supporté(s): ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '...' : ''}`)
    }

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted])
    }
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const updateFileTitle = useCallback((id: string, title: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, title } : f))
    )
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files)
      }
      // Reset input so same files can be re-selected
      e.target.value = ''
    },
    [addFiles]
  )

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error('Veuillez sélectionner au moins un fichier.')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      const formData = new FormData()

      files.forEach((entry, index) => {
        formData.append(`files`, entry.file)
        formData.append(`titles`, entry.title)
      })

      formData.set('category', defaultCategory)
      if (defaultSubcategory) {
        formData.set('subcategory', defaultSubcategory)
      }
      formData.set('language', defaultLanguage)
      formData.set('autoIndex', String(autoIndex))
      if (defaultTags.length > 0) {
        formData.set('tags', JSON.stringify(defaultTags))
      }

      const response = await fetch('/api/admin/knowledge-base/bulk', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(error.error || `Erreur ${response.status}`)
      }

      const result = await response.json()

      toast.success(`Import lancé — ${files.length} fichier(s) envoyé(s) pour traitement.${result.batchId ? ` Lot: ${result.batchId}` : ''}`)

      setFiles([])
      setProgress(100)
      onComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'upload.')
    } finally {
      setUploading(false)
    }
  }

  const totalSize = files.reduce((acc, f) => acc + f.file.size, 0)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Icons.upload className="h-5 w-5" />
          Import en masse
        </CardTitle>
        <CardDescription className="text-slate-400">
          Glissez-déposez plusieurs fichiers ou cliquez pour sélectionner. Formats acceptés: PDF, DOCX, DOC, TXT.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8
            border-2 border-dashed rounded-lg cursor-pointer transition-colors
            ${isDragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-600 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-900/70'
            }
          `}
        >
          <Icons.upload className={`h-10 w-10 ${isDragOver ? 'text-blue-400' : 'text-slate-400'}`} />
          <div className="text-center">
            <p className={`text-sm font-medium ${isDragOver ? 'text-blue-300' : 'text-slate-300'}`}>
              {isDragOver ? 'Déposez les fichiers ici' : 'Glissez-déposez vos fichiers ici'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ou cliquez pour parcourir - PDF, DOCX, DOC, TXT
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">
                {files.length} fichier(s) sélectionné(s)
                <span className="text-slate-400 ml-2">
                  ({(totalSize / 1024 / 1024).toFixed(2)} Mo)
                </span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFiles([])}
                className="text-slate-400 hover:text-red-400"
              >
                <Icons.trash className="h-4 w-4 mr-1" />
                Tout supprimer
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {files.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50"
                >
                  <Icons.fileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <Input
                    value={entry.title}
                    onChange={(e) => updateFileTitle(entry.id, e.target.value)}
                    className="flex-1 bg-slate-700 border-slate-600 text-white text-sm h-8"
                    placeholder="Titre du document"
                  />
                  <span className="text-xs text-slate-400 shrink-0 w-16 text-right">
                    {(entry.file.size / 1024).toFixed(0)} Ko
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(entry.id)}
                    className="text-slate-400 hover:text-red-400 h-8 w-8 p-0 shrink-0"
                  >
                    <Icons.x className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Default settings */}
        <div className="space-y-4 pt-4 border-t border-slate-700">
          <p className="text-sm font-medium text-slate-300">
            Paramètres par défaut pour tous les fichiers
          </p>

          {/* Category */}
          <CategorySelector
            category={defaultCategory}
            subcategory={defaultSubcategory}
            onCategoryChange={setDefaultCategory}
            onSubcategoryChange={setDefaultSubcategory}
          />

          {/* Language */}
          <div>
            <Label className="text-slate-300">Langue</Label>
            <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
              <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="ar" className="text-white hover:bg-slate-700">العربية (Arabe)</SelectItem>
                <SelectItem value="fr" className="text-white hover:bg-slate-700">Français</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <TagsInput
            tags={defaultTags}
            onChange={setDefaultTags}
            suggestions={SUGGESTED_TAGS}
            placeholder="Tags communs à tous les fichiers..."
            label="Tags par défaut"
          />

          {/* Auto-index */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-slate-300">Indexation automatique</Label>
              <p className="text-xs text-slate-400 mt-0.5">
                Indexer automatiquement les documents après l'upload
              </p>
            </div>
            <Switch
              checked={autoIndex}
              onCheckedChange={setAutoIndex}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-2 justify-end pt-4 border-t border-slate-700">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFiles([])
              setDefaultTags([])
            }}
            disabled={uploading}
            className="text-slate-400"
          >
            Réinitialiser
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || files.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {uploading ? (
              <>
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                Upload en cours...
              </>
            ) : (
              <>
                <Icons.upload className="h-4 w-4 mr-2" />
                Uploader {files.length > 0 ? `${files.length} fichier(s)` : ''}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
