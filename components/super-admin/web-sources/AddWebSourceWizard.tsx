'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface FormData {
  // Étape 1 - Informations de base
  name: string
  baseUrl: string
  description: string
  category: string
  language: string

  // Étape 2 - Configuration du crawl
  crawlFrequency: string
  maxDepth: number
  maxPages: number
  requiresJavascript: boolean
  downloadFiles: boolean
  useSitemap: boolean
  sitemapUrl: string
  respectRobotsTxt: boolean
  rateLimitMs: number

  // Étape 3 - Extraction
  contentSelector: string
  excludeSelectors: string
  urlPatterns: string
  excludedPatterns: string
}

const CATEGORIES = [
  { value: 'legislation', label: 'Législation' },
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'doctrine', label: 'Doctrine' },
  { value: 'jort', label: 'JORT' },
  { value: 'modeles', label: 'Modèles' },
  { value: 'procedures', label: 'Procédures' },
  { value: 'formulaires', label: 'Formulaires' },
  { value: 'autre', label: 'Autre' },
]

const FREQUENCIES = [
  { value: '1 hour', label: 'Toutes les heures' },
  { value: '6 hours', label: 'Toutes les 6 heures' },
  { value: '12 hours', label: 'Toutes les 12 heures' },
  { value: '24 hours', label: 'Quotidien' },
  { value: '7 days', label: 'Hebdomadaire' },
  { value: '30 days', label: 'Mensuel' },
]

