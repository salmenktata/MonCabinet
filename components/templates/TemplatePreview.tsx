'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { FileText, AlertCircle } from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface TemplatePreviewProps {
  content: string
  variables: Record<string, string>
  title?: string
  language?: 'fr' | 'ar'
  showMissingVariables?: boolean
  className?: string
}

interface ParsedLine {
  type: 'title' | 'heading' | 'subheading' | 'body' | 'signature' | 'empty' | 'separator'
  text: string
  isBold?: boolean
  alignment?: 'left' | 'center' | 'right' | 'justify'
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Détecte si le texte contient de l'arabe
 */
function containsArabic(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/
  return arabicRegex.test(text)
}

/**
 * Remplace les variables dans le contenu
 * Met en évidence les variables non remplacées
 */
function replaceVariables(
  content: string,
  variables: Record<string, string>,
  highlight: boolean = true
): { result: string; missing: string[] } {
  let result = content
  const missing: string[] = []

  // Trouver toutes les variables dans le template
  const doubleVarRegex = /\{\{([^}]+)\}\}/g
  const singleVarRegex = /\{([^}]+)\}/g

  // Collecter toutes les variables du template
  const templateVars = new Set<string>()
  let match

  while ((match = doubleVarRegex.exec(content)) !== null) {
    templateVars.add(match[1])
  }
  while ((match = singleVarRegex.exec(content)) !== null) {
    // Éviter les faux positifs avec les accolades JSON
    if (!match[1].includes(':') && !match[1].includes('"')) {
      templateVars.add(match[1])
    }
  }

  // Remplacer les variables
  for (const varName of templateVars) {
    const value = variables[varName]

    if (value && value.trim()) {
      // Variable remplie - remplacer
      const doubleRegex = new RegExp(`\\{\\{${escapeRegex(varName)}\\}\\}`, 'g')
      const singleRegex = new RegExp(`\\{${escapeRegex(varName)}\\}`, 'g')
      result = result.replace(doubleRegex, value)
      result = result.replace(singleRegex, value)
    } else {
      // Variable non remplie
      missing.push(varName)
      if (highlight) {
        // Marquer avec une classe spéciale
        const doubleRegex = new RegExp(`\\{\\{${escapeRegex(varName)}\\}\\}`, 'g')
        const singleRegex = new RegExp(`\\{${escapeRegex(varName)}\\}`, 'g')
        const marker = `⟨${varName}⟩`
        result = result.replace(doubleRegex, marker)
        result = result.replace(singleRegex, marker)
      }
    }
  }

  return { result, missing }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse le contenu en lignes stylisées
 */
function parseContent(content: string): ParsedLine[] {
  const lines = content.split('\n')
  const parsed: ParsedLine[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      parsed.push({ type: 'empty', text: '' })
      continue
    }

    // Ligne de séparation
    if (trimmed.match(/^[-=_*]{3,}$/)) {
      parsed.push({ type: 'separator', text: '' })
      continue
    }

    // Titre principal (MAJUSCULES)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-ZÀ-Ý]/.test(trimmed)) {
      parsed.push({
        type: 'title',
        text: trimmed,
        isBold: true,
        alignment: 'center',
      })
      continue
    }

    // Sous-titres (commence par I., II., 1., Article, Attendu, VU, etc.)
    if (/^(I+\.|[0-9]+\.|Article|ARTICLE|Attendu|ATTENDU|VU|Vu|PAR CES MOTIFS|DEMANDE)/i.test(trimmed)) {
      parsed.push({
        type: 'heading',
        text: trimmed,
        isBold: true,
        alignment: 'left',
      })
      continue
    }

    // Signature (Fait à..., Le Conseil, L'Avocat, etc.)
    if (/^(Fait à|Le Conseil|L'Avocat|Signature|المحامي|التوقيع|Me\s|Maître)/i.test(trimmed)) {
      parsed.push({
        type: 'signature',
        text: trimmed,
        alignment: 'right',
      })
      continue
    }

    // En-tête de lettre (À, De, Objet, Date, etc.)
    if (/^(À|A|De|Objet|Date|Référence|Ref|N\/Ref|V\/Ref)(\s)*:/i.test(trimmed)) {
      parsed.push({
        type: 'subheading',
        text: trimmed,
        isBold: true,
        alignment: 'left',
      })
      continue
    }

    // Corps du texte
    parsed.push({
      type: 'body',
      text: trimmed,
      alignment: 'justify',
    })
  }

  return parsed
}

