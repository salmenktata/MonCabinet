'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  updateKnowledgeDocumentAction,
  updateKnowledgeDocumentContentAction,
} from '@/app/actions/knowledge-base'
import { CategorySelector } from './CategorySelector'
import { TagsInput, SUGGESTED_TAGS } from './TagsInput'
import { MetadataForm } from './MetadataForm'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

interface KnowledgeDocument {
  id: string
  category: string
  subcategory: string | null
  language: 'ar' | 'fr'
  title: string
  description: string | null
  metadata: Record<string, unknown>
  tags: string[]
  sourceFile: string | null
  fullText: string | null
  isIndexed: boolean
  version: number
}

interface KnowledgeBaseEditProps {
  document: KnowledgeDocument
}

export function KnowledgeBaseEdit({ document }: KnowledgeBaseEditProps) {
  const router = useRouter()
  const { toast } = useToast()

  // État du formulaire
  const [title, setTitle] = useState(document.title)
  const [description, setDescription] = useState(document.description || '')
  const [category, setCategory] = useState<KnowledgeCategory>(document.category as KnowledgeCategory)
  const [subcategory, setSubcategory] = useState<string | null>(document.subcategory)
  const [language, setLanguage] = useState<'ar' | 'fr'>(document.language)
  const [tags, setTags] = useState<string[]>(document.tags || [])
  const [metadata, setMetadata] = useState<Record<string, unknown>>(document.metadata || {})

  // État pour mise à jour du contenu
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [changeReason, setChangeReason] = useState('')
  const [reindex, setReindex] = useState(true)

  // États de chargement
  const [savingMetadata, setSavingMetadata] = useState(false)
  const [savingContent, setSavingContent] = useState(false)

  const handleSaveMetadata = async () => {
    setSavingMetadata(true)
    try {
      const result = await updateKnowledgeDocumentAction(document.id, {
        title,
        description: description || undefined,
        category,
        subcategory: subcategory || undefined,
        metadata,
        tags,
        language,
      })

      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Modifications enregistrées',
          description: 'Les métadonnées ont été mises à jour.',
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setSavingMetadata(false)
    }
  }

  const handleSaveContent = async () => {
    if (!file && !text) {
      toast({
        title: 'Erreur',
        description: 'Veuillez fournir un fichier ou du texte',
        variant: 'destructive',
      })
      return
    }

    setSavingContent(true)
    try {
      const formData = new FormData()
      if (file) {
        formData.set('file', file)
      }
      if (text) {
        formData.set('text', text)
      }
      formData.set('reindex', String(reindex))
      if (changeReason) {
        formData.set('changeReason', changeReason)
      }

      const result = await updateKnowledgeDocumentContentAction(document.id, formData)

      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Contenu mis à jour',
          description: `Version ${result.versionCreated} créée.${reindex ? ' Ré-indexation en cours.' : ''}`,
        })
        setFile(null)
        setText('')
        setChangeReason('')
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setSavingContent(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={`/super-admin/knowledge-base/${document.id}`}
            className="text-slate-400 hover:text-white transition"
          >
            <Icons.arrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Modifier le document</h1>
        </div>
      </div>

      {/* Formulaire principal */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colonne gauche: Métadonnées */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Titre */}
            <div>
              <Label className="text-slate-300">Titre *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 bg-slate-700 border-slate-600 text-white"
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 bg-slate-700 border-slate-600 text-white"
              />
            </div>

            {/* Langue */}
            <div>
              <Label className="text-slate-300">Langue</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as 'ar' | 'fr')}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="ar" className="text-white hover:bg-slate-700">Arabe</SelectItem>
                  <SelectItem value="fr" className="text-white hover:bg-slate-700">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Catégorie et sous-catégorie */}
            <CategorySelector
              category={category}
              subcategory={subcategory}
              onCategoryChange={setCategory}
              onSubcategoryChange={setSubcategory}
            />

            {/* Tags */}
            <TagsInput
              tags={tags}
              onChange={setTags}
              suggestions={SUGGESTED_TAGS}
            />

            <Button
              onClick={handleSaveMetadata}
              disabled={savingMetadata || !title}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {savingMetadata ? (
                <>
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Icons.save className="h-4 w-4 mr-2" />
                  Enregistrer les métadonnées
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Colonne droite: Métadonnées avancées et contenu */}
        <div className="space-y-6">
          {/* Métadonnées spécifiques */}
          <Accordion type="single" collapsible defaultValue="metadata">
            <AccordionItem value="metadata" className="border-slate-700">
              <Card className="bg-slate-800 border-slate-700">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <CardTitle className="text-white text-base">
                    Métadonnées spécifiques ({category})
                  </CardTitle>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent>
                    <MetadataForm
                      category={category}
                      metadata={metadata}
                      onChange={setMetadata}
                    />
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>

          {/* Mise à jour du contenu */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Icons.fileText className="h-4 w-4" />
                Remplacer le contenu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">
                Téléchargez un nouveau fichier ou collez du texte pour remplacer le contenu actuel.
                Une nouvelle version sera créée.
              </p>

              {/* Fichier */}
              <div>
                <Label className="text-slate-300">Nouveau fichier (PDF, TXT, DOCX)</Label>
                <Input
                  type="file"
                  accept=".pdf,.txt,.docx,.doc"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="mt-1 bg-slate-700 border-slate-600 text-white file:bg-slate-600 file:text-white file:border-0"
                />
                {file && (
                  <p className="text-xs text-slate-400 mt-1">
                    {file.name} ({(file.size / 1024).toFixed(1)} Ko)
                  </p>
                )}
              </div>

              {/* Texte */}
              <div>
                <Label className="text-slate-300">Ou nouveau texte</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="Collez le nouveau contenu ici..."
                  className="mt-1 bg-slate-700 border-slate-600 text-white"
                />
              </div>

              {/* Raison du changement */}
              <div>
                <Label className="text-slate-300">Raison du changement</Label>
                <Input
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Ex: Correction d'erreurs, mise à jour..."
                  className="mt-1 bg-slate-700 border-slate-600 text-white"
                />
              </div>

              {/* Options */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reindex"
                  checked={reindex}
                  onChange={(e) => setReindex(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <Label htmlFor="reindex" className="text-slate-300 cursor-pointer">
                  Ré-indexer automatiquement après la mise à jour
                </Label>
              </div>

              <Button
                onClick={handleSaveContent}
                disabled={savingContent || (!file && !text)}
                variant="outline"
                className="w-full border-orange-500 text-orange-400 hover:bg-orange-500/20"
              >
                {savingContent ? (
                  <>
                    <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                    Mise à jour...
                  </>
                ) : (
                  <>
                    <Icons.upload className="h-4 w-4 mr-2" />
                    Remplacer le contenu
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Aperçu du contenu actuel */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Contenu actuel</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="text-slate-400 text-sm whitespace-pre-wrap max-h-[200px] overflow-auto bg-slate-900 p-3 rounded line-clamp-6"
                dir={document.language === 'ar' ? 'rtl' : 'ltr'}
              >
                {document.fullText
                  ? document.fullText.substring(0, 1000) + (document.fullText.length > 1000 ? '...' : '')
                  : 'Aucun contenu'}
              </div>
              {document.fullText && (
                <p className="text-xs text-slate-400 mt-2">
                  {document.fullText.length.toLocaleString()} caractères au total
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
