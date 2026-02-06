'use client'

import { useTranslations } from 'next-intl'

interface ExamplesCarouselProps {
  onSelect: (example: string) => void
}

const EXAMPLES = [
  {
    id: 'divorce',
    icon: '&#128141;',
    labelKey: 'examples.divorce.label',
    textKey: 'examples.divorce.text',
  },
  {
    id: 'commercial',
    icon: '&#128188;',
    labelKey: 'examples.commercial.label',
    textKey: 'examples.commercial.text',
  },
  {
    id: 'civil',
    icon: '&#9878;',
    labelKey: 'examples.civil.label',
    textKey: 'examples.civil.text',
  },
  {
    id: 'refere',
    icon: '&#9889;',
    labelKey: 'examples.refere.label',
    textKey: 'examples.refere.text',
  },
]

export default function ExamplesCarousel({ onSelect }: ExamplesCarouselProps) {
  const t = useTranslations('assistant')

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{t('examples.title')}</p>

      <div className="flex flex-wrap gap-3">
        {EXAMPLES.map((example) => (
          <button
            key={example.id}
            onClick={() => onSelect(t(example.textKey))}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <span dangerouslySetInnerHTML={{ __html: example.icon }} />
            {t(example.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
