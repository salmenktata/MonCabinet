/**
 * Service d'extraction intelligente du contenu web
 * Détecte automatiquement le contenu principal et supprime le bruit
 */

import * as cheerio from 'cheerio'
import type { CheerioAPI, Cheerio } from 'cheerio'
import type { Element } from 'domhandler'
import type { CssSelectors, LinkedFile, ScrapedContent } from './types'
import crypto from 'crypto'

// Sélecteurs par défaut pour le contenu principal
const DEFAULT_CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.content-body',
  '.article-body',
  '#content',
  '#main-content',
  '#article',
  '.article',
  '.post',
  '.entry',
]

// Éléments à exclure systématiquement
// Note: iframe est traité séparément pour extraire les fichiers avant suppression
const DEFAULT_EXCLUDE_SELECTORS = [
  'script',
  'style',
  'noscript',
  // 'iframe', // Traité séparément dans extractLinkedFiles
  'nav',
  'header',
  'footer',
  'aside',
  '.nav',
  '.navigation',
  '.menu',
  '.sidebar',
  '.ads',
  '.advertisement',
  '.ad',
  '.comments',
  '.comment',
  '.cookie-banner',
  '.cookie-consent',
  '.popup',
  '.modal',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '.social-share',
  '.share-buttons',
  '.related-posts',
  '.recommended',
  '.newsletter',
  '.subscribe',
  '.breadcrumb',
  '.breadcrumbs',
  '.pagination',
  '.tags',
  '.meta',
  '.author-bio',
  '#disqus',
  '.fb-comments',
]

// Extensions de fichiers téléchargeables
const FILE_EXTENSIONS: Record<string, LinkedFile['type']> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.pptx': 'pptx',
  '.ppt': 'ppt',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
}

