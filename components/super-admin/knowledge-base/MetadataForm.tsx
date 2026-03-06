'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getMetadataFields,
  type MetadataFieldDefinition,
  GOUVERNORATS,
} from '@/lib/knowledge-base/metadata-schemas'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

interface MetadataFormProps {
  category: KnowledgeCategory
  metadata: Record<string, unknown>
  onChange: (metadata: Record<string, unknown>) => void
  disabled?: boolean
  lang?: 'fr' | 'ar'
}

export function MetadataForm({
  category,
  metadata,
  onChange,
  disabled = false,
  lang = 'fr',
}: MetadataFormProps) {
  const fields = useMemo(() => getMetadataFields(category), [category])

  const handleChange = (key: string, value: unknown) => {
    onChange({
      ...metadata,
      [key]: value,
    })
  }

  if (fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        Aucun champ de métadonnées spécifique pour cette catégorie.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <MetadataField
            key={field.key}
            field={field}
            value={metadata[field.key]}
            onChange={(value) => handleChange(field.key, value)}
            disabled={disabled}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

interface MetadataFieldProps {
  field: MetadataFieldDefinition
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  lang?: 'fr' | 'ar'
}

function MetadataField({
  field,
  value,
  onChange,
  disabled = false,
  lang = 'fr',
}: MetadataFieldProps) {
  const label = lang === 'fr' ? field.labelFr : field.labelAr
  const isRequired = field.required

  // Ajouter les gouvernorats pour les champs gouvernorat
  const options = useMemo(() => {
    if (field.key === 'gouvernorat') {
      return GOUVERNORATS.map((g) => ({
        value: g.value,
        labelFr: g.labelFr,
        labelAr: g.labelAr,
      }))
    }
    return field.options || []
  }, [field])

  switch (field.type) {
    case 'text':
      return (
        <div>
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Input
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            required={isRequired}
            className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )

    case 'textarea':
      return (
        <div className="md:col-span-2">
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            required={isRequired}
            rows={3}
            className="mt-1 bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )

    case 'date':
      return (
        <div>
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Input
            type="date"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            required={isRequired}
            className="mt-1 bg-muted border-border text-foreground"
          />
        </div>
      )

    case 'number':
      return (
        <div>
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Input
            type="number"
            value={(value as number) || ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
            required={isRequired}
            className="mt-1 bg-muted border-border text-foreground"
          />
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between py-2">
          <Label className="text-muted-foreground">{label}</Label>
          <Switch
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
          />
        </div>
      )

    case 'select':
      return (
        <div>
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Select
            value={(value as string) || '__none__'}
            onValueChange={(val) => onChange(val === '__none__' ? null : val)}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
              <SelectValue placeholder={`Sélectionner ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border max-h-60">
              {!isRequired && (
                <SelectItem value="__none__" className="text-muted-foreground hover:bg-muted">
                  Non spécifié
                </SelectItem>
              )}
              {options.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="text-foreground hover:bg-muted"
                >
                  {lang === 'fr' ? opt.labelFr : opt.labelAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )

    case 'multiselect':
      // Pour simplifier, on utilise un select multiple basique
      // Dans une implémentation plus avancée, utiliser un composant multi-select
      return (
        <div>
          <Label className="text-muted-foreground">
            {label}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Select
            value={Array.isArray(value) && value.length > 0 ? value[0] : ''}
            onValueChange={(val) => onChange(val ? [val] : [])}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
              <SelectValue placeholder={`Sélectionner ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border max-h-60">
              {options.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="text-foreground hover:bg-muted"
                >
                  {lang === 'fr' ? opt.labelFr : opt.labelAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )

    default:
      return null
  }
}

/**
 * Affichage en lecture seule des métadonnées
 */
export function MetadataDisplay({
  category,
  metadata,
  lang = 'fr',
}: {
  category: KnowledgeCategory
  metadata: Record<string, unknown>
  lang?: 'fr' | 'ar'
}) {
  const fields = getMetadataFields(category)

  const displayableFields = fields.filter(
    (field) => metadata[field.key] !== undefined && metadata[field.key] !== null && metadata[field.key] !== ''
  )

  if (displayableFields.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 text-sm">
      {displayableFields.map((field) => {
        const value = metadata[field.key]
        let displayValue: string

        if (field.type === 'boolean') {
          displayValue = value ? 'Oui' : 'Non'
        } else if (field.type === 'select' && field.options) {
          const option = field.options.find((o) => o.value === value)
          displayValue = option ? (lang === 'fr' ? option.labelFr : option.labelAr) : String(value)
        } else if (field.key === 'gouvernorat') {
          const gouv = GOUVERNORATS.find((g) => g.value === value)
          displayValue = gouv ? (lang === 'fr' ? gouv.labelFr : gouv.labelAr) : String(value)
        } else {
          displayValue = String(value)
        }

        return (
          <div key={field.key} className="flex">
            <span className="text-muted-foreground min-w-[140px]">
              {lang === 'fr' ? field.labelFr : field.labelAr}:
            </span>
            <span className="text-foreground">{displayValue}</span>
          </div>
        )
      })}
    </div>
  )
}
