'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  header: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  footer?: React.ReactNode
}

export function CollapsibleSection({
  header,
  children,
  defaultOpen = false,
  footer,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-lg border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-slate-700 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">{header}</div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
        )}
      </button>

      {open && (
        <>
          {children}
          {footer}
        </>
      )}
    </section>
  )
}