// Patterns pour détecter les fichiers hébergés sur des services cloud
const CLOUD_FILE_PATTERNS = [
  // Google Drive - lien de téléchargement direct
  {
    pattern: /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Drive - lien ouvert
  {
    pattern: /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Drive - lien de visualisation
  {
    pattern: /drive\.google\.com\/viewer\?.*srcid=([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://drive.google.com/uc?export=download&id=${id}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `gdrive_${id}.pdf`,
  },
  // Google Docs Viewer avec URL externe
  {
    pattern: /docs\.google\.com\/viewer\?url=([^&]+)/,
    getUrl: (encodedUrl: string) => decodeURIComponent(encodedUrl),
    type: 'pdf' as LinkedFile['type'],
    filename: (encodedUrl: string) => {
      try {
        const url = new URL(decodeURIComponent(encodedUrl))
        return url.pathname.split('/').pop() || 'document.pdf'
      } catch {
        return 'document.pdf'
      }
    },
  },
  // Dropbox
  {
    pattern: /dropbox\.com\/s\/([a-zA-Z0-9]+)\/([^?]+)/,
    getUrl: (id: string, filename: string) => `https://dl.dropbox.com/s/${id}/${filename}`,
    type: 'pdf' as LinkedFile['type'],
    filename: (_id: string, filename: string) => filename || 'dropbox_file.pdf',
  },
  // OneDrive / SharePoint
  {
    pattern: /1drv\.ms\/[a-z]\/s!([a-zA-Z0-9_-]+)/,
    getUrl: (id: string) => `https://1drv.ms/b/s!${id}?download=1`,
    type: 'pdf' as LinkedFile['type'],
    filename: (id: string) => `onedrive_${id}.pdf`,
  },
]

// Patterns pour détecter les iframes contenant des documents
const IFRAME_DOC_PATTERNS = [
  // Google Drive embed
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/preview/,
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/,
  // Google Docs embed
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  // Google Docs Viewer
  /docs\.google\.com\/viewer\?/,
  // Scribd
  /scribd\.com\/embeds\/([0-9]+)/,
  // SlideShare
  /slideshare\.net\/slideshow\/embed_code\/([0-9]+)/,
]

/**
 * Extrait le contenu principal d'une page HTML
 */
export function extractContent(
  html: string,
  baseUrl: string,
  customSelectors?: CssSelectors
): ScrapedContent {
  const $ = cheerio.load(html)
  const url = new URL(baseUrl)

  // Supprimer les éléments indésirables
  const excludeSelectors = [
    ...DEFAULT_EXCLUDE_SELECTORS,
    ...(customSelectors?.exclude || []),
  ]
  $(excludeSelectors.join(', ')).remove()

  // Extraire le titre
  const title = extractTitle($, customSelectors?.title)

  // Extraire les métadonnées
  const description = extractMeta($, 'description', customSelectors?.description)
  const author = extractMeta($, 'author', customSelectors?.author)
  const date = extractDate($, customSelectors?.date)
  const keywords = extractKeywords($)
  const language = detectLanguage($)
  const structuredData = extractStructuredData($)

  // Trouver le contenu principal
  const contentSelectors = customSelectors?.content?.length
    ? customSelectors.content
    : DEFAULT_CONTENT_SELECTORS

  let contentElement = findContentElement($, contentSelectors)

  // Si aucun contenu trouvé, utiliser le body
  if (!contentElement || contentElement.length === 0) {
    contentElement = $('body')
  }

  // Extraire les liens internes
  const links = extractInternalLinks($, contentElement, url)

  // Extraire les fichiers liés (doit être fait AVANT suppression des iframes)
  const files = extractLinkedFiles($, contentElement, url)

  // Supprimer les iframes après extraction des fichiers
  $('iframe').remove()

  // Extraire le texte propre
  const content = extractCleanText(contentElement)

  // Garder le HTML du contenu pour référence
  const contentHtml = contentElement.html() || ''

  return {
    url: baseUrl,
    title,
    content,
    html: contentHtml,
    description,
    author,
    date,
    keywords,
    language,
    links,
    files,
    structuredData,
  }
}

/**
 * Trouve l'élément contenant le contenu principal
 */
function findContentElement(
  $: CheerioAPI,
  selectors: string[]
): Cheerio<Element> | null {
  for (const selector of selectors) {
    const element = $(selector)
    if (element.length > 0 && element.text().trim().length > 100) {
      return element.first() as Cheerio<Element>
    }
  }

  // Heuristique: trouver le div avec le plus de texte
  let bestElement: Cheerio<Element> | null = null
  let maxTextLength = 0

  $('div, section, article').each((_, el) => {
    const element = $(el) as Cheerio<Element>
    const text = element.text().trim()

    // Ignorer les éléments avec très peu de texte
    if (text.length > maxTextLength && text.length > 200) {
      // Vérifier que l'élément n'est pas principalement composé de liens
      const links = element.find('a')
      const linkText = links.text().length
      const ratio = linkText / text.length

      if (ratio < 0.7) {
        maxTextLength = text.length
        bestElement = element
      }
    }
  })

  return bestElement
}

/**
 * Extrait le titre de la page
 */
function extractTitle($: CheerioAPI, customSelector?: string): string {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) return custom
  }

  // Essayer différentes sources
  const sources = [
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('h1').first().text(),
    $('title').text(),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      return source.trim()
    }
  }

  return 'Sans titre'
}

/**
 * Extrait une métadonnée
 */
function extractMeta(
  $: CheerioAPI,
  metaName: string,
  customSelector?: string
): string | null {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) return custom
  }

  const sources = [
    $(`meta[name="${metaName}"]`).attr('content'),
    $(`meta[property="og:${metaName}"]`).attr('content'),
    $(`meta[property="article:${metaName}"]`).attr('content'),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      return source.trim()
    }
  }

  return null
}

/**
 * Extrait la date de publication
 */
