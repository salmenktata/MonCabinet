import { Badge } from '@/components/ui/badge'
import type { LegalDomain } from '@/types/legal-abrogations'

interface DomainBadgeProps {
  domain: LegalDomain | null
  size?: 'sm' | 'md' | 'lg'
}

const DOMAIN_CONFIG: Record<
  LegalDomain,
  { label: string; labelAr: string; color: string; icon: string }
> = {
  penal: {
    label: 'Pénal',
    labelAr: 'جنائي',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    icon: '🔒',
  },
  civil: {
    label: 'Civil',
    labelAr: 'مدني',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: '⚖️',
  },
  commercial: {
    label: 'Commercial',
    labelAr: 'تجاري',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    icon: '💼',
  },
  travail: {
    label: 'Travail',
    labelAr: 'شغل',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    icon: '🏢',
  },
  administratif: {
    label: 'Administratif',
    labelAr: 'إداري',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    icon: '📋',
  },
  constitutionnel: {
    label: 'Constitutionnel',
    labelAr: 'دستوري',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    icon: '📜',
  },
  fiscal: {
    label: 'Fiscal',
    labelAr: 'جبائي',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    icon: '💰',
  },
  famille: {
    label: 'Famille',
    labelAr: 'أسرة',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    icon: '👨‍👩‍👧',
  },
  procedure_civile: {
    label: 'Procédure Civile',
    labelAr: 'إجراءات مدنية',
    color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    icon: '📝',
  },
  procedure_penale: {
    label: 'Procédure Pénale',
    labelAr: 'إجراءات جزائية',
    color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
    icon: '⚡',
  },
  foncier: {
    label: 'Foncier',
    labelAr: 'عقاري',
    color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
    icon: '🏗️',
  },
  autre: {
    label: 'Autre',
    labelAr: 'أخرى',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    icon: '📄',
  },
}

export function DomainBadge({ domain, size = 'md' }: DomainBadgeProps) {
  if (!domain) {
    return (
      <Badge variant="outline" className="font-normal">
        <span className="mr-1">📄</span>
        Non classé
      </Badge>
    )
  }

  const config = DOMAIN_CONFIG[domain]
  if (!config) {
    return (
      <Badge variant="outline" className="font-normal">
        {domain}
      </Badge>
    )
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  return (
    <Badge className={`font-normal ${config.color} ${sizeClasses[size]}`}>
      <span className="mr-1">{config.icon}</span>
      <span className="hidden sm:inline">{config.label}</span>
      <span className="sm:hidden">{config.labelAr}</span>
    </Badge>
  )
}

export function DomainFilter({
  selected,
  onChange,
}: {
  selected: LegalDomain | 'all'
  onChange: (domain: LegalDomain | 'all') => void
}) {
  const domains: Array<LegalDomain | 'all'> = [
    'all',
    'penal',
    'civil',
    'commercial',
    'travail',
    'administratif',
    'constitutionnel',
    'fiscal',
    'famille',
    'procedure_civile',
    'procedure_penale',
    'foncier',
    'autre',
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {domains.map((domain) => (
        <button
          key={domain}
          onClick={() => onChange(domain)}
          className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
            selected === domain
              ? domain === 'all'
                ? 'bg-primary text-primary-foreground'
                : DOMAIN_CONFIG[domain as LegalDomain]?.color ||
                  'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {domain === 'all' ? (
            <>
              <span className="mr-1">📚</span>
              Tous
            </>
          ) : (
            <>
              <span className="mr-1">{DOMAIN_CONFIG[domain as LegalDomain]?.icon}</span>
              <span className="hidden sm:inline">
                {DOMAIN_CONFIG[domain as LegalDomain]?.label}
              </span>
              <span className="sm:hidden">
                {DOMAIN_CONFIG[domain as LegalDomain]?.labelAr}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}
