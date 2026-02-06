/**
 * Service de génération de documents DOCX éditables
 * Utilise la librairie 'docx' pour créer des fichiers Word
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  PageOrientation,
  convertInchesToTwip,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'

// =============================================================================
// TYPES
// =============================================================================

export interface DocxGeneratorOptions {
  title: string
  content: string
  variables: Record<string, string>
  language?: 'fr' | 'ar'
  headerText?: string
  footerText?: string
  showDate?: boolean
}

export interface DocxResult {
  buffer: Buffer
  filename: string
}

// =============================================================================
// CONFIGURATION STYLES
// =============================================================================

const STYLES = {
  fr: {
    fontFamily: 'Times New Roman',
    titleSize: 32, // 16pt
    headingSize: 28, // 14pt
    bodySize: 24, // 12pt
    lineSpacing: 276, // 1.15 line spacing
  },
  ar: {
    fontFamily: 'Traditional Arabic',
    titleSize: 36, // 18pt
    headingSize: 32, // 16pt
    bodySize: 28, // 14pt
    lineSpacing: 300, // 1.25 line spacing for Arabic
  },
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Remplace les variables dans le contenu
 * Supporte {{variable}} et {variable}
 */
function replaceVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content

  for (const [key, value] of Object.entries(variables)) {
    // Remplacer {{variable}}
    const doubleRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(doubleRegex, value || '')

    // Remplacer {variable}
    const singleRegex = new RegExp(`\\{${key}\\}`, 'g')
    result = result.replace(singleRegex, value || '')
  }

  return result
}

/**
 * Détecte si le texte contient de l'arabe
 */
function containsArabic(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/
  return arabicRegex.test(text)
}

/**
 * Parse le contenu en paragraphes et détecte les titres
 */
function parseContent(content: string): Array<{
  type: 'title' | 'heading' | 'subheading' | 'body' | 'signature' | 'empty'
  text: string
  isBold?: boolean
  isUnderline?: boolean
  alignment?: 'left' | 'center' | 'right' | 'justify'
}> {
  const lines = content.split('\n')
  const parsed: Array<{
    type: 'title' | 'heading' | 'subheading' | 'body' | 'signature' | 'empty'
    text: string
    isBold?: boolean
    isUnderline?: boolean
    alignment?: 'left' | 'center' | 'right' | 'justify'
  }> = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      parsed.push({ type: 'empty', text: '' })
      continue
    }

    // Détection des titres (lignes en majuscules ou avec === ou ---)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.includes('---')) {
      parsed.push({
        type: 'title',
        text: trimmed,
        isBold: true,
        alignment: 'center',
      })
      continue
    }

    // Détection des sous-titres (commence par I., II., 1., 2., Article, etc.)
    if (/^(I+\.|[0-9]+\.|Article|ARTICLE|Attendu|VU|Vu)/i.test(trimmed)) {
      parsed.push({
        type: 'heading',
        text: trimmed,
        isBold: true,
        alignment: 'left',
      })
      continue
    }

    // Détection signature (Fait à..., Le Conseil, L'Avocat, etc.)
    if (/^(Fait à|Le Conseil|L'Avocat|Signature|المحامي|التوقيع)/i.test(trimmed)) {
      parsed.push({
        type: 'signature',
        text: trimmed,
        alignment: 'right',
      })
      continue
    }

    // Lignes de séparation
    if (trimmed.match(/^[-=_]{3,}$/)) {
      parsed.push({ type: 'empty', text: '' })
      continue
    }

    // Corps du texte
    parsed.push({
      type: 'body',
      text: trimmed,
      alignment: 'justify',
    })
  }

  return parsed
}

/**
 * Crée un paragraphe DOCX avec le style approprié
 */
