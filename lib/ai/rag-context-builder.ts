/**
 * Service RAG Context Builder - Construction du contexte pour le LLM
 *
 * Ce module gère:
 * 1. Le calcul des métriques de qualité des sources
 * 2. L'enrichissement des métadonnées des sources
 * 3. La construction du contexte formaté pour le LLM
 * 4. La sanitisation des citations
 */

import { db } from '@/lib/db/postgres'
import { batchEnrichSourcesWithMetadata } from './enhanced-rag-search-service'
import { detectLanguage, DetectedLanguage } from './language-utils'
import { createLogger } from '@/lib/logger'
import { countTokens } from './token-utils'
import type { ChatSource } from './rag-search-service'

const log = createLogger('RAG')

// Limite de tokens pour le contexte RAG (6000 par défaut pour les LLM modernes 8k+)
const RAG_MAX_CONTEXT_TOKENS = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '6000', 10)

// Labels bilingues pour le contexte RAG
const CONTEXT_LABELS = {
  ar: {
    jurisprudence: 'اجتهاد قضائي',
    chamber: 'الغرفة',
    date: 'التاريخ',
    articles: 'الفصول المذكورة',
    na: 'غ/م',
    knowledgeBase: 'قاعدة المعرفة',
    document: 'وثيقة',
    noDocuments: 'لا توجد وثائق ذات صلة.',
    categoryLabels: {
      jurisprudence: 'اجتهاد قضائي',
      code: 'قانون',
      doctrine: 'فقه',
      modele: 'نموذج',
      autre: 'أخرى',
    } as Record<string, string>,
    defaultCategory: 'مرجع',
  },
  fr: {
    jurisprudence: 'Jurisprudence',
    chamber: 'Chambre',
    date: 'Date',
    articles: 'Articles cités',
    na: 'N/D',
    knowledgeBase: 'Base de connaissances',
    document: 'Document',
    noDocuments: 'Aucun document pertinent trouvé.',
    categoryLabels: {
      jurisprudence: 'Jurisprudence',
      code: 'Code',
      doctrine: 'Doctrine',
      modele: 'Modèle',
      autre: 'Autre',
    } as Record<string, string>,
    defaultCategory: 'Référence',
  },
}

/**
 * Calcule les métriques de qualité des sources pour avertir le LLM
 */
export function computeSourceQualityMetrics(sources: ChatSource[]): {
  averageSimilarity: number
  qualityLevel: 'high' | 'medium' | 'low'
  warningMessage: string | null
} {
  if (sources.length === 0) {
    return { averageSimilarity: 0, qualityLevel: 'low', warningMessage: null }
  }
  const avg = sources.reduce((a, s) => a + s.similarity, 0) / sources.length

  if (avg >= 0.70) {
    return { averageSimilarity: avg, qualityLevel: 'high', warningMessage: null }
  }
  if (avg >= 0.55) {
    return {
      averageSimilarity: avg,
      qualityLevel: 'medium',
      warningMessage: `⚠️ AVERTISSEMENT: Les documents ci-dessous ont une pertinence MOYENNE (similarité ~${Math.round(avg * 100)}%). Vérifie leur pertinence thématique avant de les citer. Si aucun ne correspond au domaine de la question, dis-le explicitement.`,
    }
  }
  return {
    averageSimilarity: avg,
    qualityLevel: 'low',
    warningMessage: `🚨 ATTENTION: Les documents ci-dessous ont une FAIBLE pertinence (similarité ~${Math.round(avg * 100)}%).
Ils proviennent probablement d'un domaine juridique DIFFÉRENT de la question posée.

INSTRUCTIONS STRICTES:
1. NE CITE PAS ces sources comme si elles répondaient à la question
2. NE CONSTRUIS PAS de raisonnement juridique basé sur ces sources
3. Indique clairement que la base de connaissances ne contient pas de documents pertinents
4. Fournis des orientations GÉNÉRALES basées sur tes connaissances du droit tunisien
5. Recommande de consulter les textes officiels pour une réponse précise`,
  }
}

/**
 * Enrichit les métadonnées d'une source avec les données structurées de la DB
 */
