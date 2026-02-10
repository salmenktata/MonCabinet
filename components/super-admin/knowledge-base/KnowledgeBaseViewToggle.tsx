'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

export function KnowledgeBaseViewToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'list'

  const setView = (view: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.push(`/super-admin/knowledge-base?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
      <button
        onClick={() => setView('list')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
          currentView === 'list'
            ? 'bg-slate-700 text-white'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <Icons.list className="h-4 w-4" />
        Liste
      </button>
      <button
        onClick={() => setView('tree')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
          currentView === 'tree'
            ? 'bg-slate-700 text-white'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <Icons.folder className="h-4 w-4" />
        Arbre
      </button>
    </div>
  )
}
