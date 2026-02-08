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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface FormData {
  name: string
  baseUrl: string
  description: string
  category: string
  language: string
  crawlFrequency: string
  maxDepth: number
  maxPages: number
  requiresJavascript: boolean
  downloadFiles: boolean
  ignoreSSLErrors: boolean
  autoIndexFiles: boolean
  useSitemap: boolean
  sitemapUrl: string
  respectRobotsTxt: boolean
  rateLimitMs: number
  contentSelector: string
  excludeSelectors: string
  urlPatterns: string
  excludedPatterns: string
  isActive: boolean
}

interface EditWebSourceWizardProps {
  initialData: FormData & { id: string }
  sourceId: string
}

const CATEGORIES = [
  { value: 'legislation', label: 'Législation' },
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'doctrine', label: 'Doctrine' },
  { value: 'jort', label: 'JORT' },
  { value: 'codes', label: 'Codes juridiques' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'conventions', label: 'Conventions internationales' },
  { value: 'modeles', label: 'Modèles' },
  { value: 'procedures', label: 'Procédures' },
  { value: 'formulaires', label: 'Formulaires' },
  { value: 'guides', label: 'Guides pratiques' },
  { value: 'lexique', label: 'Lexique juridique' },
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

export function EditWebSourceWizard({ initialData, sourceId }: EditWebSourceWizardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialData)

  const updateField = (field: keyof FormData, value: FormData[keyof FormData]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const buildPayload = () => {
    const cssSelectors: Record<string, string[]> = {}
    if (formData.contentSelector) {
      cssSelectors.content = formData.contentSelector.split(',').map((s) => s.trim()).filter(Boolean)
    }
    if (formData.excludeSelectors) {
      cssSelectors.exclude = formData.excludeSelectors.split(',').map((s) => s.trim()).filter(Boolean)
    }

    return {
      name: formData.name,
      baseUrl: formData.baseUrl,
      description: formData.description,
      category: formData.category,
      language: formData.language,
      crawlFrequency: formData.crawlFrequency,
      maxDepth: formData.maxDepth,
      maxPages: formData.maxPages,
      requiresJavascript: formData.requiresJavascript,
      downloadFiles: formData.downloadFiles,
      ignoreSSLErrors: formData.ignoreSSLErrors,
      autoIndexFiles: formData.autoIndexFiles,
      useSitemap: formData.useSitemap,
      sitemapUrl: formData.sitemapUrl,
      respectRobotsTxt: formData.respectRobotsTxt,
      rateLimitMs: formData.rateLimitMs,
      cssSelectors: Object.keys(cssSelectors).length > 0 ? cssSelectors : null,
      urlPatterns: formData.urlPatterns ? formData.urlPatterns.split('\n').filter(Boolean) : [],
      excludedPatterns: formData.excludedPatterns ? formData.excludedPatterns.split('\n').filter(Boolean) : [],
      isActive: formData.isActive,
    }
  }

  const handleSubmit = async () => {
    setLoading(true)

    try {
      const res = await fetch(`/api/admin/web-sources/${sourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur mise à jour source',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Source mise à jour',
          description: 'Les modifications ont été enregistrées',
        })
        router.push(`/super-admin/web-sources/${sourceId}`)
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la mise à jour',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const isValid = formData.name && formData.baseUrl && formData.category

  return (
    <div className="max-w-3xl mx-auto">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="general" className="data-[state=active]:bg-slate-700">
            Informations
          </TabsTrigger>
          <TabsTrigger value="crawl" className="data-[state=active]:bg-slate-700">
            Configuration
          </TabsTrigger>
          <TabsTrigger value="extraction" className="data-[state=active]:bg-slate-700">
            Extraction
          </TabsTrigger>
          <TabsTrigger value="scheduling" className="data-[state=active]:bg-slate-700">
            Planification
          </TabsTrigger>
        </TabsList>

        {/* Tab Général */}
        <TabsContent value="general">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Informations de base</CardTitle>
              <CardDescription>Identifiez la source et sa catégorie</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-300">Source active</Label>
                  <p className="text-xs text-slate-400">Désactivez pour arrêter le crawl</p>
                </div>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(v) => updateField('isActive', v)}
                />
              </div>

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
        </TabsContent>

        {/* Tab Configuration */}
        <TabsContent value="crawl">
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
                <p className="text-xs text-slate-400 mt-1">
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
                    <p className="text-xs text-slate-400">Utilise Playwright pour les sites SPA</p>
                  </div>
                  <Switch
                    checked={formData.requiresJavascript}
                    onCheckedChange={(v) => updateField('requiresJavascript', v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-300">Télécharger les fichiers (PDF, DOCX)</Label>
                    <p className="text-xs text-slate-400">Indexe les documents liés</p>
                  </div>
                  <Switch
                    checked={formData.downloadFiles}
                    onCheckedChange={(v) => updateField('downloadFiles', v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-300">Respecter robots.txt</Label>
                    <p className="text-xs text-slate-400">Recommandé pour rester éthique</p>
                  </div>
                  <Switch
                    checked={formData.respectRobotsTxt}
                    onCheckedChange={(v) => updateField('respectRobotsTxt', v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-300">Utiliser le sitemap</Label>
                    <p className="text-xs text-slate-400">Découvre les URLs via sitemap.xml</p>
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

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-300">Ignorer les erreurs SSL</Label>
                    <p className="text-xs text-slate-400">Pour les sites gouvernementaux avec certificats expirés</p>
                  </div>
                  <Switch
                    checked={formData.ignoreSSLErrors}
                    onCheckedChange={(v) => updateField('ignoreSSLErrors', v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={formData.downloadFiles ? 'text-slate-300' : 'text-slate-500'}>Auto-indexer les fichiers PDF</Label>
                    <p className="text-xs text-slate-400">Parser et indexer automatiquement les PDFs pendant le crawl</p>
                  </div>
                  <Switch
                    checked={formData.autoIndexFiles}
                    onCheckedChange={(v) => updateField('autoIndexFiles', v)}
                    disabled={!formData.downloadFiles}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Extraction */}
        <TabsContent value="extraction">
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
                <p className="text-xs text-slate-400 mt-1">
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
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tab Planification */}
        <TabsContent value="scheduling">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Planification automatique</CardTitle>
              <CardDescription>Configurez le crawl automatique de cette source</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-300">Crawl automatique</Label>
                  <p className="text-xs text-slate-400">
                    Active le crawl automatique via le scheduler global
                  </p>
                </div>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(v) => updateField('isActive', v)}
                />
              </div>

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

              <div className="p-3 bg-slate-900/50 rounded-lg">
                <p className="text-xs text-slate-400">
                  Le scheduler global doit être activé pour que le crawl automatique fonctionne.
                  Configurez-le dans la page des sources web.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Boutons d'action */}
      <div className="flex items-center justify-end gap-4 mt-6">
        <Button
          variant="outline"
          className="border-slate-600 text-slate-300"
          onClick={() => router.push(`/super-admin/web-sources/${sourceId}`)}
        >
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || !isValid}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? (
            <Icons.loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icons.check className="h-4 w-4 mr-2" />
          )}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