async function enrichSourceWithStructuredMetadata(source: ChatSource): Promise<any> {
  if (!source.documentId) return source.metadata

  try {
    const result = await db.query(
      `SELECT
        meta.tribunal_code,
        trib_tax.label_ar AS tribunal_label_ar,
        trib_tax.label_fr AS tribunal_label_fr,
        meta.chambre_code,
        chambre_tax.label_ar AS chambre_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        meta.decision_date,
        meta.decision_number,
        meta.legal_basis,
        meta.solution,
        meta.extraction_confidence,
        -- Compteurs relations
        (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = $1 AND validated = true) AS cites_count,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = $1 AND validated = true) AS cited_by_count
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = $1`,
      [source.documentId]
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        ...source.metadata,
        structuredMetadata: {
          tribunalCode: row.tribunal_code,
          tribunalLabelAr: row.tribunal_label_ar,
          tribunalLabelFr: row.tribunal_label_fr,
          chambreCode: row.chambre_code,
          chambreLabelAr: row.chambre_label_ar,
          chambreLabelFr: row.chambre_label_fr,
          decisionDate: row.decision_date,
          decisionNumber: row.decision_number,
          legalBasis: row.legal_basis,
          solution: row.solution,
          extractionConfidence: row.extraction_confidence,
          citesCount: parseInt(row.cites_count || '0', 10),
          citedByCount: parseInt(row.cited_by_count || '0', 10),
        },
      }
    }
  } catch (error) {
    log.error('[RAG Context] Erreur enrichissement métadonnées:', error)
  }

  return source.metadata
}

/**
 * Construit le contexte à partir des sources avec métadonnées enrichies
 *
 * @exported Pour tests unitaires
 */
