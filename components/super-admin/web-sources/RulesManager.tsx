'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Icons } from '@/lib/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useToast } from '@/hooks/use-toast'

interface Rule {
  id: string
  webSourceId: string | null
  name: string
  description: string | null
  conditions: RuleCondition[]
  targetCategory: string | null
  targetDomain: string | null
  targetDocumentType: string | null
  priority: number
  confidenceBoost: number
  isActive: boolean
  timesMatched: number
  timesCorrect: number
  lastMatchedAt: string | null
  createdAt: string
}

interface RuleCondition {
  type: string
  value: string
  position?: number
  caseSensitive?: boolean
  negate?: boolean
}

interface TaxonomyOption {
  code: string
  label: string
}

interface RulesManagerProps {
  sourceId: string
  sourceName: string
  sourceBaseUrl: string
  rules: Rule[]
  globalRules: Omit<Rule, 'webSourceId' | 'confidenceBoost' | 'timesCorrect' | 'lastMatchedAt' | 'createdAt'>[]
  taxonomy: {
    categories: TaxonomyOption[]
    domains: TaxonomyOption[]
    documentTypes: TaxonomyOption[]
  }
}

const CONDITION_TYPES = [
  { value: 'url_pattern', label: 'URL (Regex)', description: 'Expression régulière sur l\'URL complète' },
  { value: 'url_contains', label: 'URL contient', description: 'Substring dans l\'URL' },
  { value: 'url_segment', label: 'Segment URL', description: 'Segment à une position spécifique' },
  { value: 'url_starts_with', label: 'URL commence par', description: 'Le chemin commence par...' },
  { value: 'url_ends_with', label: 'URL termine par', description: 'Le chemin termine par...' },
  { value: 'breadcrumb_contains', label: 'Breadcrumb contient', description: 'Texte dans le fil d\'Ariane' },
  { value: 'breadcrumb_level', label: 'Breadcrumb niveau', description: 'Texte à un niveau spécifique' },
  { value: 'title_contains', label: 'Titre contient', description: 'Texte dans le titre de la page' },
  { value: 'heading_contains', label: 'H1 contient', description: 'Texte dans le titre H1' },
]

