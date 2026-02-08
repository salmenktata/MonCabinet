'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { formatReadingTime } from '@/lib/utils/reading-time'

interface Section {
  id: string
  title: string
  readingTime?: number
}

interface AnalysisTableOfContentsProps {
  sections: Section[]
  locale?: 'fr' | 'ar'
  className?: string
  onNavigate?: (sectionId: string) => void
}

// Traductions inline pour éviter les dépendances externes
const translations = {
  fr: {
    tableOfContents: 'Table des matières',
    totalReadingTime: 'Temps de lecture total',
    backToTop: 'Retour en haut',
  },
  ar: {
    tableOfContents: 'جدول المحتويات',
    totalReadingTime: 'إجمالي وقت القراءة',
    backToTop: 'العودة إلى الأعلى',
  },
}

export function AnalysisTableOfContents({
  sections,
  locale = 'fr',
  className,
  onNavigate,
}: AnalysisTableOfContentsProps) {
  const t = translations[locale]
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [isSticky, setIsSticky] = useState(false)

  // Observer le scroll pour mettre à jour la section active
  useEffect(() => {
    const handleScroll = () => {
      // Détecter le mode sticky
      setIsSticky(window.scrollY > 200)

      // Détecter la section active
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 100 && rect.bottom > 100) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections])

  // Navigation vers une section
  const handleNavigate = useCallback(
    (sectionId: string) => {
      const element = document.getElementById(sectionId)
      if (element) {
        const yOffset = -80 // Offset pour le header sticky
        const y = element.getBoundingClientRect().top + window.scrollY + yOffset

        window.scrollTo({ top: y, behavior: 'smooth' })
        setActiveSection(sectionId)

        if (onNavigate) {
          onNavigate(sectionId)
        }
      }
    },
    [onNavigate]
  )

  // Calculer le temps de lecture total
  const totalReadingTime = sections.reduce((acc, s) => acc + (s.readingTime || 0), 0)

  return (
    <div
      className={cn(
        'hidden lg:block',
        isSticky && 'sticky top-4',
        className
      )}
    >
      <div className="rounded-lg border bg-card p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Icons.list className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{t.tableOfContents}</h3>
        </div>

        {/* Temps de lecture total */}
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          <Icons.clock className="h-3 w-3" />
          <span>
            {t.totalReadingTime}: {formatReadingTime(totalReadingTime, locale)}
          </span>
        </div>

        {/* Liste des sections */}
        <nav className="space-y-1">
          {sections.map((section, index) => (
            <button
              key={section.id}
              onClick={() => handleNavigate(section.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm',
                'transition-colors hover:bg-muted',
                activeSection === section.id
                  ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                  : 'text-muted-foreground'
              )}
            >
              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">
                {index + 1}
              </span>
              <span className="flex-1 truncate">{section.title}</span>
              {section.readingTime && (
                <span className="text-[10px] opacity-70 shrink-0">
                  {formatReadingTime(section.readingTime, locale)}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bouton retour en haut */}
        <div className="mt-4 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <Icons.arrowUp className="h-3 w-3 mr-2" />
            {t.backToTop}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Titres des sections
const sectionTitles: Record<string, { fr: string; ar: string }> = {
  qualification: { fr: 'Qualification Juridique', ar: 'التكييف القانوني' },
  syllogisme: { fr: 'Syllogisme Juridique', ar: 'القياس القانوني' },
  recevabilite: { fr: 'Recevabilité', ar: 'قبول الدعوى' },
  competence: { fr: 'Compétence', ar: 'الاختصاص' },
  strategie: { fr: 'Stratégie de Preuve', ar: 'استراتيجية الإثبات' },
  risques: { fr: 'Évaluation des Risques', ar: 'تقييم المخاطر' },
  recommandation: { fr: 'Recommandation', ar: 'التوصية' },
  references: { fr: 'Références', ar: 'المراجع' },
}

/**
 * Hook pour extraire les sections d'une analyse
 */
export function useAnalysisSections(
  analysisData: Record<string, unknown> | null,
  locale: 'fr' | 'ar' = 'fr'
): Section[] {
  if (!analysisData) return []

  // Sections standard d'une analyse juridique
  const sectionIds = [
    'qualification',
    'syllogisme',
    'recevabilite',
    'competence',
    'strategie',
    'risques',
    'recommandation',
    'references',
  ]

  return sectionIds
    .filter((id) => analysisData[id])
    .map((id) => ({
      id,
      title: sectionTitles[id]?.[locale] || id,
      readingTime: estimateSectionReadingTime(analysisData[id]),
    }))
}

/**
 * Estime le temps de lecture d'une section
 */
function estimateSectionReadingTime(content: unknown): number {
  if (!content) return 0

  let text = ''

  if (typeof content === 'string') {
    text = content
  } else if (typeof content === 'object') {
    text = JSON.stringify(content)
  }

  // 200 mots par minute
  const wordCount = text.split(/\s+/).length
  return Math.ceil(wordCount / 200)
}