export function AddWebSourceWizard() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    extraction?: {
      title: string
      contentPreview: string
      linksCount: number
      filesCount: number
    }
    error?: string
  } | null>(null)

  const [formData, setFormData] = useState<FormData>({
    name: '',
    baseUrl: '',
    description: '',
    category: 'legislation',
    language: 'fr',
    crawlFrequency: '24 hours',
    maxDepth: 3,
    maxPages: 200,
    requiresJavascript: false,
    downloadFiles: true,
    useSitemap: false,
    sitemapUrl: '',
    respectRobotsTxt: true,
    rateLimitMs: 1000,
    contentSelector: '',
    excludeSelectors: '',
    urlPatterns: '',
    excludedPatterns: '',
  })

  const updateField = (field: keyof FormData, value: FormData[keyof FormData]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleNext = () => setStep((s) => Math.min(3, s + 1))
  const handlePrev = () => setStep((s) => Math.max(1, s - 1))

  const handleTest = async () => {
    setLoading(true)
    setTestResult(null)

    try {
      // Créer temporairement pour tester
      const res = await fetch('/api/admin/web-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayload(),
          name: `TEST_${Date.now()}`,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setTestResult({ success: false, error: data.error })
        return
      }

      // Tester l'extraction
      const testRes = await fetch(`/api/admin/web-sources/${data.source.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const testData = await testRes.json()

      // Supprimer la source de test
      await fetch(`/api/admin/web-sources/${data.source.id}`, {
        method: 'DELETE',
      })

      if (testData.success) {
        setTestResult({
          success: true,
          extraction: testData.extraction,
        })
      } else {
        setTestResult({
          success: false,
          error: testData.error,
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur test',
      })
    } finally {
      setLoading(false)
    }
  }

  const buildPayload = () => {
    const cssSelectors: Record<string, string[]> = {}
    if (formData.contentSelector) {
      cssSelectors.content = formData.contentSelector.split(',').map((s) => s.trim())
    }
    if (formData.excludeSelectors) {
      cssSelectors.exclude = formData.excludeSelectors.split(',').map((s) => s.trim())
    }

    return {
      name: formData.name,
      baseUrl: formData.baseUrl,
      description: formData.description || undefined,
      category: formData.category,
      language: formData.language,
      crawlFrequency: formData.crawlFrequency,
      maxDepth: formData.maxDepth,
      maxPages: formData.maxPages,
      requiresJavascript: formData.requiresJavascript,
      downloadFiles: formData.downloadFiles,
      useSitemap: formData.useSitemap,
      sitemapUrl: formData.sitemapUrl || undefined,
      respectRobotsTxt: formData.respectRobotsTxt,
      rateLimitMs: formData.rateLimitMs,
      cssSelectors: Object.keys(cssSelectors).length > 0 ? cssSelectors : undefined,
      urlPatterns: formData.urlPatterns ? formData.urlPatterns.split('\n').filter(Boolean) : undefined,
      excludedPatterns: formData.excludedPatterns ? formData.excludedPatterns.split('\n').filter(Boolean) : undefined,
    }
  }

  const handleSubmit = async () => {
    setLoading(true)

    try {
      const res = await fetch('/api/admin/web-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur création source',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Source créée',
          description: 'La source a été ajoutée avec succès',
        })
        router.push(`/super-admin/web-sources/${data.source.id}`)
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la création',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const isStep1Valid = formData.name && formData.baseUrl && formData.category
  const isStep2Valid = true // Tous les champs ont des valeurs par défaut

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                step >= s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {step > s ? <Icons.check className="h-4 w-4" /> : s}
            </div>
            <span className={`ml-2 text-sm ${step >= s ? 'text-white' : 'text-slate-400'}`}>
              {s === 1 ? 'Informations' : s === 2 ? 'Configuration' : 'Extraction'}
            </span>
            {s < 3 && (
              <div className={`w-24 h-0.5 mx-4 ${step > s ? 'bg-blue-600' : 'bg-slate-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Informations de base</CardTitle>
            <CardDescription>Identifiez la source et sa catégorie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Nom de la source *</Label>
              <Input
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ex: JORT Tunisie"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">URL de base *</Label>
              <Input
                value={formData.baseUrl}
                onChange={(e) => updateField('baseUrl', e.target.value)}
                placeholder="https://www.jort.gov.tn"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Description de la source..."
                className="mt-1 bg-slate-900 border-slate-600 text-white"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Catégorie RAG *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => updateField('category', v)}
                >
                  <SelectTrigger className="mt-1 bg-slate-900 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value} className="text-white">
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Langue</Label>
                <Select
                  value={formData.language}
                  onValueChange={(v) => updateField('language', v)}
                >
                  <SelectTrigger className="mt-1 bg-slate-900 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="fr" className="text-white">Français</SelectItem>
                    <SelectItem value="ar" className="text-white">Arabe</SelectItem>
                    <SelectItem value="mixed" className="text-white">Mixte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Configuration du crawl</CardTitle>
            <CardDescription>Paramètres de fréquence et limites</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-slate-300">Fréquence de crawl</Label>
              <Select
                value={formData.crawlFrequency}
                onValueChange={(v) => updateField('crawlFrequency', v)}
              >
                <SelectTrigger className="mt-1 bg-slate-900 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {FREQUENCIES.map((freq) => (
                    <SelectItem key={freq.value} value={freq.value} className="text-white">
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-slate-300">Profondeur max: {formData.maxDepth}</Label>
              <Slider
                value={[formData.maxDepth]}
                onValueChange={([v]) => updateField('maxDepth', v)}
                min={1}
                max={10}
                step={1}
                className="mt-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                Nombre de niveaux de liens à suivre depuis la page d'accueil
              </p>
            </div>

            <div>
              <Label className="text-slate-300">Limite de pages: {formData.maxPages}</Label>
              <Slider
                value={[formData.maxPages]}
                onValueChange={([v]) => updateField('maxPages', v)}
                min={10}
                max={1000}
                step={10}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-slate-300">Délai entre requêtes: {formData.rateLimitMs}ms</Label>
              <Slider
                value={[formData.rateLimitMs]}
                onValueChange={([v]) => updateField('rateLimitMs', v)}
                min={100}
                max={5000}
                step={100}
                className="mt-2"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-300">Site dynamique (JavaScript)</Label>
                  <p className="text-xs text-slate-500">Utilise Playwright pour les sites SPA</p>
                </div>
                <Switch
                  checked={formData.requiresJavascript}
                  onCheckedChange={(v) => updateField('requiresJavascript', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-300">Télécharger les fichiers (PDF, DOCX)</Label>
                  <p className="text-xs text-slate-500">Indexe les documents liés</p>
                </div>
                <Switch
                  checked={formData.downloadFiles}
                  onCheckedChange={(v) => updateField('downloadFiles', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-300">Respecter robots.txt</Label>
                  <p className="text-xs text-slate-500">Recommandé pour rester éthique</p>
                </div>
                <Switch
                  checked={formData.respectRobotsTxt}
                  onCheckedChange={(v) => updateField('respectRobotsTxt', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-slate-300">Utiliser le sitemap</Label>
                  <p className="text-xs text-slate-500">Découvre les URLs via sitemap.xml</p>
                </div>
                <Switch
                  checked={formData.useSitemap}
                  onCheckedChange={(v) => updateField('useSitemap', v)}
                />
              </div>

              {formData.useSitemap && (
                <div>
                  <Label className="text-slate-300">URL du sitemap</Label>
                  <Input
                    value={formData.sitemapUrl}
                    onChange={(e) => updateField('sitemapUrl', e.target.value)}
                    placeholder="https://example.com/sitemap.xml"
                    className="mt-1 bg-slate-900 border-slate-600 text-white"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Extraction du contenu</CardTitle>
            <CardDescription>Personnalisez l'extraction (optionnel)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Sélecteurs CSS pour le contenu</Label>
              <Input
                value={formData.contentSelector}
                onChange={(e) => updateField('contentSelector', e.target.value)}
                placeholder="article, .content, #main-content"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">
                Séparez par des virgules. Laissez vide pour la détection auto.
              </p>
            </div>

            <div>
              <Label className="text-slate-300">Éléments à exclure</Label>
              <Input
                value={formData.excludeSelectors}
                onChange={(e) => updateField('excludeSelectors', e.target.value)}
                placeholder=".ads, .sidebar, .comments"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
              />
            </div>

            <div>
              <Label className="text-slate-300">Patterns d'URL à inclure (regex)</Label>
              <Textarea
                value={formData.urlPatterns}
                onChange={(e) => updateField('urlPatterns', e.target.value)}
                placeholder="Un pattern par ligne, ex:\n/articles/.*\n/lois/.*"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-slate-300">Patterns d'URL à exclure (regex)</Label>
              <Textarea
                value={formData.excludedPatterns}
                onChange={(e) => updateField('excludedPatterns', e.target.value)}
                placeholder="Un pattern par ligne, ex:\n/login\n/admin/.*"
                className="mt-1 bg-slate-900 border-slate-600 text-white"
                rows={3}
              />
            </div>

            {/* Bouton de test */}
            <div className="pt-4 border-t border-slate-700">
              <Button
                onClick={handleTest}
                disabled={loading || !formData.baseUrl}
                variant="outline"
                className="w-full border-slate-600 text-slate-300"
              >
                {loading ? (
                  <Icons.loader className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Icons.play className="h-4 w-4 mr-2" />
                )}
                Tester l'extraction
              </Button>

              {testResult && (
                <div className={`mt-4 p-4 rounded-lg ${
                  testResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  {testResult.success ? (
                    <div className="space-y-2">
                      <p className="text-green-400 font-medium">Extraction réussie</p>
                      <p className="text-sm text-slate-300">
                        <strong>Titre:</strong> {testResult.extraction?.title}
                      </p>
                      <p className="text-sm text-slate-400">
                        {testResult.extraction?.linksCount} liens, {testResult.extraction?.filesCount} fichiers
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-3">
                        {testResult.extraction?.contentPreview}
                      </p>
                    </div>
                  ) : (
                    <p className="text-red-400">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          onClick={handlePrev}
          disabled={step === 1}
          variant="outline"
          className="border-slate-600 text-slate-300"
        >
          <Icons.chevronLeft className="h-4 w-4 mr-2" />
          Précédent
        </Button>

        {step < 3 ? (
          <Button
            onClick={handleNext}
            disabled={step === 1 && !isStep1Valid}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Suivant
            <Icons.chevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={loading || !isStep1Valid}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <Icons.loader className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Icons.check className="h-4 w-4 mr-2" />
            )}
            Créer la source
          </Button>
        )}
      </div>
    </div>
  )
}
