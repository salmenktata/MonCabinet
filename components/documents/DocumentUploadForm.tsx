'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { uploadDocumentAction } from '@/app/actions/documents'

interface DocumentUploadFormProps {
  dossierId: string
  onSuccess?: () => void
}

export default function DocumentUploadForm({ dossierId, onSuccess }: DocumentUploadFormProps) {
  const router = useRouter()
  const t = useTranslations('documents')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [categorie, setCategorie] = useState('')
  const [description, setDescription] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Vérifier la taille (max 50 MB)
      if (file.size > 50 * 1024 * 1024) {
        setError(t('fileTooLarge'))
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
      setError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedFile) {
      setError(t('pleaseSelectFile'))
      return
    }

    setLoading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('dossier_id', dossierId)
    if (categorie) formData.append('categorie', categorie)
    if (description) formData.append('description', description)

    const result = await uploadDocumentAction(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Réinitialiser le formulaire
    setSelectedFile(null)
    setCategorie('')
    setDescription('')
    setLoading(false)

    if (onSuccess) {
      onSuccess()
    } else {
      router.refresh()
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Sélection fichier */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('fileRequired')}
        </label>
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {selectedFile ? (
                <>
                  <svg
                    className="w-8 h-8 mb-2 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                </>
              ) : (
                <>
                  <svg
                    className="w-8 h-8 mb-2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold">{t('clickToUpload')}</span> {t('dragAndDrop')}
                  </p>
                  <p className="text-xs text-gray-500">{t('supportedFormats')}</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
            />
          </label>
        </div>
      </div>

      {/* Catégorie */}
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('category')}</label>
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="">{t('selectCategory')}</option>
          <option value="contrat">{t('categories.contrat')}</option>
          <option value="jugement">{t('categories.jugement')}</option>
          <option value="correspondance">{t('categories.correspondance')}</option>
          <option value="piece">{t('categories.piece')}</option>
          <option value="autre">{t('categories.autre')}</option>
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('descriptionPlaceholder')}
        />
      </div>

      {/* Bouton */}
      <button
        type="submit"
        disabled={loading || !selectedFile}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? `⏳ ${t('uploading')}` : `📤 ${t('uploadDocument')}`}
      </button>
    </form>
  )
}