function extractDate($: CheerioAPI, customSelector?: string): Date | null {
  if (customSelector) {
    const custom = $(customSelector).first().text().trim()
    if (custom) {
      const date = parseDate(custom)
      if (date) return date
    }
  }

  // Sources courantes de date
  const sources = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="og:article:published_time"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[name="DC.date"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
    $('time').first().text(),
    $('.date, .post-date, .published, .pub-date').first().text(),
  ]

  for (const source of sources) {
    if (source?.trim()) {
      const date = parseDate(source.trim())
      if (date) return date
    }
  }

  return null
}

/**
 * Parse une date en différents formats
 */
function parseDate(dateStr: string): Date | null {
  // Essayer le format ISO directement
  let date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date
  }

  // Formats courants
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/, // 2024-01-15
    /(\d{2})\/(\d{2})\/(\d{4})/, // 15/01/2024
    /(\d{2})-(\d{2})-(\d{4})/, // 15-01-2024
  ]

  for (const pattern of patterns) {
    const match = dateStr.match(pattern)
    if (match) {
      // Essayer différents ordres jour/mois selon le format
      if (dateStr.includes('/') || dateStr.includes('-')) {
        date = new Date(match[0])
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
  }

  return null
}

/**
 * Extrait les mots-clés
 */
function extractKeywords($: CheerioAPI): string[] {
  const keywords: Set<string> = new Set()

  // Meta keywords
  const metaKeywords = $('meta[name="keywords"]').attr('content')
  if (metaKeywords) {
    metaKeywords.split(',').forEach(k => {
      const trimmed = k.trim()
      if (trimmed) keywords.add(trimmed)
    })
  }

  // Tags
  $('[rel="tag"], .tag, .tags a').each((_, el) => {
    const text = $(el).text().trim()
    if (text && text.length < 50) {
      keywords.add(text)
    }
  })

  return Array.from(keywords).slice(0, 20)
}

/**
 * Détecte la langue de la page
 */
function detectLanguage($: CheerioAPI): string | null {
  // Attribut lang
  const htmlLang = $('html').attr('lang')
  if (htmlLang) {
    return htmlLang.split('-')[0].toLowerCase()
  }

  // Meta language
  const metaLang = $('meta[http-equiv="content-language"]').attr('content')
  if (metaLang) {
    return metaLang.split('-')[0].toLowerCase()
  }

  // Open Graph locale
  const ogLocale = $('meta[property="og:locale"]').attr('content')
  if (ogLocale) {
    return ogLocale.split('_')[0].toLowerCase()
  }

  return null
}

/**
 * Extrait les données structurées (JSON-LD)
 */
function extractStructuredData($: CheerioAPI): Record<string, unknown> | null {
  const scripts = $('script[type="application/ld+json"]')

  if (scripts.length === 0) return null

  const data: Record<string, unknown>[] = []

  scripts.each((_, el) => {
    try {
      const content = $(el).html()
      if (content) {
        const parsed = JSON.parse(content)
        data.push(parsed)
      }
    } catch {
      // Ignorer les JSON invalides
    }
  })

  if (data.length === 0) return null
  if (data.length === 1) return data[0]

  return { '@graph': data }
}

/**
 * Extrait les liens internes
 */
function extractInternalLinks(
  $: CheerioAPI,
  contentElement: Cheerio<Element>,
  baseUrl: URL
): string[] {
  const links: Set<string> = new Set()

  contentElement.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      const linkUrl = new URL(href, baseUrl.origin)

      // Vérifier que c'est le même domaine
      if (linkUrl.hostname !== baseUrl.hostname) return

      // Ignorer les ancres, mailto, tel, javascript
      if (href.startsWith('#') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('javascript:')) {
        return
      }

      // Ignorer les fichiers
      const ext = getFileExtension(linkUrl.pathname)
      if (ext && FILE_EXTENSIONS[ext.toLowerCase()]) return

      // Normaliser l'URL (sans fragment, paramètres de tracking)
      linkUrl.hash = ''
      linkUrl.searchParams.delete('utm_source')
      linkUrl.searchParams.delete('utm_medium')
      linkUrl.searchParams.delete('utm_campaign')
      linkUrl.searchParams.delete('ref')
      linkUrl.searchParams.delete('fbclid')
      linkUrl.searchParams.delete('gclid')

      links.add(linkUrl.href)
    } catch {
      // URL invalide, ignorer
    }
  })

  return Array.from(links)
}

