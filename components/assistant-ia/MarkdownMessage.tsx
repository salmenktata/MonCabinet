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

/**
 * Extraire le texte brut d'un ReactNode (children)
 */
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(getTextContent).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as React.ReactElement).props.children)
  }
  return ''
}

/**
 * Détecte si un texte est majoritairement en arabe (>25% de caractères arabes)
 */
function isArabicText(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length
  return arabicChars > 0 && arabicChars / text.replace(/\s/g, '').length > 0.25
}

interface IRACSectionStyle {
  step: string
  bgClass: string
  textClass: string
  badgeBg: string
  badgeText: string
}

/**
 * Détecte les sections IRAC arabes/françaises et retourne un style distinct.
 * Couvre les deux variantes Unicode du tanwin : اً (U+0627 U+064B) et ًا (U+064B U+0627)
 */
function getIRACSectionStyle(text: string): IRACSectionStyle | null {
  const t = text.trim()

  // Section 1 : Faits / الوقائع
  // أول[اً] couvre أولاً et أولًا (les deux variantes tanwin)
  if (/أول[اًً]/.test(t) || /^1[\.\)]\s/i.test(t) || /premièrement/i.test(t) || /الوقائع/i.test(t)) {
    return {
      step: '1',
      bgClass: 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/30',
      textClass: 'text-blue-800 dark:text-blue-300',
      badgeBg: 'bg-blue-500',
      badgeText: 'text-white',
    }
  }

  // Section 2 : Cadre juridique / الإطار القانوني
  if (/ثاني[اًً]/.test(t) || /^2[\.\)]\s/i.test(t) || /deuxièmement/i.test(t) || /الإطار القانوني/i.test(t)) {
    return {
      step: '2',
      bgClass: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30',
      textClass: 'text-amber-800 dark:text-amber-300',
      badgeBg: 'bg-amber-500',
      badgeText: 'text-white',
    }
  }

  // Section 3 : Analyse / التحليل
  if (/ثالث[اًً]/.test(t) || /^3[\.\)]\s/i.test(t) || /troisièmement/i.test(t) || /التحليل/i.test(t)) {
    return {
      step: '3',
      bgClass: 'bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/30',
      textClass: 'text-purple-800 dark:text-purple-300',
      badgeBg: 'bg-purple-500',
      badgeText: 'text-white',
    }
  }

  // Section 4 : Conclusion / الخلاصة
  if (/رابع[اًً]/.test(t) || /^4[\.\)]\s/i.test(t) || /quatrièmement/i.test(t) || /الخلاصة|التوصيات/i.test(t)) {
    return {
      step: '4',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30',
      textClass: 'text-emerald-800 dark:text-emerald-300',
      badgeBg: 'bg-emerald-500',
      badgeText: 'text-white',
    }
  }

  // Section 5+ : Autres
  if (/خامس[اًً]/.test(t) || /^5[\.\)]\s/i.test(t)) {
    return {
      step: '5',
      bgClass: 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-800/30',
      textClass: 'text-rose-800 dark:text-rose-300',
      badgeBg: 'bg-rose-500',
      badgeText: 'text-white',
    }
  }

  return null
}

export function MarkdownMessage({ content, sources = [], className }: MarkdownMessageProps) {
  return (
    <div dir="auto" className={cn('chat-ai-content prose dark:prose-invert max-w-none prose-p:first:mt-0 prose-headings:first:mt-0', className)}>
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
              className="border-b border-border/30 px-4 py-2.5 text-[15px]"
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
            const blockquoteText = getTextContent(children)
            const isArabicBq = isArabicText(blockquoteText)
            return (
              <blockquote
                className={cn(
                  "border-s-[3px] border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/25 ps-4 pe-4 py-3 my-5 rounded-e-xl not-italic text-foreground/90",
                  isArabicBq && "font-arabic leading-[2.1]"
                )}
                dir={isArabicBq ? "rtl" : undefined}
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

          // H2 - Sections principales (IRAC ou génériques)
          h2: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            const textContent = getTextContent(children)
            const sectionStyle = getIRACSectionStyle(textContent)

            if (sectionStyle) {
              return (
                <h2
                  className={cn(
                    'text-base font-bold mt-7 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5 not-prose',
                    sectionStyle.bgClass, sectionStyle.textClass
                  )}
                  {...props}
                >
                  <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0', sectionStyle.badgeBg, sectionStyle.badgeText)}>
                    {sectionStyle.step}
                  </span>
                  <span>{parsedChildren}</span>
                </h2>
              )
            }

            return (
              <h2
                className="text-base font-bold mt-6 mb-3 text-foreground flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border-s-[3px] border-primary"
                {...props}
              >
                {parsedChildren}
              </h2>
            )
          },

          // H3 = sections IRAC ou sous-sections
          h3: ({ node, children, ...props }) => {
            const parsedChildren = React.Children.map(children, (child) =>
              typeof child === 'string' ? parseTextWithCitations(child, sources) : child
            )
            const textContent = getTextContent(children)
            const sectionStyle = getIRACSectionStyle(textContent)

            if (sectionStyle) {
              return (
                <h3
                  className={cn(
                    'text-[15px] font-bold mt-6 mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5 not-prose',
                    sectionStyle.bgClass, sectionStyle.textClass
                  )}
                  {...props}
                >
                  <span className={cn('w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0', sectionStyle.badgeBg, sectionStyle.badgeText)}>
                    {sectionStyle.step}
                  </span>
                  <span>{parsedChildren}</span>
                </h3>
              )
            }

            return (
              <h3
                className="text-[15px] font-semibold mt-5 mb-2.5 ps-3 py-1.5 border-s-2 border-primary/50 text-foreground/90"
                {...props}
              >
                {parsedChildren}
              </h3>
            )
          },

          // Listes non-ordonnées
          ul: ({ node, ...props }) => (
            <ul className="list-none ms-0 my-3 space-y-1.5 [&>li]:before:content-['▸'] [&>li]:before:text-primary/65 [&>li]:before:me-2 [&>li]:before:text-xs [&>li]:ps-1" {...props} />
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
            const textContent = getTextContent(children)
            const isArabic = isArabicText(textContent)
            return (
              <li className={cn(
                "text-base",
                isArabic ? "font-arabic leading-[2.1]" : "leading-relaxed"
              )} {...props}>
                {parsedChildren}
              </li>
            )
          },

          // Texte fort - références juridiques + sections IRAC en bold
          strong: ({ node, children, ...props }) => {
            const textContent = getTextContent(children)
            const sectionStyle = getIRACSectionStyle(textContent)

            if (sectionStyle) {
              return (
                <strong
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-sm not-prose my-2',
                    sectionStyle.bgClass,
                    sectionStyle.textClass
                  )}
                  {...props}
                >
                  <span className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black shrink-0',
                    sectionStyle.badgeBg, sectionStyle.badgeText
                  )}>
                    {sectionStyle.step}
                  </span>
                  {children}
                </strong>
              )
            }

            return (
              <strong className="font-semibold text-foreground not-prose" {...props}>{children}</strong>
            )
          },

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
            const textContent = getTextContent(children)
            const isArabic = isArabicText(textContent)

            return (
              <p className={cn(
                "my-3 text-base text-foreground/90",
                isArabic ? "font-arabic leading-[2.1] tracking-normal" : "leading-relaxed"
              )} dir={isArabic ? "rtl" : undefined} {...props}>
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
