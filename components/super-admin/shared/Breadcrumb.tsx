import Link from 'next/link'
import { Icons } from '@/lib/icons'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-slate-400" aria-label="Fil d'Ariane">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && <Icons.chevronRight className="h-3 w-3 text-slate-600" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-white transition">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-white font-medium' : ''}>{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
