'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { useState } from 'react'
import { InlineCitation } from './InlineCitation'
import type { ChatSource } from './ChatMessages'

interface MarkdownMessageProps {
  content: string
  sources?: ChatSource[]
  className?: string
}

/**
 * Parse le texte et remplace les citations [Source N], [KB-N], [Juris-N]
 * par des composants InlineCitation
 */
function parseTextWithCitations(text: string, sources: ChatSource[]): React.ReactNode[] {
  // Pattern pour matcher [Source N], [KB-N], [Juris-N]
  const citationPattern = /\[(Source|KB|Juris)-?(\d+)\]/g

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = citationPattern.exec(text)) !== null) {
    const fullMatch = match[0] // ex: "[Source 1]"
    const citationType = match[1] // ex: "Source"
    const citationNum = match[2] // ex: "1"
    const citationKey = `${citationType}-${citationNum}` // ex: "Source-1"

    // Ajouter le texte avant la citation
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }

    // Trouver la source correspondante (index base 0)
    const sourceIndex = parseInt(citationNum, 10) - 1
    const source = sources[sourceIndex]

    // Ajouter le composant de citation
    parts.push(
      <InlineCitation
        key={`citation-${match.index}-${citationKey}`}
        citationNumber={citationKey}
        source={source}
      />
    )

    lastIndex = match.index + fullMatch.length
  }

  // Ajouter le texte restant
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

export function MarkdownMessage({ content, sources = [], className }: MarkdownMessageProps) {
  return (
    <div dir="auto" className={cn('prose dark:prose-invert max-w-none prose-sm prose-p:first:mt-0 prose-headings:first:mt-0', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Personnalisation des liens
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-primary hover:underline font-medium decoration-primary/30 underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),

          // Code blocks avec syntax highlighting
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''

            if (language) {
              return (
                <CodeBlock
                  language={language}
                  code={String(children).replace(/\n$/, '')}
                />
              )
            }

            return (
              <code
                className="bg-primary/8 text-primary px-1.5 py-0.5 rounded-md text-[13px] font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },

          // Tables améliorées
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-5 rounded-xl border border-border/60 shadow-sm">
              <table
                className="min-w-full border-collapse"
                {...props}
              />
            </div>
          ),

          th: ({ node, ...props }) => (
            <th
              className="border-b border-border bg-muted/50 px-4 py-2.5 text-start font-semibold text-xs uppercase tracking-wider text-muted-foreground"
              {...props}
            />
          ),

          td: ({ node, ...props }) => (
            <td
              className="border-b border-border/30 px-4 py-2.5 text-sm"
              {...props}
            />
          ),

          // Task lists
          input: ({ node, ...props }) => (
            <input
              type="checkbox"
              className="mr-2 align-middle accent-primary"
              disabled
              {...props}
            />
          ),

          // Séparateurs - sections IRAC
          hr: ({ node, ...props }) => (
            <div className="my-6 flex items-center gap-3" {...props}>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>
          ),

          // Blockquotes - notes juridiques
          blockquote: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <blockquote
                className="border-s-[3px] border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ps-4 pe-4 py-3 my-5 rounded-e-xl not-italic text-foreground/85"
                {...props}
              >
                {parsedChildren}
              </blockquote>
            )
          },

          // H1 - Titre principal
          h1: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h1
                className="text-lg font-bold mt-6 mb-4 pb-2.5 border-b border-border/50 text-foreground flex items-center gap-2"
                {...props}
              >
                <span className="w-1 h-5 rounded-full bg-primary inline-block shrink-0" />
                {parsedChildren}
              </h1>
            )
          },

          // H2 - Sections principales
          h2: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h2
                className="text-[15px] font-bold mt-6 mb-3 text-primary flex items-center gap-2"
                {...props}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />
                {parsedChildren}
              </h2>
            )
          },

          // H3 = sections IRAC
          h3: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h3
                className="text-sm font-bold mt-5 mb-2.5 ps-3 py-2 border-s-[3px] border-primary/70 bg-primary/5 rounded-e-lg text-foreground"
                {...props}
              >
                {parsedChildren}
              </h3>
            )
          },

          // Listes non-ordonnées
          ul: ({ node, ...props }) => (
            <ul className="list-none ms-0 my-3 space-y-1.5 [&>li]:before:content-['▸'] [&>li]:before:text-primary/40 [&>li]:before:me-2 [&>li]:before:text-xs [&>li]:ps-1" {...props} />
          ),

          // Listes ordonnées
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-outside ms-5 my-3 space-y-1.5 marker:text-primary/60 marker:font-semibold [&>li]:ps-1" {...props} />
          ),

          // List items
          li: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <li className="leading-7" {...props}>
                {parsedChildren}
              </li>
            )
          },

          // Texte fort - références juridiques
          strong: ({ node, children, ...props }) => (
            <strong className="font-semibold text-foreground not-prose" {...props}>{children}</strong>
          ),

          // Emphase
          em: ({ node, children, ...props }) => (
            <em className="text-muted-foreground italic" {...props}>{children}</em>
          ),

          // Paragraphes
          p: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                return parseTextWithCitations(child, sources)
              }
              return child
            })

            return (
              <p className="my-3 leading-7 text-foreground/85" {...props}>
                {parsedChildren}
              </p>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Composant Code Block avec bouton copier
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-border/60 shadow-sm">
      {/* Header avec langue et bouton copier */}
      <div className="flex items-center justify-between bg-zinc-800 dark:bg-zinc-900 px-4 py-2">
        <span className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {copied ? (
            <>
              <Icons.check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copié!</span>
            </>
          ) : (
            <>
              <Icons.copy className="h-3 w-3" />
              Copier
            </>
          )}
        </button>
      </div>

      {/* Code avec syntax highlighting */}
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          border: 'none',
          fontSize: '13px',
        }}
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
