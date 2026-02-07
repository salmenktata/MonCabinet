'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  LegalClassification,
  LegalContentCategory,
  LegalDomain,
  DocumentNature,
} from '@/lib/web-scraper/types'

interface ClassificationEditorProps {
  classification: LegalClassification
  onSave: (newClassification: {
    primaryCategory: LegalContentCategory
    subcategory?: string
    domain?: LegalDomain
    subdomain?: string
    documentNature?: DocumentNature
  }) => void
  onCancel: () => void
}

const CATEGORIES: LegalContentCategory[] = [
  'legislation', 'jurisprudence', 'doctrine', 'jort',
  'modeles', 'procedures', 'formulaires', 'actualites', 'autre',
]

const CATEGORY_LABELS: Record<LegalContentCategory, string> = {
  legislation: 'Législation',
  jurisprudence: 'Jurisprudence',
  doctrine: 'Doctrine',
  jort: 'JORT',
  modeles: 'Modèles',
  procedures: 'Procédures',
  formulaires: 'Formulaires',
  actualites: 'Actualités',
  autre: 'Autre',
}

const DOMAINS: LegalDomain[] = [
  'civil', 'commercial', 'penal', 'famille', 'fiscal',
  'social', 'administratif', 'immobilier', 'bancaire',
  'propriete_intellectuelle', 'international', 'autre',
]

const DOMAIN_LABELS: Record<LegalDomain, string> = {
  civil: 'Droit civil',
  commercial: 'Droit commercial',
  penal: 'Droit pénal',
  famille: 'Droit de la famille',
  fiscal: 'Droit fiscal',
  social: 'Droit social',
  administratif: 'Droit administratif',
  immobilier: 'Droit immobilier',
  bancaire: 'Droit bancaire',
  propriete_intellectuelle: 'Propriété intellectuelle',
  international: 'Droit international',
  autre: 'Autre',
}

const DOCUMENT_NATURES: DocumentNature[] = [
  'loi', 'decret', 'arrete', 'circulaire', 'ordonnance',
  'arret', 'jugement', 'ordonnance_jud', 'avis',
  'article_doctrine', 'these', 'commentaire', 'note',
  'modele_contrat', 'modele_acte', 'formulaire',
  'guide_pratique', 'faq', 'actualite', 'autre',
]

const NATURE_LABELS: Record<DocumentNature, string> = {
  loi: 'Loi',
  decret: 'Décret',
  arrete: 'Arrêté',
  circulaire: 'Circulaire',
  ordonnance: 'Ordonnance',
  arret: 'Arrêt',
  jugement: 'Jugement',
  ordonnance_jud: 'Ordonnance judiciaire',
  avis: 'Avis',
  article_doctrine: 'Article de doctrine',
  these: 'Thèse',
  commentaire: 'Commentaire',
  note: 'Note',
  modele_contrat: 'Modèle de contrat',
  modele_acte: 'Modèle d\'acte',
  formulaire: 'Formulaire',
  guide_pratique: 'Guide pratique',
  faq: 'FAQ',
  actualite: 'Actualité',
  autre: 'Autre',
}

export function ClassificationEditor({
  classification,
  onSave,
  onCancel,
}: ClassificationEditorProps) {
  const [category, setCategory] = useState<LegalContentCategory>(
    classification.primaryCategory
  )
  const [subcategory, setSubcategory] = useState(classification.subcategory || '')
  const [domain, setDomain] = useState<LegalDomain | ''>(
    classification.domain || ''
  )
  const [subdomain, setSubdomain] = useState(classification.subdomain || '')
  const [documentNature, setDocumentNature] = useState<DocumentNature | ''>(
    classification.documentNature || ''
  )

  const handleSave = () => {
    onSave({
      primaryCategory: category,
      subcategory: subcategory || undefined,
      domain: domain || undefined,
      subdomain: subdomain || undefined,
      documentNature: documentNature || undefined,
    })
  }

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la classification</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Catégorie */}
          <div className="space-y-2">
            <Label htmlFor="category">Catégorie principale *</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as LegalContentCategory)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sous-catégorie */}
          <div className="space-y-2">
            <Label htmlFor="subcategory">Sous-catégorie</Label>
            <Input
              id="subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="bg-slate-800 border-slate-600"
              placeholder="Ex: contrats commerciaux"
            />
          </div>

          {/* Domaine */}
          <div className="space-y-2">
            <Label htmlFor="domain">Domaine juridique</Label>
            <Select
              value={domain}
              onValueChange={(value) => setDomain(value as LegalDomain | '')}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non spécifié</SelectItem>
                {DOMAINS.map((dom) => (
                  <SelectItem key={dom} value={dom}>
                    {DOMAIN_LABELS[dom]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sous-domaine */}
          <div className="space-y-2">
            <Label htmlFor="subdomain">Sous-domaine</Label>
            <Input
              id="subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              className="bg-slate-800 border-slate-600"
              placeholder="Ex: divorce, succession..."
            />
          </div>

          {/* Nature du document */}
          <div className="space-y-2">
            <Label htmlFor="nature">Nature du document</Label>
            <Select
              value={documentNature}
              onValueChange={(value) => setDocumentNature(value as DocumentNature | '')}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Non spécifié</SelectItem>
                {DOCUMENT_NATURES.map((nature) => (
                  <SelectItem key={nature} value={nature}>
                    {NATURE_LABELS[nature]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
