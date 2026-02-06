'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  KNOWLEDGE_CATEGORIES,
  getCategoryLabel,
  getSubcategoryLabel,
  getSubcategories,
  type KnowledgeCategory,
} from '@/lib/knowledge-base/categories'

interface CategorySelectorProps {
  category: string
  subcategory?: string | null
  onCategoryChange: (category: KnowledgeCategory) => void
  onSubcategoryChange: (subcategory: string | null) => void
  disabled?: boolean
  lang?: 'fr' | 'ar'
}

export function CategorySelector({
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  disabled = false,
  lang = 'fr',
}: CategorySelectorProps) {
  const [availableSubcategories, setAvailableSubcategories] = useState(
    getSubcategories(category as KnowledgeCategory)
  )

  useEffect(() => {
    setAvailableSubcategories(getSubcategories(category as KnowledgeCategory))
    // Reset subcategory when category changes
    if (subcategory && !getSubcategories(category as KnowledgeCategory).some(s => s.id === subcategory)) {
      onSubcategoryChange(null)
    }
  }, [category, subcategory, onSubcategoryChange])

  return (
    <div className="space-y-4">
      {/* Catégorie principale */}
      <div>
        <Label className="text-slate-300">Catégorie *</Label>
        <Select
          value={category}
          onValueChange={(val) => onCategoryChange(val as KnowledgeCategory)}
          disabled={disabled}
        >
          <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
            <SelectValue placeholder="Sélectionner une catégorie" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600 max-h-80">
            {KNOWLEDGE_CATEGORIES.map((cat) => (
              <SelectItem
                key={cat.id}
                value={cat.id}
                className="text-white hover:bg-slate-700"
              >
                <div className="flex items-center gap-2">
                  <span>{lang === 'fr' ? cat.labelFr : cat.labelAr}</span>
                  {cat.subcategories.length > 0 && (
                    <span className="text-xs text-slate-400">
                      ({cat.subcategories.length})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
            {/* Anciennes catégories pour rétrocompatibilité */}
            <SelectGroup>
              <SelectLabel className="text-slate-500">Anciennes catégories</SelectLabel>
              <SelectItem value="code" className="text-slate-400 hover:bg-slate-700">
                Code (ancien)
              </SelectItem>
              <SelectItem value="modele" className="text-slate-400 hover:bg-slate-700">
                Modèle (ancien)
              </SelectItem>
              <SelectItem value="autre" className="text-slate-400 hover:bg-slate-700">
                Autre
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Sous-catégorie */}
      {availableSubcategories.length > 0 && (
        <div>
          <Label className="text-slate-300">Sous-catégorie</Label>
          <Select
            value={subcategory || '__none__'}
            onValueChange={(val) => onSubcategoryChange(val === '__none__' ? null : val)}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Sélectionner une sous-catégorie (optionnel)" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600 max-h-60">
              <SelectItem value="__none__" className="text-slate-400 hover:bg-slate-700">
                Aucune sous-catégorie
              </SelectItem>
              {availableSubcategories.map((sub) => (
                <SelectItem
                  key={sub.id}
                  value={sub.id}
                  className="text-white hover:bg-slate-700"
                >
                  {lang === 'fr' ? sub.labelFr : sub.labelAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

/**
 * Composant de sélection de catégorie simple (sans sous-catégorie)
 */
export function SimpleCategorySelect({
  value,
  onChange,
  disabled = false,
  lang = 'fr',
  includeAll = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  lang?: 'fr' | 'ar'
  includeAll?: boolean
}) {
  return (
    <Select value={value || '__all__'} onValueChange={(val) => onChange(val === '__all__' ? '' : val)} disabled={disabled}>
      <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
        <SelectValue placeholder="Catégorie" />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-600 max-h-80">
        {includeAll && (
          <SelectItem value="__all__" className="text-slate-400 hover:bg-slate-700">
            Toutes les catégories
          </SelectItem>
        )}
        {KNOWLEDGE_CATEGORIES.map((cat) => (
          <SelectItem
            key={cat.id}
            value={cat.id}
            className="text-white hover:bg-slate-700"
          >
            {lang === 'fr' ? cat.labelFr : cat.labelAr}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Badge de catégorie coloré
 */
export function CategoryBadge({
  category,
  subcategory,
  lang = 'fr',
  size = 'sm',
}: {
  category: string
  subcategory?: string | null
  lang?: 'fr' | 'ar'
  size?: 'xs' | 'sm' | 'md'
}) {
  const CATEGORY_COLORS: Record<string, string> = {
    legislation: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    jurisprudence: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    doctrine: 'bg-green-500/20 text-green-300 border-green-500/30',
    modeles: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    procedures: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    jort: 'bg-red-500/20 text-red-300 border-red-500/30',
    formulaires: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    code: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    modele: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    autre: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  }

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.autre

  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={`inline-flex items-center rounded-full border font-medium ${colorClass} ${sizeClasses[size]}`}
      >
        {getCategoryLabel(category, lang)}
      </span>
      {subcategory && (
        <span
          className={`inline-flex items-center rounded-full border bg-slate-600/50 text-slate-300 border-slate-500/30 ${sizeClasses[size]}`}
        >
          {getSubcategoryLabel(subcategory, lang)}
        </span>
      )}
    </div>
  )
}
