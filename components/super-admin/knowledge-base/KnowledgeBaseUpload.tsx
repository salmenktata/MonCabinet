'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { uploadKnowledgeDocumentAction } from '@/app/actions/knowledge-base'
import { CategorySelector } from './CategorySelector'
import { TagsInput, SUGGESTED_TAGS } from './TagsInput'
import { MetadataForm } from './MetadataForm'
import { KnowledgeBaseBulkUpload } from './KnowledgeBaseBulkUpload'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

export function KnowledgeBaseUpload() {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>('single')

  // Nouveaux états pour les champs
  const [category, setCategory] = useState<KnowledgeCategory>('legislation')
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)

      // Ajouter les champs supplémentaires
      formData.set('category', category)
      if (subcategory) {
        formData.set('subcategory', subcategory)
      }
      if (tags.length > 0) {
        formData.set('tags', JSON.stringify(tags))
      }
      if (Object.keys(metadata).length > 0) {
        formData.set('metadata', JSON.stringify(metadata))
      }

      if (file) {
        formData.set('file', file)
      }

      const result = await uploadKnowledgeDocumentAction(formData)

      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Document uploadé',
          description: `Le document "${result.document?.title}" a été ajouté.`
        })
        // Reset form
        setIsOpen(false)
        setFile(null)
        setCategory('legislation')
        setSubcategory(null)
        setTags([])
        setMetadata({})
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-slate-800 border-slate-700">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-700/50 transition rounded-t-lg">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Icons.upload className="h-5 w-5" />
                  Ajouter un document
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Cliquez pour ouvrir le formulaire d'upload
                </CardDescription>
              </div>
              <Icons.chevronDown className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            {/* Toggle mode */}
            <div className="flex items-center gap-2 mb-6">
              <Button
                type="button"
                variant={uploadMode === 'single' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setUploadMode('single')}
                className={uploadMode === 'single' ? 'bg-blue-600' : 'text-slate-400'}
              >
                <Icons.fileText className="h-4 w-4 mr-1" />
                Upload unique
              </Button>
              <Button
                type="button"
                variant={uploadMode === 'bulk' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setUploadMode('bulk')}
                className={uploadMode === 'bulk' ? 'bg-blue-600' : 'text-slate-400'}
              >
                <Icons.layers className="h-4 w-4 mr-1" />
                Upload groupé
              </Button>
            </div>

            {uploadMode === 'bulk' ? (
              <KnowledgeBaseBulkUpload onComplete={() => { setIsOpen(false); router.refresh() }} />
            ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Section: Informations de base */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Titre */}
                <div>
                  <Label className="text-slate-300">Titre *</Label>
                  <Input
                    name="title"
                    required
                    placeholder="Ex: Code des Obligations et Contrats"
                    className="mt-1 bg-slate-700 border-slate-600 text-white"
                  />
                </div>

                {/* Langue */}
                <div>
                  <Label className="text-slate-300">Langue *</Label>
                  <Select name="language" required defaultValue="ar">
                    <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="ar" className="text-white hover:bg-slate-700">العربية (Arabe)</SelectItem>
                      <SelectItem value="fr" className="text-white hover:bg-slate-700">Français</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Catégorie et sous-catégorie */}
              <CategorySelector
                category={category}
                subcategory={subcategory}
                onCategoryChange={setCategory}
                onSubcategoryChange={setSubcategory}
              />

              {/* Description */}
              <div>
                <Label className="text-slate-300">Description</Label>
                <Textarea
                  name="description"
                  placeholder="Description du document..."
                  className="mt-1 bg-slate-700 border-slate-600 text-white"
                  rows={2}
                />
              </div>

              {/* Tags */}
              <TagsInput
                tags={tags}
                onChange={setTags}
                suggestions={SUGGESTED_TAGS}
                placeholder="Ajouter des tags..."
              />

              {/* Fichier ou texte */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-slate-300">Fichier (PDF, TXT, DOCX)</Label>
                  <Input
                    type="file"
                    accept=".pdf,.txt,.docx,.doc"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="mt-1 bg-slate-700 border-slate-600 text-white file:bg-slate-600 file:text-white file:border-0"
                  />
                  {file && (
                    <p className="text-xs text-slate-500 mt-1">
                      {file.name} ({(file.size / 1024).toFixed(1)} Ko)
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-slate-300">Ou coller du texte</Label>
                  <Textarea
                    name="text"
                    placeholder="Collez le texte ici..."
                    className="mt-1 bg-slate-700 border-slate-600 text-white h-20"
                  />
                </div>
              </div>

              {/* Auto-indexation */}
              <div>
                <Label className="text-slate-300">Indexation automatique</Label>
                <Select name="autoIndex" defaultValue="true">
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="true" className="text-white hover:bg-slate-700">Oui (recommandé)</SelectItem>
                    <SelectItem value="false" className="text-white hover:bg-slate-700">Non</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Métadonnées avancées (accordéon) */}
              <Accordion type="single" collapsible>
                <AccordionItem value="metadata" className="border-slate-700">
                  <AccordionTrigger className="text-slate-300 hover:text-white">
                    <span className="flex items-center gap-2">
                      <Icons.settings className="h-4 w-4" />
                      Métadonnées avancées ({category})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <MetadataForm
                      category={category}
                      metadata={metadata}
                      onChange={setMetadata}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-700">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <>
                      <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                      Upload...
                    </>
                  ) : (
                    <>
                      <Icons.upload className="h-4 w-4 mr-2" />
                      Uploader
                    </>
                  )}
                </Button>
              </div>
            </form>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
