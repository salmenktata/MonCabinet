'use client'

import { useState, useMemo } from 'react'
import { Copy, Check, Maximize2, Minimize2, AlignRight } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────────

type BlockType =
  | 'part'       // الجزء / Partie
  | 'chapter'    // الباب / Chapitre
  | 'section'    // الفرع / Section
  | 'article'    // الفصل / Article
  | 'paragraph'  // corps de texte
  | 'blank'

interface Block {
  type: BlockType
  text: string
  number?: string
}

// ── Parser ─────────────────────────────────────────────────────────────────────

const PATTERNS: { type: BlockType; re: RegExp }[] = [
  {
    type: 'part',
    re: /^(الجزء\s+\S+|Partie\s+\w+)/i,
  },
  {
    type: 'chapter',
    re: /^(الباب\s+\S+|Chapitre\s+\w+)/i,
  },
  {
    type: 'section',
    re: /^(الفرع\s+\S+|Section\s+\w+)/i,
  },
  {
    type: 'article',
    re: /^(الفصل\s+(\d+[\u0660-\u0669]*)|Article\s+(\d+))/i,
  },
]

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      blocks.push({ type: 'blank', text: '' })
      continue
    }

    let matched = false
    for (const { type, re } of PATTERNS) {
      const m = line.match(re)
      if (m) {
        const num = m[2] || m[3] || undefined
        blocks.push({ type, text: line, number: num })
        matched = true
        break
      }
    }

    if (!matched) {
      blocks.push({ type: 'paragraph', text: line })
    }
  }

  // Collapse consecutive blanks
  return blocks.filter((b, i) => !(b.type === 'blank' && blocks[i - 1]?.type === 'blank'))
}

// ── Sub-renderers ──────────────────────────────────────────────────────────────

function PartBlock({ text }: { text: string }) {
  return (
    <div className="mt-10 mb-6 text-center">
      <span className="inline-block px-6 py-2 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-base tracking-wide">
        {text}
      </span>
    </div>
  )
}

function ChapterBlock({ text }: { text: string }) {
  return (
    <div className="mt-8 mb-4 border-b border-slate-600/60 pb-2">
      <h3 className="text-base font-bold text-amber-300 tracking-wide">{text}</h3>
    </div>
  )
}

function SectionBlock({ text }: { text: string }) {
  return (
    <div className="mt-6 mb-3">
      <h4 className="text-sm font-semibold text-sky-300 uppercase tracking-widest">{text}</h4>
    </div>
  )
}

function ArticleBlock({ text, number }: { text: string; number?: string }) {
  // Split: header (الفصل X) + rest of line
  const headerRe = /^(الفصل\s+[\d\u0660-\u0669]+|Article\s+\d+)\s*[–—-]?\s*/i
  const m = text.match(headerRe)
  const header = m ? m[1] : null
  const body = m ? text.slice(m[0].length) : text

  return (
    <div className="group relative mt-5 mb-1 flex gap-4 items-start">
      {/* Article number pill */}
      <div className="shrink-0 mt-0.5">
        <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-md bg-slate-700/80 border border-slate-600/50 text-xs font-mono font-bold text-slate-300 tabular-nums">
          {number ?? '·'}
        </span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        {header && (
          <span className="text-xs font-semibold text-slate-500 block mb-0.5 uppercase tracking-wider">
            {header}
          </span>
        )}
        {body && (
          <p className="text-[0.9375rem] leading-[1.85] text-slate-200">
            {body}
          </p>
        )}
      </div>
    </div>
  )
}

function ParagraphBlock({ text, isFirst }: { text: string; isFirst: boolean }) {
  return (
    <p
      className={`text-[0.9375rem] leading-[1.85] text-slate-300 ${
        isFirst ? '' : 'mt-3'
      }`}
    >
      {text}
    </p>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ConsolidatedTextViewerProps {
  text: string
  totalArticles?: number
  totalWords?: number
}

export function ConsolidatedTextViewer({
  text,
  totalArticles,
  totalWords,
}: ConsolidatedTextViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const blocks = useMemo(() => parseBlocks(text), [text])

  const articleCount = useMemo(
    () => blocks.filter((b) => b.type === 'article').length,
    [blocks]
  )

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Texte copié')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-700/60 bg-slate-900/40">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {(totalArticles ?? articleCount) > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block" />
              {totalArticles ?? articleCount} articles
            </span>
          )}
          {totalWords && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400/70 inline-block" />
              {totalWords.toLocaleString('fr-FR')} mots
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
            {text.length.toLocaleString('fr-FR')} car.
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title="Copier le texte"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Réduire' : 'Agrandir'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {expanded ? 'Réduire' : 'Plein écran'}
          </button>
        </div>
      </div>

      {/* ── Document ── */}
      <div
        className={`overflow-y-auto transition-all duration-300 bg-slate-950/60 ${
          expanded ? 'max-h-[85vh]' : 'max-h-[65vh]'
        }`}
      >
        <div
          className="px-8 py-7 max-w-3xl mx-auto"
          dir="rtl"
          lang="ar"
          style={{ fontFamily: "'Noto Naskh Arabic', 'Scheherazade New', 'Arabic Typesetting', serif" }}
        >
          {blocks.map((block, i) => {
            if (block.type === 'blank') return <div key={i} className="h-2" />
            if (block.type === 'part') return <PartBlock key={i} text={block.text} />
            if (block.type === 'chapter') return <ChapterBlock key={i} text={block.text} />
            if (block.type === 'section') return <SectionBlock key={i} text={block.text} />
            if (block.type === 'article') return <ArticleBlock key={i} text={block.text} number={block.number} />

            const prevNonBlank = blocks.slice(0, i).reverse().find((b) => b.type !== 'blank')
            const isFirst = !prevNonBlank || prevNonBlank.type === 'article' || prevNonBlank.type === 'section'
            return <ParagraphBlock key={i} text={block.text} isFirst={isFirst} />
          })}
        </div>
      </div>
    </div>
  )
}