/**
 * Extrait les fichiers liés (PDF, DOCX, etc.)
 * Supporte: liens directs, Google Drive, Dropbox, OneDrive, iframes
 */
function extractLinkedFiles(
  $: CheerioAPI,
  contentElement: Cheerio<Element>,
  baseUrl: URL
): LinkedFile[] {
  const files: LinkedFile[] = []
  const seenUrls = new Set<string>()

  // Helper pour ajouter un fichier sans doublon
  const addFile = (file: LinkedFile) => {
    if (!seenUrls.has(file.url)) {
      seenUrls.add(file.url)
      files.push(file)
    }
  }

  // 1. Liens directs avec extension connue
  contentElement.find('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      const fileUrl = new URL(href, baseUrl.origin)
      const ext = getFileExtension(fileUrl.pathname)

      // Extension directe (.pdf, .docx, etc.)
      if (ext) {
        const fileType = FILE_EXTENSIONS[ext.toLowerCase()]
        if (fileType) {
          const filename = fileUrl.pathname.split('/').pop() || 'file' + ext
          addFile({
            url: fileUrl.href,
            type: fileType,
            filename,
            downloaded: false,
          })
          return
        }
      }

      // 2. Vérifier les patterns cloud (Google Drive, Dropbox, etc.)
      for (const cloudPattern of CLOUD_FILE_PATTERNS) {
        const match = href.match(cloudPattern.pattern)
        if (match) {
          const id = match[1]
          const extra = match[2] || ''
          addFile({
            url: cloudPattern.getUrl(id, extra),
            type: cloudPattern.type,
            filename: cloudPattern.filename(id, extra),
            downloaded: false,
            originalUrl: href, // Garder l'URL originale pour référence
          })
          break
        }
      }
    } catch {
      // URL invalide, ignorer
    }
  })

  // 3. Extraire les documents des iframes
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (!src) return

    try {
      // Google Drive preview/view
      const driveMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/(preview|view)/)
      if (driveMatch) {
        const id = driveMatch[1]
        addFile({
          url: `https://drive.google.com/uc?export=download&id=${id}`,
          type: 'pdf',
          filename: `gdrive_${id}.pdf`,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
        return
      }

      // Google Docs Viewer
      const viewerMatch = src.match(/docs\.google\.com\/viewer\?url=([^&]+)/)
      if (viewerMatch) {
        const docUrl = decodeURIComponent(viewerMatch[1])
        const filename = new URL(docUrl).pathname.split('/').pop() || 'document.pdf'
        addFile({
          url: docUrl,
          type: 'pdf',
          filename,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
        return
      }

      // Google Docs/Sheets/Slides embed
      const docsMatch = src.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
      if (docsMatch) {
        const docType = docsMatch[1]
        const id = docsMatch[2]
        const exportFormats: Record<string, { format: string; ext: string; type: LinkedFile['type'] }> = {
          document: { format: 'pdf', ext: 'pdf', type: 'pdf' },
          spreadsheets: { format: 'xlsx', ext: 'xlsx', type: 'xlsx' },
          presentation: { format: 'pptx', ext: 'pptx', type: 'pptx' },
        }
        const exp = exportFormats[docType]
        if (exp) {
          addFile({
            url: `https://docs.google.com/${docType}/d/${id}/export?format=${exp.format}`,
            type: exp.type,
            filename: `gdoc_${id}.${exp.ext}`,
            downloaded: false,
            originalUrl: src,
            source: 'iframe',
          })
        }
        return
      }

      // Scribd embed
      const scribdMatch = src.match(/scribd\.com\/embeds\/([0-9]+)/)
      if (scribdMatch) {
        addFile({
          url: `https://www.scribd.com/document/${scribdMatch[1]}/download`,
          type: 'pdf',
          filename: `scribd_${scribdMatch[1]}.pdf`,
          downloaded: false,
          originalUrl: src,
          source: 'iframe',
        })
      }
    } catch {
      // Ignorer les erreurs
    }
  })

  // 4. Chercher les liens PDF dans tout le document (pas seulement le contenu principal)
  // Utile pour les blogs où les PDF sont dans la sidebar ou ailleurs
  $('a[href*=".pdf"], a[href*="drive.google.com/file"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return

    try {
      // PDF direct
      if (href.toLowerCase().includes('.pdf')) {
        const fileUrl = new URL(href, baseUrl.origin)
        const filename = fileUrl.pathname.split('/').pop() || 'document.pdf'
        addFile({
          url: fileUrl.href,
          type: 'pdf',
          filename,
          downloaded: false,
          source: 'global',
        })
        return
      }

      // Google Drive
      const driveMatch = href.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (driveMatch) {
        const id = driveMatch[1]
        addFile({
          url: `https://drive.google.com/uc?export=download&id=${id}`,
          type: 'pdf',
          filename: `gdrive_${id}.pdf`,
          downloaded: false,
          originalUrl: href,
          source: 'global',
        })
      }
    } catch {
      // Ignorer
    }
  })

  return files
}

