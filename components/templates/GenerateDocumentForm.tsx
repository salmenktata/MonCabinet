'use client'

import { useState } from 'react'
import { generateDocumentAction } from '@/app/actions/templates'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, Check, AlertCircle, Eye, EyeOff, Download, FileText } from 'lucide-react'
import TemplatePreview from './TemplatePreview'

interface GenerationSuggestion {
  field: string
  suggestion: string
  confidence: number
  source?: string
}

interface GenerateDocumentFormProps {
  template: any
  dossiers: any[]
}

export default function GenerateDocumentForm({ template, dossiers }: GenerateDocumentFormProps) {
  const [loading, setLoading] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [loadingDocx, setLoadingDocx] = useState(false)
  const [error, setError] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [selectedDossier, setSelectedDossier] = useState<any>(null)
  const [variablesValues, setVariablesValues] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<GenerationSuggestion[]>([])
  const [aiError, setAiError] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  const variables = Array.isArray(template.variables) ? template.variables : []

  // Télécharger en DOCX
  const handleDownloadDocx = async () => {
    if (!selectedDossier) {
      setError('Veuillez sélectionner un dossier')
      return
    }

    setLoadingDocx(true)
    setError('')

    try {
      const response = await fetch(`/api/templates/${template.id}/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variables: variablesValues,
          dossierId: selectedDossier.id,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erreur lors de la génération DOCX')
      }

      // Télécharger le fichier
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      // Extraire le nom du fichier du header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `${template.titre}.docx`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/)
        if (match) filename = decodeURIComponent(match[1])
      }

      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setLoadingDocx(false)
    }
  }

  // Quand un dossier est sélectionné, pré-remplir les variables
  const handleDossierChange = (dossierId: string) => {
    const dossier = dossiers.find((d) => d.id === dossierId)
    setSelectedDossier(dossier)
    setSuggestions([])
    setAiError('')

    if (dossier && dossier.clients) {
      const client = dossier.clients
      const newValues: Record<string, string> = {}

      // Pré-remplir les variables communes
      variables.forEach((v: string) => {
        if (v === 'client.nom') newValues[v] = client.nom || ''
        else if (v === 'client.prenom') newValues[v] = client.prenom || ''
        else if (v === 'client.cin') newValues[v] = client.cin || ''
        else if (v === 'client.adresse') newValues[v] = client.adresse || ''
        else if (v === 'client.email') newValues[v] = client.email || ''
        else if (v === 'client.telephone') newValues[v] = client.telephone || ''
        else if (v === 'client.civilite')
          newValues[v] = client.type_client === 'PERSONNE_PHYSIQUE' ? 'M./Mme' : ''
        else if (v === 'numero') newValues[v] = dossier.numero || ''
        else if (v === 'tribunal') newValues[v] = dossier.tribunal || ''
        else if (v === 'objet') newValues[v] = dossier.objet || ''
        else if (v === 'date')
          newValues[v] = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        else if (v === 'annee') newValues[v] = new Date().getFullYear().toString()
        else newValues[v] = variablesValues[v] || ''
      })

      setVariablesValues(newValues)
    }
  }

  const handleVariableChange = (variable: string, value: string) => {
    setVariablesValues((prev) => ({ ...prev, [variable]: value }))
  }

  // Obtenir les suggestions IA
  const handleGetAISuggestions = async () => {
    if (!selectedDossier) {
      setAiError('Veuillez d\'abord sélectionner un dossier')
      return
    }

    setLoadingAI(true)
    setAiError('')
    setSuggestions([])

    try {
      const response = await fetch(`/api/templates/${template.id}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossierId: selectedDossier.id,
          existingVariables: variablesValues,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la récupération des suggestions')
      }

      setSuggestions(data.suggestions || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setAiError(message)
    } finally {
      setLoadingAI(false)
    }
  }

  // Appliquer une suggestion
  const applySuggestion = (field: string, suggestion: string) => {
    setVariablesValues((prev) => ({ ...prev, [field]: suggestion }))
    setSuggestions((prev) => prev.filter((s) => s.field !== field))
  }

  // Appliquer toutes les suggestions
  const applyAllSuggestions = () => {
    const newValues = { ...variablesValues }
    suggestions.forEach((s) => {
      if (s.suggestion && s.suggestion !== 'À compléter') {
        newValues[s.field] = s.suggestion
      }
    })
    setVariablesValues(newValues)
    setSuggestions([])
  }

  const handleGenerate = async () => {
    if (!selectedDossier) {
      setError('Veuillez sélectionner un dossier')
      return
    }

    setLoading(true)
    setError('')

    const result = await generateDocumentAction({
      template_id: template.id,
      dossier_id: selectedDossier.id,
      variables_values: variablesValues,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.success) {
      setGeneratedContent(result.contenu)

      if (result.variables_manquantes && result.variables_manquantes.length > 0) {
        setError(
          `Variables non remplies : ${result.variables_manquantes.join(', ')}`
        )
      }
    }

    setLoading(false)
  }

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent)
    alert('Document copié dans le presse-papiers !')
  }

  const handleDownloadTxt = () => {
    const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${template.titre} - ${selectedDossier?.numero || 'document'}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const getSuggestionForField = (field: string) => {
    return suggestions.find((s) => s.field === field)
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec toggle preview */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Générer un document</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className="gap-2"
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPreview ? 'Masquer aperçu' : 'Afficher aperçu'}
        </Button>
      </div>

      {/* Layout principal : formulaire + preview */}
      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Colonne gauche : Formulaire */}
        <div className="space-y-6">
          {/* Sélection du dossier */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-base font-semibold text-foreground mb-4">1. Sélectionner un dossier</h3>

            {dossiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun dossier disponible. Créez d&apos;abord un dossier.
              </p>
            ) : (
              <select
                value={selectedDossier?.id || ''}
                onChange={(e) => handleDossierChange(e.target.value)}
                className="block w-full rounded-md border border-input px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-background"
              >
                <option value="">-- Sélectionnez un dossier --</option>
                {dossiers.map((dossier) => (
                  <option key={dossier.id} value={dossier.id}>
                    {dossier.numero} -{' '}
                    {dossier.clients?.type_client === 'PERSONNE_PHYSIQUE'
                      ? `${dossier.clients.nom} ${dossier.clients.prenom || ''}`.trim()
                      : dossier.clients?.nom}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Remplissage des variables */}
          {selectedDossier && variables.length > 0 && (
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">
                  2. Remplir les variables ({variables.length})
                </h3>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGetAISuggestions}
                  disabled={loadingAI}
                  className="gap-2"
                >
                  {loadingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {loadingAI ? 'Analyse...' : 'Suggestions IA'}
                </Button>
              </div>

              {aiError && (
                <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {aiError}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="mb-4 p-3 rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={applyAllSuggestions}
                      className="text-indigo-700 dark:text-indigo-300"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Tout appliquer
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {variables.map((variable: string) => {
                  const suggestion = getSuggestionForField(variable)

                  return (
                    <div key={variable} className="space-y-1">
                      <label className="block text-sm font-medium text-foreground">
                        {variable}
                      </label>
                      <input
                        type="text"
                        value={variablesValues[variable] || ''}
                        onChange={(e) => handleVariableChange(variable, e.target.value)}
                        className="block w-full rounded-md border border-input px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-background"
                        placeholder={`{{${variable}}}`}
                      />

                      {suggestion && suggestion.suggestion !== 'À compléter' && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => applySuggestion(variable, suggestion.suggestion)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded"
                          >
                            <Sparkles className="h-3 w-3" />
                            {suggestion.suggestion.substring(0, 25)}
                            {suggestion.suggestion.length > 25 ? '...' : ''}
                          </button>
                          <Badge variant="secondary" className="text-[10px]">
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Boutons d'action */}
          {selectedDossier && (
            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={handleGenerate} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {loading ? 'Génération...' : 'Générer'}
              </Button>

              <Button variant="outline" onClick={handleDownloadDocx} disabled={loadingDocx} className="gap-2">
                {loadingDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {loadingDocx ? 'Export...' : 'Télécharger DOCX'}
              </Button>
            </div>
          )}

          {/* Message d'erreur */}
          {error && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Document généré */}
          {generatedContent && (
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Document généré</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                    Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadTxt}>
                    .txt
                  </Button>
                </div>
              </div>

              <div className="rounded-md bg-muted p-4 max-h-[300px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">
                  {generatedContent}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite : Prévisualisation en temps réel */}
        {showPreview && (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden h-[700px] lg:sticky lg:top-4">
            <TemplatePreview
              content={template.contenu}
              variables={variablesValues}
              title={template.titre}
              language={template.langue}
              showMissingVariables={true}
            />
          </div>
        )}
      </div>
    </div>
  )
}
