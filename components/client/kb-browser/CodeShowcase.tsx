'use client'

import { useRouter } from 'next/navigation'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// DONNÉES STATIQUES — Principaux codes tunisiens
// =============================================================================

const LEGAL_CODES = [
  {
    key: 'coc',
    fr: 'Code des Obligations et Contrats',
    ar: 'مجلة الالتزامات والعقود',
    year: 1906,
    query: 'code obligations contrats COC',
    colorClass: 'bg-indigo-50 border-indigo-200 hover:border-indigo-400 dark:bg-indigo-950 dark:border-indigo-800',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  },
  {
    key: 'cp',
    fr: 'Code Pénal',
    ar: 'المجلة الجزائية',
    year: 1913,
    query: 'code pénal',
    colorClass: 'bg-red-50 border-red-200 hover:border-red-400 dark:bg-red-950 dark:border-red-800',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  {
    key: 'commerce',
    fr: 'Code de Commerce',
    ar: 'المجلة التجارية',
    year: 1959,
    query: 'code de commerce',
    colorClass: 'bg-blue-50 border-blue-200 hover:border-blue-400 dark:bg-blue-950 dark:border-blue-800',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  {
    key: 'travail',
    fr: 'Code du Travail',
    ar: 'مجلة الشغل',
    year: 1966,
    query: 'code du travail',
    colorClass: 'bg-green-50 border-green-200 hover:border-green-400 dark:bg-green-950 dark:border-green-800',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  {
    key: 'csp',
    fr: 'Code du Statut Personnel',
    ar: 'مجلة الأحوال الشخصية',
    year: 1956,
    query: 'code statut personnel',
    colorClass: 'bg-pink-50 border-pink-200 hover:border-pink-400 dark:bg-pink-950 dark:border-pink-800',
    badgeClass: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  },
  {
    key: 'fiscal',
    fr: 'Code des Droits et Procédures Fiscaux',
    ar: 'مجلة الحقوق والإجراءات الجبائية',
    year: 2000,
    query: 'code fiscal droits procédures',
    colorClass: 'bg-amber-50 border-amber-200 hover:border-amber-400 dark:bg-amber-950 dark:border-amber-800',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  {
    key: 'proc_civil',
    fr: 'Code de Procédure Civile',
    ar: 'مجلة المرافعات المدنية والتجارية',
    year: 1959,
    query: 'code procédure civile',
    colorClass: 'bg-cyan-50 border-cyan-200 hover:border-cyan-400 dark:bg-cyan-950 dark:border-cyan-800',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  },
  {
    key: 'proc_penal',
    fr: 'Code de Procédure Pénale',
    ar: 'مجلة الإجراءات الجزائية',
    year: 1968,
    query: 'code procédure pénale',
    colorClass: 'bg-purple-50 border-purple-200 hover:border-purple-400 dark:bg-purple-950 dark:border-purple-800',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
]

// =============================================================================
// COMPOSANT
// =============================================================================

interface CodeShowcaseProps {
  className?: string
}

export function CodeShowcase({ className = '' }: CodeShowcaseProps) {
  const router = useRouter()

  const handleCodeClick = (query: string) => {
    router.push(`/client/knowledge-base?mode=general&cat=codes&q=${encodeURIComponent(query)}`)
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Codes Principaux
          </h2>
        </div>
        <button
          onClick={() => router.push('/client/knowledge-base?mode=general&cat=codes')}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Tous les codes
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Scroll horizontal sur mobile, grille sur desktop */}
      <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto pb-2 md:overflow-visible md:pb-0 snap-x snap-mandatory md:snap-none">
        {LEGAL_CODES.map((code) => (
          <button
            key={code.key}
            onClick={() => handleCodeClick(code.query)}
            className={`snap-start shrink-0 w-44 md:w-auto text-left border rounded-xl p-3 transition-all hover:shadow-sm cursor-pointer ${code.colorClass}`}
          >
            <div className="space-y-1.5">
              <div className="text-sm font-semibold leading-snug line-clamp-2">
                {code.fr}
              </div>
              <div className="text-xs opacity-70 font-medium" dir="rtl">
                {code.ar}
              </div>
              <Badge className={`text-xs mt-1 ${code.badgeClass}`} variant="outline">
                {code.year}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