export async function buildContextFromSources(sources: ChatSource[], questionLang?: DetectedLanguage): Promise<string> {
  // Choisir les labels selon la langue
  const lang = questionLang === 'ar' ? 'ar' : 'fr'
  const labels = CONTEXT_LABELS[lang]

  if (sources.length === 0) {
    return labels.noDocuments
  }

  const contextParts: string[] = []
  let totalTokens = 0
  let sourcesUsed = 0

  // Enrichir sources avec métadonnées structurées (batch - une seule requête SQL)
  const metadataMap = await batchEnrichSourcesWithMetadata(sources)

  const enrichedSources = sources.map((source) => {
    if (!source.documentId) return source

    const batchMetadata = metadataMap.get(source.documentId)
    if (batchMetadata) {
      return {
        ...source,
        metadata: {
          ...source.metadata,
          ...batchMetadata,
        },
      }
    }
    return source
  })

  // Détection de contradictions : si deux sources citent le même numéro d'article
  // avec des dates différentes → avertir le LLM d'utiliser la version la plus récente
  const articleVersionMap = new Map<string, { index: number; date?: string; docName: string }[]>()
  for (let i = 0; i < enrichedSources.length; i++) {
    const s = enrichedSources[i]
    const m = s.metadata as any
    // Détecter numéro d'article dans le contenu ou les métadonnées
    const articleNumMatch = s.chunkContent.match(/(?:الفصل|فصل|Article|Art\.?)\s+(\d+)/i)
    const articleKey = m?.articleNumber || (articleNumMatch ? articleNumMatch[1] : null)
    if (!articleKey) continue
    const existing = articleVersionMap.get(articleKey) || []
    existing.push({ index: i, date: m?.lastVerifiedAt || m?.publicationDate, docName: s.documentName })
    articleVersionMap.set(articleKey, existing)
  }
  const contradictionWarnings: string[] = []
  for (const [artNum, versions] of articleVersionMap.entries()) {
    if (versions.length < 2) continue
    const withDates = versions.filter((v) => v.date)
    if (withDates.length >= 2) {
      const sorted = [...withDates].sort((a, b) => (a.date! > b.date! ? -1 : 1))
      contradictionWarnings.push(
        lang === 'ar'
          ? `⚠️ تنبيه تعارض: الفصل ${artNum} موجود في ${versions.length} مصادر (أحدثها: "${sorted[0].docName}"). استعمل النسخة الأحدث تاريخاً.`
          : `⚠️ Contradiction: الفصل ${artNum} présent dans ${versions.length} sources (plus récente: "${sorted[0].docName}"). Utiliser la version la plus récente.`
      )
    }
  }

  for (let i = 0; i < enrichedSources.length; i++) {
    const source = enrichedSources[i]
    const meta = source.metadata as any
    const sourceType = meta?.type
    const structuredMeta = meta?.structuredMetadata

    // Indicateur de pertinence visible par le LLM
    const relevanceLabel = source.similarity >= 0.75 ? '✅ Très pertinent'
      : source.similarity >= 0.60 ? '⚠️ Pertinence moyenne'
      : '❌ Pertinence faible'
    const relevancePct = `${Math.round(source.similarity * 100)}%`

    // Labels fixes [Source-N], [Juris-N], [KB-N] — compatibles avec le regex frontend
    let part: string
    if (sourceType === 'jurisprudence') {
      // Format enrichi pour jurisprudence
      let enrichedHeader = `[Juris-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`

      // Ajouter métadonnées structurées si disponibles
      if (structuredMeta) {
        const tribunalLabel = lang === 'ar' ? structuredMeta.tribunalLabelAr : structuredMeta.tribunalLabelFr
        const chambreLabel = lang === 'ar' ? structuredMeta.chambreLabelAr : structuredMeta.chambreLabelFr

        enrichedHeader += lang === 'ar' ? '🏛️ ' : '🏛️ '
        enrichedHeader += `${lang === 'ar' ? 'المحكمة' : 'Tribunal'}: ${tribunalLabel || labels.na}\n`

        if (chambreLabel) {
          enrichedHeader += lang === 'ar' ? '⚖️ ' : '⚖️ '
          enrichedHeader += `${labels.chamber}: ${chambreLabel}\n`
        }

        if (structuredMeta.decisionDate) {
          enrichedHeader += '📅 '
          enrichedHeader += `${labels.date}: ${new Date(structuredMeta.decisionDate).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
        }

        if (structuredMeta.decisionNumber) {
          enrichedHeader += lang === 'ar' ? '📋 عدد القرار: ' : '📋 N° décision: '
          enrichedHeader += `${structuredMeta.decisionNumber}\n`
        }

        if (structuredMeta.legalBasis && structuredMeta.legalBasis.length > 0) {
          enrichedHeader += '📚 '
          enrichedHeader += `${labels.articles}: ${structuredMeta.legalBasis.join(', ')}\n`
        }

        if (structuredMeta.solution) {
          enrichedHeader += lang === 'ar' ? '✅ المنطوق: ' : '✅ Solution: '
          enrichedHeader += `${structuredMeta.solution}\n`
        }

        // Relations juridiques
        if (structuredMeta.citesCount > 0 || structuredMeta.citedByCount > 0) {
          enrichedHeader += '🔗 '
          enrichedHeader += lang === 'ar' ? 'علاقات: ' : 'Relations: '
          if (structuredMeta.citesCount > 0) {
            enrichedHeader += lang === 'ar' ? `يشير إلى ${structuredMeta.citesCount}` : `Cite ${structuredMeta.citesCount}`
          }
          if (structuredMeta.citedByCount > 0) {
            if (structuredMeta.citesCount > 0) enrichedHeader += ', '
            enrichedHeader += lang === 'ar' ? `مشار إليه من ${structuredMeta.citedByCount}` : `Cité par ${structuredMeta.citedByCount}`
          }
          enrichedHeader += '\n'
        }
      } else {
        // Fallback sur métadonnées legacy
        enrichedHeader += `${labels.chamber}: ${meta?.chamber || labels.na}, ${labels.date}: ${meta?.date || labels.na}\n`
        enrichedHeader += `${labels.articles}: ${meta?.articles?.join(', ') || labels.na}\n`
      }

      // C3 : Compression intelligente des jurisprudences longues
      // Si le chunk dépasse ~500 mots (≈3000 chars arabes) ET que structuredMeta est disponible
      // → le header contient déjà tribunal/date/décision/solution → on peut tronquer le corps
      const JURIS_BODY_LIMIT_CHARS = 2800
      let jurisBody = source.chunkContent
      if (source.chunkContent.length > JURIS_BODY_LIMIT_CHARS) {
        if (structuredMeta?.solution) {
          // Le dispositif est déjà dans le header → tronquer agressivement (motifs seulement)
          jurisBody = source.chunkContent.slice(0, 1500)
            + (lang === 'ar' ? '\n[...تُرجع المتن إلى المنطوق المذكور أعلاه]' : '\n[...voir dispositif ci-dessus]')
        } else {
          // Pas de solution structurée → garder début + fin (contexte + dispositif)
          jurisBody = source.chunkContent.slice(0, 1800)
            + '\n[...]\n'
            + source.chunkContent.slice(-400)
        }
      }
      part = enrichedHeader + '\n' + jurisBody
    } else if (meta?.sourceType === 'legal_document' || meta?.citationKey) {
      // Format enrichi pour documents juridiques consolidés
      let enrichedHeader = `[KB-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`
      enrichedHeader += `📌 ${lang === 'ar' ? 'المصدر' : 'Source'}: ${meta.codeName || meta.citationKey || source.documentName}\n`

      if (meta.articleNumber) {
        enrichedHeader += `⚖️ ${lang === 'ar' ? 'الفصل' : 'Article'} ${meta.articleNumber}\n`
      }

      if (meta.sourceUrl) {
        enrichedHeader += `🔗 ${lang === 'ar' ? 'الرابط' : 'Lien'}: ${meta.sourceUrl}\n`
      }

      if (meta.lastVerifiedAt) {
        enrichedHeader += `📅 ${lang === 'ar' ? 'آخر تحقق' : 'Dernière vérification'}: ${new Date(meta.lastVerifiedAt).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
      }

      if (meta.isAbrogated) {
        enrichedHeader += `⚠️ ${lang === 'ar' ? 'ملغى' : 'Abrogé'}\n`
      }

      if (meta.amendments && Array.isArray(meta.amendments)) {
        for (const amendment of meta.amendments.slice(0, 3)) {
          enrichedHeader += `🔄 ${lang === 'ar' ? 'تنقيح' : 'Modifié par'}: ${amendment}\n`
        }
      }

      part = enrichedHeader + '\n' + source.chunkContent
    } else if (sourceType === 'knowledge_base') {
      let enrichedHeader = `[KB-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`

      // Badge source officielle JORT
      if (meta?.sourceOrigin === 'iort_gov_tn') {
        enrichedHeader += lang === 'ar' ? '📜 [نص رسمي - الرائد الرسمي]\n' : '📜 [TEXTE OFFICIEL - JORT]\n'
      }

      // Badge document draft/projet (exempter les textes promulgués même si titre contient "مشروع")
      const docName = source.documentName || ''
      // دستور 2022 est la constitution officielle en vigueur — URL 9anoun.tn contient "projet" par legacy
      const isConstitution2022 = docName.includes('دستور') && docName.includes('2022')
      const isPromulgated = meta?.promulgated === true || meta?.sourceOrigin === 'iort_gov_tn' || isConstitution2022
      if (!isPromulgated && (docName.includes('مشروع') || docName.includes('اقتراح'))) {
        enrichedHeader += lang === 'ar' ? '📋 [مشروع / صيغة أولية - غير نهائي]\n' : '📋 [PROJET - version non définitive]\n'
      }

      // C4 : Contexte hiérarchique — injecter sectionHeader si disponible dans les métadonnées
      // (stocké par web-indexer-service lors du chunking adaptatif)
      if (meta?.sectionHeader) {
        enrichedHeader += lang === 'ar' ? `📑 الباب: ${meta.sectionHeader}\n` : `📑 Section: ${meta.sectionHeader}\n`
      }

      // Ajouter métadonnées structurées KB si disponibles
      if (structuredMeta) {
        if (structuredMeta.author) {
          enrichedHeader += lang === 'ar' ? '✍️ المؤلف: ' : '✍️ Auteur: '
          enrichedHeader += `${structuredMeta.author}\n`
        }

        if (structuredMeta.publicationDate) {
          enrichedHeader += '📅 '
          enrichedHeader += `${labels.date}: ${new Date(structuredMeta.publicationDate).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
        }

        if (structuredMeta.keywords && structuredMeta.keywords.length > 0) {
          enrichedHeader += lang === 'ar' ? '🔑 كلمات مفتاحية: ' : '🔑 Mots-clés: '
          enrichedHeader += `${structuredMeta.keywords.join(', ')}\n`
        }
      }

      part = enrichedHeader + '\n' + source.chunkContent
    } else {
      part = `[Source-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n\n` + source.chunkContent
    }

    // ── SPRINT 2 : Avertissement OCR faible confiance ──
    if (meta?.ocr_low_confidence === true) {
      const ocrConf = meta.ocr_page_confidence as number | undefined
      const ocrWarning = lang === 'ar'
        ? `⚠️ مصدر OCR (موثوقية منخفضة${ocrConf !== undefined ? ` - ${ocrConf.toFixed(0)}%` : ''} - يُرجى التحقق من الأصل)\n`
        : `⚠️ Source OCR (fiabilité faible${ocrConf !== undefined ? ` - ${ocrConf.toFixed(0)}%` : ''} - à vérifier sur original)\n`
      part = ocrWarning + part
    }

    // ── SPRINT 3 : Préfixe pour chunks TABLE ──
    if (meta?.chunk_type === 'table') {
      part = `[TABLE]\n${part}`
    }

    const partTokens = countTokens(part)
    const separatorTokens = contextParts.length > 0 ? countTokens('\n\n---\n\n') : 0

    // Vérifier si on dépasse la limite
    if (totalTokens + partTokens + separatorTokens > RAG_MAX_CONTEXT_TOKENS) {
      log.info(`[RAG Context] Limite atteinte: ${sourcesUsed}/${sources.length} sources, ~${totalTokens} tokens`)
      break
    }

    contextParts.push(part)
    totalTokens += partTokens + separatorTokens
    sourcesUsed++
  }

  log.info(`[RAG Context] ${sourcesUsed}/${sources.length} sources, ~${totalTokens} tokens, métadonnées enrichies`)

  // Grouper les sources par type pour faciliter le croisement par le LLM
  // On garde les index originaux pour préserver le numérotage [KB-N]
  const grouped: { codes: string[]; jurisprudence: string[]; doctrine: string[]; other: string[] } = {
    codes: [], jurisprudence: [], doctrine: [], other: [],
  }

  for (let i = 0; i < contextParts.length; i++) {
    const source = enrichedSources[i]
    const meta = source?.metadata as any
    const sourceType = meta?.type
    const category = meta?.category

    if (sourceType === 'jurisprudence') {
      grouped.jurisprudence.push(contextParts[i])
    } else if (category === 'codes' || category === 'codes_juridiques') {
      grouped.codes.push(contextParts[i])
    } else if (category === 'doctrine' || category === 'articles_juridiques') {
      grouped.doctrine.push(contextParts[i])
    } else {
      grouped.other.push(contextParts[i])
    }
  }

  // Si tout est dans "other" (pas de métadonnées type/category), retourner en ordre original
  if (grouped.codes.length === 0 && grouped.jurisprudence.length === 0 && grouped.doctrine.length === 0) {
    return (contradictionWarnings.length > 0 ? contradictionWarnings.join('\n') + '\n\n' : '') + contextParts.join('\n\n---\n\n')
  }

  // Construire le contexte groupé avec headers (réutilise `lang` déjà déclaré plus haut)
  const sections: string[] = []

  if (grouped.codes.length > 0) {
    const header = lang === 'ar' ? '📚 النصوص القانونية' : '📚 Textes juridiques'
    sections.push(`${header}\n\n${grouped.codes.join('\n\n---\n\n')}`)
  }
  if (grouped.jurisprudence.length > 0) {
    const header = lang === 'ar' ? '⚖️ الاجتهاد القضائي' : '⚖️ Jurisprudence'
    sections.push(`${header}\n\n${grouped.jurisprudence.join('\n\n---\n\n')}`)
  }
  if (grouped.doctrine.length > 0) {
    const header = lang === 'ar' ? '📖 الفقه والمقالات' : '📖 Doctrine'
    sections.push(`${header}\n\n${grouped.doctrine.join('\n\n---\n\n')}`)
  }
  if (grouped.other.length > 0) {
    const header = lang === 'ar' ? '📄 مصادر أخرى' : '📄 Autres sources'
    sections.push(`${header}\n\n${grouped.other.join('\n\n---\n\n')}`)
  }

  const contradictionBlock = contradictionWarnings.length > 0
    ? contradictionWarnings.join('\n') + '\n\n'
    : ''

  const mainContext = contradictionBlock + sections.join('\n\n===\n\n')

  // Enrichissement : articles connexes (±2 du même code) pour donner au LLM le contexte réglementaire
  // Uniquement si budget tokens disponible et que des sources ont un articleNumber
  const remainingTokens = RAG_MAX_CONTEXT_TOKENS - totalTokens
  if (remainingTokens > 200) {
    try {
      const adjacent = await fetchAdjacentArticles(enrichedSources, Math.min(remainingTokens - 50, 800))
      if (adjacent.length > 0) {
        const adjHeader = lang === 'ar'
          ? '📎 السياق التشريعي المجاور (فصول مرتبطة — للاستئناس)'
          : '📎 Contexte législatif adjacent (articles connexes — à titre informatif)'
        const adjContent = adjacent.map((a) => `${a.label}:\n${a.content}`).join('\n\n')
        return mainContext + '\n\n===\n\n' + adjHeader + '\n\n' + adjContent
      }
    } catch {
      // Silencieux : le contexte adjacent est optionnel
    }
  }

  return mainContext
}

/**
 * Récupère les articles juridiquement adjacents (±2) aux articles déjà trouvés.
 * Permet au LLM de disposer du contexte réglementaire complet autour d'un article cité.
 *
 * Exemple : si الفصل 258 est trouvé → récupère الفصل 256, 257, 259, 260 du même document.
 */
async function fetchAdjacentArticles(
  sources: ChatSource[],
  maxAdjacentTokens: number = 800
): Promise<{ content: string; label: string }[]> {
  // Collecter les (documentId, articleNumber) avec numéro entier parseable
  const articleSources: Array<{ documentId: string; articleNum: number }> = []
  const seenDocs = new Set<string>()

  for (const source of sources) {
    const meta = source.metadata as any
    const rawArticle = meta?.articleNumber as string | undefined
    if (!rawArticle || !source.documentId) continue
    // Extraire la partie numérique (ex: "42 bis" → 42, "258 مكرر" → 258)
    const numMatch = rawArticle.match(/^(\d+)/)
    if (!numMatch) continue
    const articleNum = parseInt(numMatch[1], 10)
    if (isNaN(articleNum) || seenDocs.has(source.documentId)) continue
    seenDocs.add(source.documentId)
    articleSources.push({ documentId: source.documentId, articleNum })
  }

  if (articleSources.length === 0) return []

  const adjacentChunks: { content: string; label: string }[] = []
  let tokensUsed = 0

  for (const { documentId, articleNum } of articleSources.slice(0, 3)) {
    try {
      // Récupérer les chunks adjacents (±2 articles) du même document
      const result = await db.query(
        `SELECT chunk_content, metadata->>'articleNumber' AS article_num
         FROM knowledge_base_chunks kbc
         JOIN knowledge_base kb ON kb.id = kbc.kb_id
         WHERE kbc.kb_id = $1
           AND kb.is_indexed = true
           AND (metadata->>'articleNumber') IS NOT NULL
           AND (metadata->>'articleNumber') ~ '^\\d'
           AND CAST(REGEXP_REPLACE(metadata->>'articleNumber', '[^0-9].*$', '') AS INTEGER)
               BETWEEN $2 AND $3
           AND CAST(REGEXP_REPLACE(metadata->>'articleNumber', '[^0-9].*$', '') AS INTEGER) != $4
         ORDER BY CAST(REGEXP_REPLACE(metadata->>'articleNumber', '[^0-9].*$', '') AS INTEGER)
         LIMIT 4`,
        [documentId, articleNum - 2, articleNum + 2, articleNum]
      )

      for (const row of result.rows) {
        const chunkTokens = countTokens(row.chunk_content)
        if (tokensUsed + chunkTokens > maxAdjacentTokens) break
        const truncated = row.chunk_content.slice(0, 300)
        adjacentChunks.push({
          label: `الفصل ${row.article_num}`,
          content: truncated + (row.chunk_content.length > 300 ? '...' : ''),
        })
        tokensUsed += chunkTokens
      }
    } catch {
      // Pas de panic si la requête échoue (ex: regex DB non supporté)
    }
  }

  return adjacentChunks
}

/**
 * Supprime les citations dont le numéro dépasse le nombre de sources réelles.
 * Empêche le LLM d'halluciner des [Source-5] quand il n'y a que 3 sources.
 *
 * @exported Pour tests unitaires
 */
export function sanitizeCitations(answer: string, sourceCount: number): string {
  return answer.replace(
    /\[(Source|KB|Juris)-?(\d+)\]/g,
    (fullMatch, _type: string, numStr: string) => {
      const num = parseInt(numStr, 10)
      return (num >= 1 && num <= sourceCount) ? fullMatch : ''
    }
  )
}
