'use client'

import { useState, useCallback, KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface TagsInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  maxTags?: number
  suggestions?: string[]
}

export function TagsInput({
  tags,
  onChange,
  placeholder = 'Ajouter un tag...',
  label = 'Tags',
  disabled = false,
  maxTags = 20,
  suggestions = [],
}: TagsInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const addTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim().toLowerCase()
      if (
        trimmedTag &&
        !tags.includes(trimmedTag) &&
        tags.length < maxTags
      ) {
        onChange([...tags, trimmedTag])
      }
      setInputValue('')
      setShowSuggestions(false)
    },
    [tags, onChange, maxTags]
  )

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove))
    },
    [tags, onChange]
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.includes(s.toLowerCase())
  )

  return (
    <div className="space-y-2">
      {label && <Label className="text-slate-300">{label}</Label>}

      {/* Tags affichés */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-slate-700/50 rounded-md min-h-[40px]">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-slate-600 text-slate-200 hover:bg-slate-500 cursor-pointer flex items-center gap-1 px-2 py-0.5"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-400 transition"
                >
                  <Icons.x className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <Input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowSuggestions(e.target.value.length > 0)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={
            tags.length >= maxTags ? `Maximum ${maxTags} tags` : placeholder
          }
          disabled={disabled || tags.length >= maxTags}
          className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-md shadow-lg max-h-40 overflow-auto">
            {filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addTag(suggestion)}
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Appuyez sur Entrée pour ajouter un tag ({tags.length}/{maxTags})
      </p>
    </div>
  )
}

/**
 * Affichage simple des tags (lecture seule)
 */
export function TagsList({ tags, size = 'sm' }: { tags: string[]; size?: 'xs' | 'sm' | 'md' }) {
  if (!tags || tags.length === 0) return null

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center rounded-full bg-slate-600/50 text-slate-300 ${sizeClasses[size]}`}
        >
          #{tag}
        </span>
      ))}
    </div>
  )
}

/**
 * Tags suggérés courants pour le droit tunisien
 */
export const SUGGESTED_TAGS = [
  // Domaines
  'civil',
  'penal',
  'commercial',
  'immobilier',
  'administratif',
  'fiscal',
  'travail',
  'famille',
  'succession',
  // Types
  'contrat',
  'responsabilite',
  'divorce',
  'pension',
  'loyer',
  'vente',
  'societe',
  'faillite',
  // Procédure
  'appel',
  'cassation',
  'refere',
  'execution',
  'saisie',
  // Juridictions
  'tunis',
  'sfax',
  'sousse',
  // Autres
  'important',
  'urgent',
  'modele',
  'formulaire',
]