export function RulesManager({
  sourceId,
  sourceName,
  sourceBaseUrl,
  rules,
  globalRules,
  taxonomy,
}: RulesManagerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [testUrl, setTestUrl] = useState('')
  const [testResults, setTestResults] = useState<unknown[] | null>(null)

  // Form state
  const [formData, setFormData] = useState<{
    name: string
    description: string
    conditions: RuleCondition[]
    targetCategory: string
    targetDomain: string
    targetDocumentType: string
    priority: number
    confidenceBoost: number
  }>({
    name: '',
    description: '',
    conditions: [{ type: 'url_contains', value: '' }],
    targetCategory: '',
    targetDomain: '',
    targetDocumentType: '',
    priority: 0,
    confidenceBoost: 0.2,
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      conditions: [{ type: 'url_contains', value: '' }],
      targetCategory: '',
      targetDomain: '',
      targetDocumentType: '',
      priority: 0,
      confidenceBoost: 0.2,
    })
  }

  const handleCreate = async () => {
    if (!formData.name || formData.conditions.some(c => !c.value)) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/web-sources/${sourceId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          conditions: formData.conditions,
          targetCategory: formData.targetCategory || undefined,
          targetDomain: formData.targetDomain || undefined,
          targetDocumentType: formData.targetDocumentType || undefined,
          priority: formData.priority,
          confidenceBoost: formData.confidenceBoost,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création')
      }

      toast({
        title: 'Succès',
        description: 'Règle créée avec succès',
      })

      setIsCreateDialogOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors de la création',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedRule) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/web-sources/${sourceId}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: selectedRule.id,
          name: formData.name,
          description: formData.description,
          conditions: formData.conditions,
          targetCategory: formData.targetCategory || null,
          targetDomain: formData.targetDomain || null,
          targetDocumentType: formData.targetDocumentType || null,
          priority: formData.priority,
          confidenceBoost: formData.confidenceBoost,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la modification')
      }

      toast({
        title: 'Succès',
        description: 'Règle modifiée avec succès',
      })

      setIsEditDialogOpen(false)
      setSelectedRule(null)
      resetForm()
      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors de la modification',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleActive = async (rule: Rule) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/web-sources/${sourceId}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: rule.id,
          isActive: !rule.isActive,
        }),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la modification')
      }

      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/web-sources/${sourceId}/rules?ruleId=${ruleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression')
      }

      toast({
        title: 'Succès',
        description: 'Règle supprimée',
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestUrl = async () => {
    if (!testUrl) return

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/super-admin/web-sources/${sourceId}/rules?testUrl=${encodeURIComponent(testUrl)}`
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du test')
      }

      setTestResults(data.data.testResults || [])
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const openEditDialog = (rule: Rule) => {
    setSelectedRule(rule)
    setFormData({
      name: rule.name,
      description: rule.description || '',
      conditions: rule.conditions.length > 0 ? rule.conditions : [{ type: 'url_contains', value: '' }],
      targetCategory: rule.targetCategory || '',
      targetDomain: rule.targetDomain || '',
      targetDocumentType: rule.targetDocumentType || '',
      priority: rule.priority,
      confidenceBoost: rule.confidenceBoost,
    })
    setIsEditDialogOpen(true)
  }

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [...formData.conditions, { type: 'url_contains', value: '' }],
    })
  }

  const removeCondition = (index: number) => {
    if (formData.conditions.length <= 1) return
    setFormData({
      ...formData,
      conditions: formData.conditions.filter((_, i) => i !== index),
    })
  }

  const updateCondition = (index: number, updates: Partial<RuleCondition>) => {
    const newConditions = [...formData.conditions]
    newConditions[index] = { ...newConditions[index], ...updates }
    setFormData({ ...formData, conditions: newConditions })
  }

  const renderConditionBadge = (condition: RuleCondition) => {
    const type = CONDITION_TYPES.find(t => t.value === condition.type)
    return (
      <Badge variant="outline" className="text-xs">
        {type?.label}: {condition.value.substring(0, 20)}
        {condition.value.length > 20 ? '...' : ''}
        {condition.position !== undefined ? ` [${condition.position}]` : ''}
      </Badge>
    )
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Règles de la source */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Règles de {sourceName}</CardTitle>
                  <CardDescription className="text-slate-400">
                    {rules.length} règle(s) configurée(s)
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsTestDialogOpen(true)}>
                    <Icons.play className="h-4 w-4 mr-2" />
                    Tester
                  </Button>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Icons.plus className="h-4 w-4 mr-2" />
                    Nouvelle règle
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Icons.filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune règle configurée</p>
                  <p className="text-sm">Créez votre première règle pour classifier automatiquement les pages</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-lg border ${
                        rule.isActive
                          ? 'bg-slate-800/50 border-slate-700'
                          : 'bg-slate-900/50 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-white">{rule.name}</span>
                            <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                              {rule.isActive ? 'Actif' : 'Inactif'}
                            </Badge>
                            <Badge variant="outline">Priorité: {rule.priority}</Badge>
                          </div>

                          {rule.description && (
                            <p className="text-sm text-slate-400 mb-2">{rule.description}</p>
                          )}

                          <div className="flex flex-wrap gap-1 mb-2">
                            {rule.conditions.map((condition, i) => (
                              <span key={i}>{renderConditionBadge(condition)}</span>
                            ))}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            {rule.targetCategory && (
                              <span>
                                <Icons.tag className="h-3 w-3 inline mr-1" />
                                {taxonomy.categories.find(c => c.code === rule.targetCategory)?.label || rule.targetCategory}
                              </span>
                            )}
                            {rule.targetDomain && (
                              <span>
                                <Icons.briefcase className="h-3 w-3 inline mr-1" />
                                {taxonomy.domains.find(d => d.code === rule.targetDomain)?.label || rule.targetDomain}
                              </span>
                            )}
                            {rule.targetDocumentType && (
                              <span>
                                <Icons.file className="h-3 w-3 inline mr-1" />
                                {taxonomy.documentTypes.find(d => d.code === rule.targetDocumentType)?.label || rule.targetDocumentType}
                              </span>
                            )}
                            <span>
                              <Icons.target className="h-3 w-3 inline mr-1" />
                              {rule.timesMatched} match(es)
                            </span>
                            {rule.timesMatched > 0 && (
                              <span>
                                <Icons.chartBar className="h-3 w-3 inline mr-1" />
                                {((rule.timesCorrect / rule.timesMatched) * 100).toFixed(0)}% précision
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={() => handleToggleActive(rule)}
                            disabled={isLoading}
                          />
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                            <Icons.edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-400"
                            onClick={() => handleDelete(rule.id)}
                            disabled={isLoading}
                          >
                            <Icons.trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Règles globales */}
        <div>
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Règles globales</CardTitle>
              <CardDescription className="text-slate-400">
                Règles appliquées à toutes les sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              {globalRules.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  Aucune règle globale
                </p>
              ) : (
                <div className="space-y-2">
                  {globalRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                    >
                      <p className="font-medium text-white text-sm">{rule.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.conditions.slice(0, 2).map((condition, i) => (
                          <span key={i}>{renderConditionBadge(condition)}</span>
                        ))}
                        {rule.conditions.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{rule.conditions.length - 2}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {rule.timesMatched} match(es)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog de création/édition */}
      <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false)
          setIsEditDialogOpen(false)
          setSelectedRule(null)
          resetForm()
        }
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {isEditDialogOpen ? 'Modifier la règle' : 'Nouvelle règle'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Configurez les conditions et la classification cible
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Infos générales */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nom de la règle</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex: Jurisprudence Cassation"
                  className="bg-slate-900 border-slate-700"
                />
              </div>
              <div>
                <Label>Priorité</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value, 10) || 0 })}
                  className="bg-slate-900 border-slate-700"
                />
              </div>
            </div>

            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description de la règle..."
                className="bg-slate-900 border-slate-700"
              />
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Conditions (toutes doivent matcher)</Label>
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Icons.plus className="h-4 w-4 mr-1" />
                  Ajouter
                </Button>
              </div>

              <div className="space-y-3">
                {formData.conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 bg-slate-900/50 rounded-lg">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <Select
                        value={condition.type}
                        onValueChange={(value) => updateCondition(index, { type: value })}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder="Valeur..."
                        className="bg-slate-900 border-slate-700 col-span-2"
                      />

                      {(condition.type === 'url_segment' || condition.type === 'breadcrumb_level') && (
                        <Input
                          type="number"
                          value={condition.position || 0}
                          onChange={(e) => updateCondition(index, { position: parseInt(e.target.value, 10) || 0 })}
                          placeholder="Position"
                          className="bg-slate-900 border-slate-700"
                        />
                      )}
                    </div>

                    {formData.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-400"
                        onClick={() => removeCondition(index)}
                      >
                        <Icons.trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Classification cible */}
            <div>
              <Label className="mb-2 block">Classification cible</Label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-slate-400">Catégorie</Label>
                  <Select
                    value={formData.targetCategory}
                    onValueChange={(value) => setFormData({ ...formData, targetCategory: value })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {taxonomy.categories.map((cat) => (
                        <SelectItem key={cat.code} value={cat.code}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">Domaine</Label>
                  <Select
                    value={formData.targetDomain}
                    onValueChange={(value) => setFormData({ ...formData, targetDomain: value })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun</SelectItem>
                      {taxonomy.domains.map((dom) => (
                        <SelectItem key={dom.code} value={dom.code}>
                          {dom.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-slate-400">Type de document</Label>
                  <Select
                    value={formData.targetDocumentType}
                    onValueChange={(value) => setFormData({ ...formData, targetDocumentType: value })}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-700">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun</SelectItem>
                      {taxonomy.documentTypes.map((doc) => (
                        <SelectItem key={doc.code} value={doc.code}>
                          {doc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Boost de confiance */}
            <div>
              <Label>Boost de confiance</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={formData.confidenceBoost}
                  onChange={(e) => setFormData({ ...formData, confidenceBoost: parseFloat(e.target.value) || 0.2 })}
                  className="bg-slate-900 border-slate-700 w-24"
                />
                <span className="text-sm text-slate-400">
                  Ajouté au score de confiance (0-1)
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false)
              setIsEditDialogOpen(false)
              resetForm()
            }}>
              Annuler
            </Button>
            <Button
              onClick={isEditDialogOpen ? handleEdit : handleCreate}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEditDialogOpen ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de test */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Tester les règles</DialogTitle>
            <DialogDescription className="text-slate-400">
              Entrez une URL pour voir quelles règles matchent
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>URL à tester</Label>
              <div className="flex gap-2">
                <Input
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder={`${sourceBaseUrl}/...`}
                  className="bg-slate-900 border-slate-700"
                />
                <Button onClick={handleTestUrl} disabled={isLoading}>
                  {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.play className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {testResults !== null && (
              <div>
                <Label>Résultats</Label>
                {testResults.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    Aucune règle ne matche cette URL
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {(testResults as Array<{ rule: Rule; confidence: number; matchedConditions: number; totalConditions: number }>).map((result, i) => (
                      <div key={i} className="p-3 bg-slate-900/50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{result.rule.name}</span>
                          <Badge variant="default">
                            {(result.confidence * 100).toFixed(0)}% confiance
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {result.matchedConditions}/{result.totalConditions} conditions matchées
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsTestDialogOpen(false)
              setTestUrl('')
              setTestResults(null)
            }}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
