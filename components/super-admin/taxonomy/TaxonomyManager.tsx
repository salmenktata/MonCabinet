'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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

interface TaxonomyItem {
  id: string
  type: string
  code: string
  parentCode: string | null
  labelFr: string
  labelAr: string
  description: string | null
  icon: string | null
  color: string | null
  isActive: boolean
  isSystem: boolean
  sortOrder: number
  suggestedByAi: boolean
}

interface TaxonomyManagerProps {
  taxonomy: {
    category: TaxonomyItem[]
    domain: TaxonomyItem[]
    document_type: TaxonomyItem[]
    tribunal: TaxonomyItem[]
    chamber: TaxonomyItem[]
  }
}

const TYPE_LABELS: Record<string, { fr: string; icon: keyof typeof Icons; color: string }> = {
  category: { fr: 'Catégories', icon: 'tag', color: 'bg-purple-500/20 text-purple-400' },
  domain: { fr: 'Domaines juridiques', icon: 'briefcase', color: 'bg-green-500/20 text-green-400' },
  document_type: { fr: 'Types de documents', icon: 'file', color: 'bg-orange-500/20 text-orange-400' },
  tribunal: { fr: 'Tribunaux', icon: 'building', color: 'bg-cyan-500/20 text-cyan-400' },
  chamber: { fr: 'Chambres', icon: 'scale', color: 'bg-blue-500/20 text-blue-400' },
}

