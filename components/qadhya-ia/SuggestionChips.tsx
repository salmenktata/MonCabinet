'use client'

import { cn } from '@/lib/utils'

type ActionType = 'chat' | 'structure' | 'ariida'

const CHIP_DATA: Record<ActionType, Array<{ label: string; send: string }>> = {
  chat: [
    { label: 'Jurisprudence', send: 'Quelles sont les dernières décisions jurisprudentielles sur la responsabilité délictuelle ?' },
    { label: 'Délais légaux', send: 'Quels sont les délais de prescription applicables en matière civile ?' },
    { label: 'Procédure civile', send: 'Quelle est la procédure civile à suivre pour introduire une action en justice ?' },
    { label: 'Droits du salarié', send: 'Quels sont les droits d\'un salarié en cas de licenciement abusif en droit tunisien ?' },
    { label: 'Contrat de bail', send: 'Quelles sont les règles applicables au contrat de bail commercial en droit tunisien ?' },
  ],
  structure: [
    { label: 'Bail commercial', send: 'Litige de bail commercial pour non-paiement de loyers depuis plusieurs mois.' },
    { label: 'Droit famille', send: 'Demande en divorce pour faute avec garde d\'enfants mineurs.' },
    { label: 'Affaire pénale', send: 'Poursuite pénale pour abus de confiance ou escroquerie.' },
    { label: 'Litige civil', send: 'Litige civil de voisinage ou de servitude foncière.' },
  ],
  ariida: [
    { label: 'Résiliation bail', send: 'Rédiger une requête introductive pour résiliation de bail et expulsion.' },
    { label: 'Recouvrement', send: 'Rédiger une requête pour recouvrement d\'une créance commerciale.' },
    { label: 'Responsabilité', send: 'Rédiger une requête introductive pour responsabilité délictuelle suite à un accident.' },
    { label: 'Litige immo', send: 'Rédiger une requête introductive pour litige de propriété immobilière.' },
  ],
}

interface SuggestionChipsProps {
  mode: ActionType
  onSend: (text: string) => void
  className?: string
}

export function SuggestionChips({ mode, onSend, className }: SuggestionChipsProps) {
  const chips = CHIP_DATA[mode] || []
  if (chips.length === 0) return null

  return (
    <div className={cn('overflow-x-auto scrollbar-hide px-4 pb-2', className)}>
      <div className="flex gap-2 min-w-max">
        {chips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => onSend(chip.send)}
            className={cn(
              'inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-medium',
              'bg-background hover:bg-accent transition-colors duration-150',
              'text-muted-foreground hover:text-foreground',
              'whitespace-nowrap shrink-0 cursor-pointer'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}