/**
 * Extrait l'extension d'un chemin
 */
function getFileExtension(pathname: string): string | null {
  const lastDot = pathname.lastIndexOf('.')
  if (lastDot === -1) return null

  const ext = pathname.substring(lastDot).toLowerCase()
  // Vérifier que c'est une vraie extension (pas plus de 5 caractères)
  if (ext.length > 6) return null

  return ext
}

/**
 * Extrait le texte propre d'un élément
 */
function extractCleanText(element: Cheerio<Element>): string {
  // Remplacer les balises de bloc par des sauts de ligne
  let text = element.html() || ''

  // Remplacer les balises de bloc par des sauts de ligne
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ') // Supprimer toutes les autres balises
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()

  return text
}

/**
 * Génère un hash SHA256 du contenu
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Génère un hash SHA256 d'une URL (pour déduplication)
 */
export function hashUrl(url: string): string {
  // Normaliser l'URL avant le hash
  try {
    const urlObj = new URL(url)
    urlObj.hash = ''
    urlObj.searchParams.delete('utm_source')
    urlObj.searchParams.delete('utm_medium')
    urlObj.searchParams.delete('utm_campaign')

    return crypto.createHash('sha256').update(urlObj.href).digest('hex')
  } catch {
    return crypto.createHash('sha256').update(url).digest('hex')
  }
}

/**
 * Compte les mots dans un texte
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Nettoie et normalise le texte unicode
 */
export function normalizeText(text: string): string {
  return text
    // Normaliser les caractères unicode composés
    .normalize('NFC')
    // Supprimer les caractères de contrôle
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normaliser les espaces
    .replace(/\s+/g, ' ')
    // Normaliser les tirets
    .replace(/[\u2010-\u2015]/g, '-')
    // Normaliser les apostrophes
    .replace(/[\u2018\u2019\u201B]/g, "'")
    // Normaliser les guillemets
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .trim()
}

/**
 * Détecte la langue d'un texte (simple heuristique)
 */
export function detectTextLanguage(text: string): 'ar' | 'fr' | 'mixed' | null {
  // Compter les caractères arabes
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  // Compter les caractères latins
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length

  const total = arabicChars + latinChars
  if (total < 50) return null // Pas assez de caractères

  const arabicRatio = arabicChars / total
  const latinRatio = latinChars / total

  if (arabicRatio > 0.7) return 'ar'
  if (latinRatio > 0.7) return 'fr'
  if (arabicRatio > 0.3 && latinRatio > 0.3) return 'mixed'

  return latinRatio > arabicRatio ? 'fr' : 'ar'
}