function createParagraph(
  item: {
    type: 'title' | 'heading' | 'subheading' | 'body' | 'signature' | 'empty'
    text: string
    isBold?: boolean
    isUnderline?: boolean
    alignment?: 'left' | 'center' | 'right' | 'justify'
  },
  style: typeof STYLES.fr,
  isRTL: boolean
): Paragraph {
  if (item.type === 'empty') {
    return new Paragraph({
      children: [],
      spacing: { after: 120 },
    })
  }

  let fontSize = style.bodySize
  let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined

  switch (item.type) {
    case 'title':
      fontSize = style.titleSize
      headingLevel = HeadingLevel.HEADING_1
      break
    case 'heading':
      fontSize = style.headingSize
      headingLevel = HeadingLevel.HEADING_2
      break
    case 'subheading':
      fontSize = style.headingSize - 2
      headingLevel = HeadingLevel.HEADING_3
      break
    case 'signature':
      fontSize = style.bodySize
      break
  }

  let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.JUSTIFIED

  switch (item.alignment) {
    case 'center':
      alignment = AlignmentType.CENTER
      break
    case 'right':
      alignment = AlignmentType.RIGHT
      break
    case 'left':
      alignment = AlignmentType.LEFT
      break
    case 'justify':
      alignment = AlignmentType.JUSTIFIED
      break
  }

  // Pour l'arabe RTL, inverser left/right
  if (isRTL) {
    if (alignment === AlignmentType.LEFT) {
      alignment = AlignmentType.RIGHT
    } else if (alignment === AlignmentType.RIGHT) {
      alignment = AlignmentType.LEFT
    }
  }

  return new Paragraph({
    children: [
      new TextRun({
        text: item.text,
        font: style.fontFamily,
        size: fontSize,
        bold: item.isBold,
        underline: item.isUnderline ? {} : undefined,
        rightToLeft: isRTL,
      }),
    ],
    heading: headingLevel,
    alignment,
    spacing: {
      after: item.type === 'title' ? 240 : 120,
      line: style.lineSpacing,
    },
    bidirectional: isRTL,
  })
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Génère un document DOCX à partir d'un template
 */
export async function generateDocx(options: DocxGeneratorOptions): Promise<DocxResult> {
  const {
    title,
    content,
    variables,
    language = 'fr',
    headerText,
    footerText,
    showDate = true,
  } = options

  // Remplacer les variables
  const processedContent = replaceVariables(content, variables)

  // Détecter si c'est un document arabe
  const isArabic = language === 'ar' || containsArabic(processedContent)
  const style = isArabic ? STYLES.ar : STYLES.fr

  // Parser le contenu
  const parsedContent = parseContent(processedContent)

  // Créer les paragraphes
  const paragraphs: Paragraph[] = []

  // En-tête avec titre du document
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          font: style.fontFamily,
          size: style.titleSize + 4,
          bold: true,
          rightToLeft: isArabic,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      bidirectional: isArabic,
    })
  )

  // Date si demandée
  if (showDate) {
    const dateStr = new Date().toLocaleDateString(isArabic ? 'ar-TN' : 'fr-TN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: dateStr,
            font: style.fontFamily,
            size: style.bodySize - 2,
            italics: true,
            rightToLeft: isArabic,
          }),
        ],
        alignment: isArabic ? AlignmentType.LEFT : AlignmentType.RIGHT,
        spacing: { after: 300 },
        bidirectional: isArabic,
      })
    )
  }

  // Ligne de séparation
  paragraphs.push(
    new Paragraph({
      children: [],
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: '000000',
        },
      },
      spacing: { after: 300 },
    })
  )

  // Contenu du document
  for (const item of parsedContent) {
    paragraphs.push(createParagraph(item, style, isArabic))
  }

  // Créer le document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: paragraphs,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: style.fontFamily,
            size: style.bodySize,
          },
        },
      },
    },
  })

  // Générer le buffer
  const buffer = await Packer.toBuffer(doc)

  // Générer le nom de fichier
  const sanitizedTitle = title
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `${sanitizedTitle}_${timestamp}.docx`

  return {
    buffer: Buffer.from(buffer),
    filename,
  }
}

/**
 * Génère un document DOCX à partir d'un template de base de données
 */
export async function generateDocxFromTemplate(
  template: {
    titre: string
    contenu: string
    type_document: string
  },
  variables: Record<string, string>,
  language?: 'fr' | 'ar'
): Promise<DocxResult> {
  return generateDocx({
    title: template.titre,
    content: template.contenu,
    variables,
    language: language || (containsArabic(template.contenu) ? 'ar' : 'fr'),
    showDate: true,
  })
}
