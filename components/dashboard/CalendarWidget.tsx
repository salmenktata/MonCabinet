'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { niveauUrgence } from '@/lib/utils/delais-tunisie'

export interface CalendarEcheance {
  id: string
  titre: string
  type_echeance: 'audience' | 'delai_legal' | 'delai_interne' | 'autre'
  date_echeance: string // ISO "YYYY-MM-DD"
  statut: string
  description?: string
  dossier?: { numero: string; objet: string }
}

interface CalendarWidgetProps {
  echeances: CalendarEcheance[]
}

// --- Utilitaires calendrier ---

function getCalendarDays(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Lundi = 0 (semaine européenne)
  let startDow = firstDay.getDay() // 0=dim, 1=lun, ...
  startDow = startDow === 0 ? 6 : startDow - 1 // convertir → lun=0

  const days: { date: Date; isCurrentMonth: boolean }[] = []

  // Jours du mois précédent
  for (let i = startDow - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false })
  }

  // Jours du mois courant
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }

  // Compléter jusqu'à 42 cases (6 semaines)
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
  }

  return days
}

function groupByDate(echeances: CalendarEcheance[]): Map<string, CalendarEcheance[]> {
  const map = new Map<string, CalendarEcheance[]>()
  for (const e of echeances) {
    const key = e.date_echeance.slice(0, 10) // "YYYY-MM-DD"
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return map
}

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dotColor(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const niveau = niveauUrgence(date)
  switch (niveau) {
    case 'depasse': return 'bg-red-500'
    case 'critique': return 'bg-orange-500'
    case 'urgent': return 'bg-yellow-500'
    case 'proche': return 'bg-blue-500'
    default: return 'bg-muted-foreground/50'
  }
}

function urgenceLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const niveau = niveauUrgence(date)
  switch (niveau) {
    case 'depasse': return 'Dépassée'
    case 'critique': return 'Critique'
    case 'urgent': return 'Urgent'
    case 'proche': return 'Proche'
    default: return 'Normal'
  }
}

function urgenceBadgeClass(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const niveau = niveauUrgence(date)
  switch (niveau) {
    case 'depasse': return 'bg-red-500/10 text-red-400 border border-red-500/20'
    case 'critique': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
    case 'urgent': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
    case 'proche': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    default: return 'bg-muted/50 text-muted-foreground border border-border/50'
  }
}

function typeIcon(type: string): string {
  switch (type) {
    case 'audience': return '🏛️'
    case 'delai_legal': return '⚖️'
    case 'delai_interne': return '📋'
    default: return '📌'
  }
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const LEGENDE = [
  { niveau: 'Dépassée', color: 'bg-red-500' },
  { niveau: 'Critique', color: 'bg-orange-500' },
  { niveau: 'Urgent', color: 'bg-yellow-500' },
  { niveau: 'Proche', color: 'bg-blue-500' },
  { niveau: 'Normal', color: 'bg-muted-foreground/50' },
]

// --- Composant principal ---

export default function CalendarWidget({ echeances }: CalendarWidgetProps) {
  const locale = useLocale()
  const today = new Date()
  const todayKey = toDateKey(today)

  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const days = getCalendarDays(year, month)
  const byDate = groupByDate(echeances)

  // Compteur échéances du mois affiché
  const moisEcheances = echeances.filter((e) => {
    const d = e.date_echeance.slice(0, 7) // "YYYY-MM"
    return d === `${year}-${String(month + 1).padStart(2, '0')}`
  })

  const monthLabel = currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  function goToday() {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDay(todayKey)
  }

  function handleDayClick(key: string, hasEcheances: boolean) {
    if (!hasEcheances) {
      setSelectedDay(null)
      return
    }
    setSelectedDay(selectedDay === key ? null : key)
  }

  const selectedEcheances = selectedDay ? (byDate.get(selectedDay) ?? []) : []

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
          {moisEcheances.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {moisEcheances.length} échéance{moisEcheances.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-xs px-2 py-1 rounded border border-input hover:bg-accent transition-colors"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            aria-label="Mois précédent"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            aria-label="Mois suivant"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grille */}
      <div className="p-3">
        {/* En-têtes jours */}
        <div className="grid grid-cols-7 mb-1">
          {JOURS.map((j) => (
            <div key={j} className="text-center text-xs font-medium text-muted-foreground py-1">
              {j}
            </div>
          ))}
        </div>

        {/* Cellules */}
        <div className="grid grid-cols-7 gap-0.5">
          {days.map(({ date, isCurrentMonth }, idx) => {
            const key = toDateKey(date)
            const dayEcheances = byDate.get(key) ?? []
            const hasEcheances = dayEcheances.length > 0
            const isToday = key === todayKey
            const isSelected = key === selectedDay

            // Dots (max 3 + compteur)
            const visibleDots = dayEcheances.slice(0, 3)
            const extra = dayEcheances.length - 3

            return (
              <button
                key={idx}
                onClick={() => handleDayClick(key, hasEcheances)}
                disabled={!hasEcheances}
                className={[
                  'relative flex flex-col items-center rounded-md py-1.5 px-0.5 min-h-[52px] transition-colors',
                  !isCurrentMonth ? 'opacity-30' : '',
                  hasEcheances ? 'cursor-pointer hover:bg-accent' : 'cursor-default',
                  isSelected ? 'bg-accent' : '',
                  isToday && !isSelected ? 'ring-2 ring-inset ring-blue-500/60 bg-blue-500/10' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'text-xs font-medium leading-none mb-1',
                    isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : '',
                    !isCurrentMonth ? 'text-muted-foreground' : '',
                  ].join(' ')}
                >
                  {date.getDate()}
                </span>

                {/* Dots urgence */}
                {hasEcheances && (
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    {visibleDots.map((e, i) => (
                      <span
                        key={i}
                        className={`block h-1.5 w-1.5 rounded-full ${dotColor(e.date_echeance)}`}
                      />
                    ))}
                    {extra > 0 && (
                      <span className="text-[9px] text-muted-foreground leading-none">+{extra}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panneau détail jour */}
      {selectedDay && selectedEcheances.length > 0 && (
        <div className="border-t border-border/50 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <div className="space-y-2">
            {selectedEcheances.map((e) => (
              <Link
                key={e.id}
                href={`/echeances/${e.id}`}
                className="flex items-start gap-2 rounded-md p-2 hover:bg-accent transition-colors group"
              >
                <span className="text-base leading-none mt-0.5">{typeIcon(e.type_echeance)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary">{e.titre}</p>
                  {e.dossier && (
                    <p className="text-xs text-muted-foreground truncate">
                      {e.dossier.numero} · {e.dossier.objet}
                    </p>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${urgenceBadgeClass(e.date_echeance)}`}>
                  {urgenceLabel(e.date_echeance)}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t">
            <Link href="/echeances" className="text-xs text-primary hover:underline">
              Voir toutes les échéances →
            </Link>
          </div>
        </div>
      )}

      {/* Légende + lien bas */}
      <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {LEGENDE.map(({ niveau, color }) => (
            <div key={niveau} className="flex items-center gap-1">
              <span className={`block h-2 w-2 rounded-full ${color}`} />
              <span className="text-[11px] text-muted-foreground">{niveau}</span>
            </div>
          ))}
        </div>
        <Link href="/echeances" className="text-xs text-primary hover:underline shrink-0">
          Voir toutes →
        </Link>
      </div>
    </div>
  )
}
