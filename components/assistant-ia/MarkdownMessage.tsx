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
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Personnalisation des liens
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),

          // Code blocks avec syntax highlighting
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''

            // Si c'est un bloc de code (avec une classe language-*), utiliser le syntax highlighter
            if (language) {
              return (
                <CodeBlock
                  language={language}
                  code={String(children).replace(/\n$/, '')}
                />
              )
            }

            // Sinon c'est du code inline
            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },

          // Tables améliorées
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table
                className="min-w-full border-collapse border border-border"
                {...props}
              />
            </div>
          ),

          th: ({ node, ...props }) => (
            <th
              className="border border-border bg-muted px-4 py-2 text-left font-semibold"
              {...props}
            />
          ),

          td: ({ node, ...props }) => (
            <td
              className="border border-border px-4 py-2"
              {...props}
            />
          ),

          // Task lists (checkboxes)
          input: ({ node, ...props }) => (
            <input
              type="checkbox"
              className="mr-2 align-middle"
              disabled
              {...props}
            />
          ),

          // Blockquotes avec parsing des citations
          blockquote: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <blockquote
                className="border-l-4 border-primary/50 pl-4 italic my-4 text-muted-foreground"
                {...props}
              >
                {parsedChildren}
              </blockquote>
            )
          },

          // Headings avec ancres et parsing des citations
          h1: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h1 className="text-2xl font-bold mt-6 mb-4 border-b pb-2" {...props}>
                {parsedChildren}
              </h1>
            )
          },

          h2: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h2 className="text-xl font-bold mt-5 mb-3" {...props}>
                {parsedChildren}
              </h2>
            )
          },

          h3: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return (
              <h3 className="text-lg font-semibold mt-4 mb-2" {...props}>
                {parsedChildren}
              </h3>
            )
          },

          // Listes
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-outside ml-6 my-3 space-y-1" {...props} />
          ),

          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-outside ml-6 my-3 space-y-1" {...props} />
          ),

          // List items avec parsing des citations
          li: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            return <li {...props}>{parsedChildren}</li>
          },

          // Paragraphes avec parsing des citations
          p: ({ node, children, ...props }) => {
            // Parser les children pour remplacer les citations
            const parsedChildren = React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                // Si c'est une string, parser les citations
                return parseTextWithCitations(child, sources)
              }
              return child
            })

            return (
              <p className="my-3 leading-relaxed" {...props}>
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
    <div className="relative group my-4">
      {/* Header avec langue et bouton copier */}
      <div className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-t-lg border border-b-0 border-border">
        <span className="text-xs text-muted-foreground font-mono uppercase">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Icons.check className="h-3 w-3" />
              Copié!
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
          borderRadius: '0 0 0.5rem 0.5rem',
          border: '1px solid hsl(var(--border))',
          borderTop: 'none',
        }}
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
