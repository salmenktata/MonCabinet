'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface DuplicateDoc {
  documentId: string
  title: string
  category: string
  similarity: number
  relationType: 'duplicate' | 'near_duplicate' | 'related'
}

interface DuplicateWarningProps {
  duplicates: DuplicateDoc[]
  onDismiss?: () => void
}

export function DuplicateWarning({ duplicates, onDismiss }: DuplicateWarningProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || duplicates.length === 0) return null

  const hasDuplicates = duplicates.some(d => d.relationType === 'duplicate')

  return (
    <div className={`p-4 rounded-lg border ${
      hasDuplicates
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-yellow-500/10 border-yellow-500/30'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icons.alertTriangle className={`h-5 w-5 mt-0.5 ${
            hasDuplicates ? 'text-red-400' : 'text-yellow-400'
          }`} />
          <div>
            <h4 className={`font-medium ${hasDuplicates ? 'text-red-300' : 'text-yellow-300'}`}>
              {hasDuplicates
                ? 'Documents en doublon détectés'
                : 'Documents similaires détectés'}
            </h4>
            <p className="text-sm text-slate-400 mt-1">
              {duplicates.length} document(s) similaire(s) trouvé(s) dans la base
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setDismissed(true); onDismiss?.() }}
          className="text-slate-400 hover:text-white"
        >
          <Icons.x className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2 ml-8">
        {duplicates.map((dup) => (
          <div
            key={dup.documentId}
            className="flex items-center justify-between p-2 rounded bg-slate-800/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                dup.relationType === 'duplicate'
                  ? 'bg-red-500/20 text-red-400'
                  : dup.relationType === 'near_duplicate'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {Math.round(dup.similarity * 100)}%
              </span>
              <Link
                href={`/super-admin/knowledge-base/${dup.documentId}`}
                className="text-sm text-white hover:text-blue-400 truncate"
              >
                {dup.title}
              </Link>
            </div>
            <span className="text-xs text-slate-400 shrink-0 ml-2">
              {dup.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