// =============================================================================
// COMPOSANT
// =============================================================================

export default function TemplatePreview({
  content,
  variables,
  title,
  language,
  showMissingVariables = true,
  className,
}: TemplatePreviewProps) {
  // Détecter la langue automatiquement si non spécifiée
  const isArabic = useMemo(() => {
    if (language) return language === 'ar'
    return containsArabic(content)
  }, [content, language])

  // Remplacer les variables et parser le contenu
  const { processedContent, missingVars, parsedLines } = useMemo(() => {
    const { result, missing } = replaceVariables(content, variables, true)
    const lines = parseContent(result)
    return {
      processedContent: result,
      missingVars: missing,
      parsedLines: lines,
    }
  }, [content, variables])

  // Rendu d'une ligne
  const renderLine = (line: ParsedLine, index: number) => {
    if (line.type === 'empty') {
      return <div key={index} className="h-4" />
    }

    if (line.type === 'separator') {
      return (
        <div key={index} className="my-4">
          <hr className="border-gray-300 dark:border-gray-600" />
        </div>
      )
    }

    // Mettre en évidence les variables non remplies
    const textWithHighlight = line.text.split(/(⟨[^⟩]+⟩)/).map((part, i) => {
      if (part.startsWith('⟨') && part.endsWith('⟩')) {
        const varName = part.slice(1, -1)
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-mono border border-amber-300 dark:border-amber-700"
            title={`Variable non remplie: ${varName}`}
          >
            {varName}
          </span>
        )
      }
      return part
    })

    const baseClasses = cn(
      'leading-relaxed',
      isArabic && 'text-right',
      line.alignment === 'center' && 'text-center',
      line.alignment === 'right' && (isArabic ? 'text-left' : 'text-right'),
      line.alignment === 'left' && (isArabic ? 'text-right' : 'text-left'),
      line.alignment === 'justify' && 'text-justify',
      line.isBold && 'font-semibold'
    )

    switch (line.type) {
      case 'title':
        return (
          <h2
            key={index}
            className={cn(baseClasses, 'text-lg font-bold text-gray-900 dark:text-gray-100 my-3')}
          >
            {textWithHighlight}
          </h2>
        )

      case 'heading':
        return (
          <h3
            key={index}
            className={cn(baseClasses, 'text-base font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2')}
          >
            {textWithHighlight}
          </h3>
        )

      case 'subheading':
        return (
          <p
            key={index}
            className={cn(baseClasses, 'text-sm font-medium text-gray-700 dark:text-gray-300 my-1')}
          >
            {textWithHighlight}
          </p>
        )

      case 'signature':
        return (
          <p
            key={index}
            className={cn(baseClasses, 'text-sm text-gray-700 dark:text-gray-300 mt-6 italic')}
          >
            {textWithHighlight}
          </p>
        )

      case 'body':
      default:
        return (
          <p
            key={index}
            className={cn(baseClasses, 'text-sm text-gray-700 dark:text-gray-300 my-1.5')}
          >
            {textWithHighlight}
          </p>
        )
    }
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {title || 'Aperçu du document'}
          </span>
        </div>
        {isArabic && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
            RTL
          </span>
        )}
      </div>

      {/* Avertissement variables manquantes */}
      {showMissingVariables && missingVars.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-medium">{missingVars.length} variable{missingVars.length > 1 ? 's' : ''} non remplie{missingVars.length > 1 ? 's' : ''}</span>
            <span className="text-amber-600 dark:text-amber-500"> : {missingVars.slice(0, 5).join(', ')}{missingVars.length > 5 ? '...' : ''}</span>
          </div>
        </div>
      )}

      {/* Contenu du document */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900 rounded-b-lg',
          'shadow-inner',
          isArabic && 'direction-rtl'
        )}
        dir={isArabic ? 'rtl' : 'ltr'}
        style={{
          fontFamily: isArabic
            ? '"Traditional Arabic", "Scheherazade New", "Amiri", serif'
            : '"Times New Roman", "Georgia", serif',
        }}
      >
        {/* Titre du document */}
        {title && (
          <div className="text-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date().toLocaleDateString(isArabic ? 'ar-TN' : 'fr-TN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        )}

        {/* Contenu parsé */}
        <div className="space-y-0">
          {parsedLines.map((line, index) => renderLine(line, index))}
        </div>
      </div>
    </div>
  )
}
