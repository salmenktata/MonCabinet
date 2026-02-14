'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { updateCabinetInfoAction } from '@/app/actions/cabinet'

interface CabinetFormProps {
  profile: any
}

export default function CabinetForm({ profile }: CabinetFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(profile?.logo_url || null)

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Vérifier le type de fichier
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      setError('Format de fichier non supporté. Utilisez PNG, JPG ou SVG.')
      return
    }

    // Vérifier la taille (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Le fichier est trop volumineux. Taille maximum : 2MB.')
      return
    }

    setLogoFile(file)
    setError('')

    // Créer une preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const formData = new FormData(e.currentTarget)

    // Ajouter le fichier logo si présent
    if (logoFile) {
      formData.append('logo', logoFile)
    }

    const result = await updateCabinetInfoAction(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess('✅ Informations cabinet mises à jour avec succès')
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo Cabinet */}
      <div>
        <label className="block text-sm font-medium mb-2">Logo du Cabinet</label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="flex-shrink-0">
            {logoPreview ? (
              <div className="relative w-32 h-32 rounded-lg border-2 border-dashed border-border overflow-hidden bg-muted">
                <Image
                  src={logoPreview}
                  alt="Logo cabinet"
                  fill
                  className="object-contain p-2"
                />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted">
                <svg
                  className="h-12 w-12 text-muted-foreground/80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Upload */}
          <div className="flex-1">
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleLogoChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              PNG, JPG ou SVG. Maximum 2MB. Dimensions recommandées : 400x200px
            </p>
          </div>
        </div>
      </div>

      {/* Nom Cabinet */}
      <div>
        <label htmlFor="cabinet_nom" className="block text-sm font-medium mb-2">
          Nom du Cabinet
        </label>
        <input
          type="text"
          id="cabinet_nom"
          name="cabinet_nom"
          defaultValue={profile?.cabinet_nom || ''}
          placeholder="Cabinet Maître Dupont"
          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Nom officiel qui apparaîtra sur les factures (optionnel)
        </p>
      </div>

      {/* Adresse Cabinet */}
      <div>
        <label htmlFor="cabinet_adresse" className="block text-sm font-medium mb-2">
          Adresse
        </label>
        <input
          type="text"
          id="cabinet_adresse"
          name="cabinet_adresse"
          defaultValue={profile?.cabinet_adresse || ''}
          placeholder="123 Avenue Habib Bourguiba"
          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Ville et Code Postal */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="cabinet_code_postal" className="block text-sm font-medium mb-2">
            Code Postal
          </label>
          <input
            type="text"
            id="cabinet_code_postal"
            name="cabinet_code_postal"
            defaultValue={profile?.cabinet_code_postal || ''}
            placeholder="1000"
            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="cabinet_ville" className="block text-sm font-medium mb-2">
            Ville
          </label>
          <input
            type="text"
            id="cabinet_ville"
            name="cabinet_ville"
            defaultValue={profile?.cabinet_ville || ''}
            placeholder="Tunis"
            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Numéro RNE */}
      <div>
        <label htmlFor="rne" className="block text-sm font-medium mb-2">
          Numéro RNE (Registre National des Entreprises)
        </label>
        <input
          type="text"
          id="rne"
          name="rne"
          defaultValue={profile?.rne || ''}
          placeholder="Ex: B123456789"
          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Optionnel - Requis pour certains clients professionnels
        </p>
      </div>

      {/* Informations Avocat (rappel) */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Informations Avocat (ONAT)</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Matricule Avocat</label>
            <input
              type="text"
              defaultValue={profile?.matricule_avocat || ''}
              disabled
              className="w-full px-3 py-2 border border-border rounded-md bg-muted cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Barreau</label>
            <input
              type="text"
              defaultValue={profile?.barreau || ''}
              disabled
              className="w-full px-3 py-2 border border-border rounded-md bg-muted cursor-not-allowed"
            />
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Pour modifier ces informations, contactez le support ou mettez à jour votre profil
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">{success}</div>
      )}

      {/* Boutons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-6 py-2 border border-border rounded-md hover:bg-muted disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
