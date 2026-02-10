'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getCategoryLabel,
  getSubcategoryLabel,
  getSubcategories,
} from '@/lib/knowledge-base/categories'
import { getCategoriesForContext, LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { KnowledgeCategory } from '@/lib/categories/legal-categories'

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
            {getCategoriesForContext('knowledge_base', lang).map((cat) => (
              <SelectItem
                key={cat.value}
                value={cat.value}
                className="text-white hover:bg-slate-700"
              >
                {cat.label}
              </SelectItem>
            ))}
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
        {getCategoriesForContext('knowledge_base', lang).map((cat) => (
          <SelectItem
            key={cat.value}
            value={cat.value}
            className="text-white hover:bg-slate-700"
          >
            {cat.label}
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
  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  const colorClass = LEGAL_CATEGORY_COLORS[category as keyof typeof LEGAL_CATEGORY_COLORS] || LEGAL_CATEGORY_COLORS.autre

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