export function TaxonomyManager({ taxonomy }: TaxonomyManagerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TaxonomyItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    type: 'category',
    code: '',
    parentCode: '',
    labelFr: '',
    labelAr: '',
    description: '',
    sortOrder: 0,
  })

  const handleCreate = async () => {
    if (!formData.code || !formData.labelFr || !formData.labelAr) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/super-admin/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création')
      }

      toast({
        title: 'Succès',
        description: 'Élément créé avec succès',
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
    if (!selectedItem) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/super-admin/taxonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: selectedItem.code,
          labelFr: formData.labelFr,
          labelAr: formData.labelAr,
          description: formData.description,
          sortOrder: formData.sortOrder,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la modification')
      }

      toast({
        title: 'Succès',
        description: 'Élément modifié avec succès',
      })

      setIsEditDialogOpen(false)
      setSelectedItem(null)
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

  const handleDelete = async (code: string, isSystem: boolean) => {
    if (isSystem) {
      toast({
        title: 'Erreur',
        description: 'Les éléments système ne peuvent pas être supprimés',
        variant: 'destructive',
      })
      return
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/super-admin/taxonomy?code=${code}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }

      toast({
        title: 'Succès',
        description: 'Élément supprimé avec succès',
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors de la suppression',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const openEditDialog = (item: TaxonomyItem) => {
    setSelectedItem(item)
    setFormData({
      type: item.type,
      code: item.code,
      parentCode: item.parentCode || '',
      labelFr: item.labelFr,
      labelAr: item.labelAr,
      description: item.description || '',
      sortOrder: item.sortOrder,
    })
    setIsEditDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      type: 'category',
      code: '',
      parentCode: '',
      labelFr: '',
      labelAr: '',
      description: '',
      sortOrder: 0,
    })
  }

  const filterItems = (items: TaxonomyItem[]) => {
    if (!searchTerm) return items
    const term = searchTerm.toLowerCase()
    return items.filter(
      item =>
        item.code.toLowerCase().includes(term) ||
        item.labelFr.toLowerCase().includes(term) ||
        item.labelAr.includes(searchTerm)
    )
  }

  const renderTaxonomySection = (type: string, items: TaxonomyItem[]) => {
    const config = TYPE_LABELS[type]
    const Icon = Icons[config.icon]
    const filteredItems = filterItems(items)

    // Grouper par parent
    const rootItems = filteredItems.filter(item => !item.parentCode)
    const childrenByParent = new Map<string, TaxonomyItem[]>()

    filteredItems.forEach(item => {
      if (item.parentCode) {
        const children = childrenByParent.get(item.parentCode) || []
        children.push(item)
        childrenByParent.set(item.parentCode, children)
      }
    })

    return (
      <AccordionItem value={type} key={type}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="font-medium text-white">{config.fr}</span>
            <Badge variant="secondary" className="ml-2">
              {filteredItems.length}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 mt-2">
            {rootItems.map(item => (
              <div key={item.id}>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{item.labelFr}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-slate-400" dir="rtl">{item.labelAr}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <code className="bg-slate-700 px-1 rounded">{item.code}</code>
                        {item.isSystem && (
                          <Badge variant="outline" className="text-xs">Système</Badge>
                        )}
                        {item.suggestedByAi && (
                          <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500">
                            <Icons.sparkles className="h-3 w-3 mr-1" />
                            IA
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(item)}
                      aria-label="Modifier"
                    >
                      <Icons.edit className="h-4 w-4" />
                    </Button>
                    {!item.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-400"
                        onClick={() => handleDelete(item.code, item.isSystem)}
                        disabled={isLoading}
                        aria-label="Supprimer"
                      >
                        <Icons.trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {/* Enfants */}
                {childrenByParent.has(item.code) && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-700 pl-4">
                    {childrenByParent.get(item.code)!.map(child => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{child.labelFr}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-sm text-slate-400" dir="rtl">{child.labelAr}</span>
                          </div>
                          <code className="text-xs text-slate-600">{child.code}</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(child)}
                            aria-label="Modifier"
                          >
                            <Icons.edit className="h-3 w-3" />
                          </Button>
                          {!child.isSystem && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-400"
                              onClick={() => handleDelete(child.code, child.isSystem)}
                              disabled={isLoading}
                              aria-label="Supprimer"
                            >
                              <Icons.trash className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <p className="text-slate-400 text-center py-4">
                Aucun élément trouvé
              </p>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    )
  }

  return (
    <>
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Gestion de la taxonomie</CardTitle>
              <CardDescription className="text-slate-400">
                Catégories, domaines, types de documents et juridictions
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <Icons.plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Recherche */}
          <div className="mb-4">
            <div className="relative">
              <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-700"
              />
            </div>
          </div>

          {/* Accordion des types */}
          <Accordion type="multiple" defaultValue={['category', 'domain', 'document_type']} className="space-y-2">
            {renderTaxonomySection('category', taxonomy.category)}
            {renderTaxonomySection('domain', taxonomy.domain)}
            {renderTaxonomySection('document_type', taxonomy.document_type)}
            {renderTaxonomySection('tribunal', taxonomy.tribunal)}
            {renderTaxonomySection('chamber', taxonomy.chamber)}
          </Accordion>
        </CardContent>
      </Card>

      {/* Dialog de création */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Nouvel élément de taxonomie</DialogTitle>
            <DialogDescription className="text-slate-400">
              Créez un nouvel élément dans la taxonomie juridique
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Catégorie</SelectItem>
                    <SelectItem value="domain">Domaine</SelectItem>
                    <SelectItem value="document_type">Type de document</SelectItem>
                    <SelectItem value="tribunal">Tribunal</SelectItem>
                    <SelectItem value="chamber">Chambre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Code (unique)</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="ex: droit_numerique"
                  className="bg-slate-900 border-slate-700"
                />
              </div>
            </div>

            <div>
              <Label>Parent (optionnel)</Label>
              <Select
                value={formData.parentCode}
                onValueChange={(value) => setFormData({ ...formData, parentCode: value })}
              >
                <SelectTrigger className="bg-slate-900 border-slate-700">
                  <SelectValue placeholder="Aucun parent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun parent</SelectItem>
                  {[...taxonomy.category, ...taxonomy.domain, ...taxonomy.document_type].map(item => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.labelFr} ({item.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Label (Français)</Label>
                <Input
                  value={formData.labelFr}
                  onChange={(e) => setFormData({ ...formData, labelFr: e.target.value })}
                  placeholder="Droit numérique"
                  className="bg-slate-900 border-slate-700"
                />
              </div>
              <div>
                <Label>Label (Arabe)</Label>
                <Input
                  value={formData.labelAr}
                  onChange={(e) => setFormData({ ...formData, labelAr: e.target.value })}
                  placeholder="القانون الرقمي"
                  className="bg-slate-900 border-slate-700"
                  dir="rtl"
                />
              </div>
            </div>

            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description de cet élément..."
                className="bg-slate-900 border-slate-700"
              />
            </div>

            <div>
              <Label>Ordre de tri</Label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })}
                className="bg-slate-900 border-slate-700 w-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog d'édition */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Modifier l'élément</DialogTitle>
            <DialogDescription className="text-slate-400">
              Code: {selectedItem?.code}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Label (Français)</Label>
                <Input
                  value={formData.labelFr}
                  onChange={(e) => setFormData({ ...formData, labelFr: e.target.value })}
                  className="bg-slate-900 border-slate-700"
                />
              </div>
              <div>
                <Label>Label (Arabe)</Label>
                <Input
                  value={formData.labelAr}
                  onChange={(e) => setFormData({ ...formData, labelAr: e.target.value })}
                  className="bg-slate-900 border-slate-700"
                  dir="rtl"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-slate-900 border-slate-700"
              />
            </div>

            <div>
              <Label>Ordre de tri</Label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })}
                className="bg-slate-900 border-slate-700 w-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
