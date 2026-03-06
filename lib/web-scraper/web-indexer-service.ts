/**
 * Service d'indexation des pages web dans le RAG
 * Convertit les pages web en documents de la base de connaissances
 */

import { db } from '@/lib/db/postgres'
import type { WebPage, WebSource } from './types'
import { isSemanticSearchEnabled, aiConfig, KB_ARABIC_ONLY, EMBEDDING_TURBO_CONFIG } from '@/lib/ai/config'
import { normalizeText, detectTextLanguage } from './content-extractor'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { NINEANOUN_KB_SECTIONS, NINEANOUN_CODE_DOMAINS, NINEANOUN_OTHER_SECTIONS } from './9anoun-code-domains'
import type { NormLevel } from '@/lib/categories/norm-levels'
import { withRetry, isRetryableError } from './retry-utils'

// Concurrence pour l'indexation de pages (1 = séquentiel, safe pour Ollama)
const WEB_INDEXING_CONCURRENCY = parseInt(process.env.WEB_INDEXING_CONCURRENCY || '1', 10)

// =============================================================================
// FIABILITÉ SOURCE — Dérivation de l'origine et du niveau normatif
// =============================================================================

/**
 * Dérive l'identifiant d'origine de la source à partir de l'URL de base.
 * Stocké dans metadata.sourceOrigin pour le re-ranking RAG.
 */
export function deriveSourceOrigin(baseUrl: string): string {
  const url = (baseUrl || '').toLowerCase()
  if (url.includes('iort.gov.tn') || url.includes('iort.tn')) return 'iort_gov_tn'
  if (url.includes('justice.gov.tn')) return 'justice_gov_tn'
  if (url.includes('9anoun.tn')) return '9anoun_tn'
  if (url.includes('cassation.tn')) return 'cassation_tn'
  if (url.includes('google')) return 'google_drive'
  return 'autre'
}

/**
 * Mapping textType IORT (arabe) → norm_level de la pyramide de Kelsen.
 * Utilisé pour enrichir les métadonnées KB lors de l'indexation.
 */
const IORT_TEXTTYPE_TO_NORM_LEVEL: Record<string, NormLevel> = {
  'دستور': 'constitution',       // Constitution tunisienne (×1.35 boost RAG)
  'قانون أساسي': 'loi_organique',
  'قانون': 'loi_ordinaire',
  'مجلة': 'loi_ordinaire',
  'مرسوم': 'marsoum',
  'أمر': 'ordre_reglementaire',
  'قرار': 'arrete_ministeriel',
  'رإي': 'arrete_ministeriel',   // avis à niveau arreté par défaut
}

/**
 * Dérive le norm_level à partir du textType IORT stocké dans structured_data.
 * Retourne null si inconnu ou non-IORT.
 */
export function deriveNormLevelFromIortTextType(textType: string | undefined): NormLevel | null {
  if (!textType) return null
  return IORT_TEXTTYPE_TO_NORM_LEVEL[textType] ?? null
}

// =============================================================================
// TYPES POUR CLASSIFICATION
// =============================================================================

/**
 * Classification IA d'une page (depuis legal_classifications)
 */
interface PageClassification {
  primary_category: LegalCategory
  confidence_score: number
  signals_used: string[] | null
}

/**
 * Détecte la catégorie KB à partir du pattern URL (9anoun.tn)
 * Utilise NINEANOUN_KB_SECTIONS, NINEANOUN_CODE_DOMAINS et NINEANOUN_OTHER_SECTIONS
 */
function detectCategoryFromUrl(url: string): LegalCategory | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)

    // Pattern /kb/{section}/... → NINEANOUN_KB_SECTIONS
    if (pathParts[0] === 'kb' && pathParts.length >= 2) {
      const section = pathParts[1]

      // Check KB sections (jurisprudence, doctrine, jorts, constitutions, conventions, lois)
      if (NINEANOUN_KB_SECTIONS[section]) {
        return NINEANOUN_KB_SECTIONS[section].primaryCategory as LegalCategory
      }

      // Check codes (/kb/codes/{slug})
      if (section === 'codes' && pathParts.length >= 3) {
        const slug = pathParts[2]
        if (NINEANOUN_CODE_DOMAINS[slug]) {
          return 'codes' as LegalCategory
        }
      }
    }

    // Pattern /{section}/... → NINEANOUN_OTHER_SECTIONS (modeles, formulaires)
    if (pathParts.length >= 1 && NINEANOUN_OTHER_SECTIONS[pathParts[0]]) {
      return NINEANOUN_OTHER_SECTIONS[pathParts[0]].primaryCategory as LegalCategory
    }
  } catch {
    // URL invalide → pas de détection
  }

  return null
}

/**
 * Détermine la catégorie KB basée sur la classification IA, puis fallback URL pattern
 * 1. Classification IA (si disponible)
 * 2. Pattern URL (9anoun.tn sections)
 * 3. "autre" + flag review
 */
function determineCategoryForKB(
  classification: PageClassification | null,
  pageUrl?: string,
  detectedCategory?: string | null
): { category: LegalCategory; source: string } {
  // Cas 0 : Catégorie détectée par Option A/B (URL patterns crawl-time)
  if (detectedCategory) {
    return { category: detectedCategory as LegalCategory, source: 'detected' }
  }

  // Cas 1 : Classification IA disponible → utiliser primary_category
  if (classification?.primary_category) {
    return { category: classification.primary_category, source: 'ai' }
  }

  // Cas 2 : Détection par pattern URL
  if (pageUrl) {
    const urlCategory = detectCategoryFromUrl(pageUrl)
    if (urlCategory) {
      return { category: urlCategory, source: 'url_pattern' }
    }
  }

  // Cas 3 : Pas de classification → "autre" + flag review
  return { category: 'autre', source: 'default' }
}

// Import dynamique pour éviter les dépendances circulaires
async function getChunkingService() {
  const { chunkText, getOverlapForCategory } = await import('@/lib/ai/chunking-service')
  return { chunkText, getOverlapForCategory }
}

async function getEmbeddingsService() {
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('@/lib/ai/embeddings-service')
  return { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres }
}

// =============================================================================
// TYPES
// =============================================================================

export interface IndexingResult {
  success: boolean
  knowledgeBaseId?: string
  chunksCreated: number
  error?: string
}

// =============================================================================
// INDEXATION
// =============================================================================

/**
 * Indexe une page web dans la base de connaissances
 */
export async function indexWebPage(pageId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Récupérer la page + classification IA
  const pageResult = await db.query(
    `SELECT
       wp.*,
       (ws.categories)[1] as source_category,
       ws.name as source_name,
       ws.base_url as source_base_url,
       ws.rag_enabled as source_rag_enabled,
       COALESCE(ws.min_word_count, 30) as source_min_word_count,
       lc.primary_category,
       lc.confidence_score,
       lc.signals_used
     FROM web_pages wp
     JOIN web_sources ws ON wp.web_source_id = ws.id
     LEFT JOIN legal_classifications lc ON wp.id = lc.web_page_id
     WHERE wp.id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Page non trouvée' }
  }

  // Guard: skip si la source parente est désactivée pour le RAG
  if (pageResult.rows[0].source_rag_enabled === false) {
    console.log(`[WebIndexer] Page ${pageId} ignorée — source désactivée (rag_enabled=false)`)
    return { success: false, chunksCreated: 0, error: 'Source désactivée pour le RAG (rag_enabled=false)' }
  }

  const row = pageResult.rows[0]

  const wordCount = row.extracted_text?.trim().split(/\s+/).filter(Boolean).length ?? 0
  const minWordCount: number = row.source_min_word_count ?? 30
  if (!row.extracted_text || wordCount < minWordCount) {
    return { success: false, chunksCreated: 0, error: `Contenu insuffisant pour indexation (${wordCount} mots < ${minWordCount})` }
  }

  // Guard : articles abrogés sur 9anoun.tn (P3.4 Mar 2026)
  // Pages dont le titre ou le contenu indique explicitement l'abrogation → skip indexation.
  // Évite de créer des chunks "header-only" qui seront de toute façon filtrés lors du chunking.
  const ABROGATION_TITLE_PATTERNS = [
    /\bملغى\b/,           // "ملغى" dans le titre arabe
    /\(abrogé\)/i,        // "(abrogé)" dans le titre français
    /\[abrogé\]/i,
    /\bابrogé\b/i,
  ]
  const ABROGATION_CONTENT_PATTERNS = [
    /^(الفصل|Article)\s+\d+\s*[\r\n]+\s*ملغى\s*\.?\s*$/m,   // Article X\nملغى
    /^(الفصل|Article)\s+\d+\s*:\s*ملغى\s*\.?\s*$/m,         // Article X: ملغى
  ]
  const rawPageTitle = row.title || ''
  const rawPageText = row.extracted_text || ''
  const isTitleAbrogated = ABROGATION_TITLE_PATTERNS.some(p => p.test(rawPageTitle))
  const isContentAbrogated = ABROGATION_CONTENT_PATTERNS.some(p => p.test(rawPageText.slice(0, 500)))
  if (isTitleAbrogated || isContentAbrogated) {
    console.log(`[WebIndexer] Skip page abrogée ${pageId} (${row.url}) — titre="${rawPageTitle.slice(0, 60)}"`)
    return { success: true, chunksCreated: 0, error: 'Article abrogé — indexation ignorée' }
  }

  // Extraire la classification IA (si disponible)
  const classification: PageClassification | null = row.primary_category
    ? {
        primary_category: row.primary_category,
        confidence_score: row.confidence_score || 0,
        signals_used: row.signals_used,
      }
    : null

  // Dériver l'origine de la source (pour boost fiabilité RAG)
  const sourceOrigin = deriveSourceOrigin(row.source_base_url || '')

  // Dériver le norm_level si source IORT (structured_data.textType)
  const iortStructuredData = row.structured_data || {}
  const normLevel = sourceOrigin === 'iort_gov_tn'
    ? deriveNormLevelFromIortTextType(iortStructuredData.textType as string | undefined)
    : null

  // Déterminer la catégorie KB (detected_category → IA → URL pattern → "autre")
  // Override : IORT textType='دستور' → forcer 'constitution' (classification IA échoue sur OCR brut)
  const { category: rawKbCategory, source: classificationSource } = determineCategoryForKB(classification, row.url, row.detected_category)
  const kbCategory = (normLevel === 'constitution') ? 'constitution' : rawKbCategory

  // Guard : قرارات et أوامر IORT de bruit (nominations, concours, mutations) → rag_enabled=false
  // Ces actes n'ont aucune valeur juridique pour un avocat mais polluent le RAG.
  const IORT_NOISE_PATTERNS = [
    /\b(تعيين|تسمية|تنصيب)\b/,                          // nominations / désignations
    /\b(تنقيل|إنهاء مهام|إعفاء من مهام)\b/,              // mutations / révocations
    /\b(إحالة على التقاعد)\b/,                            // retraites
    /\b(مناظرة|توظيف|انتداب|استقطاب)\b/,                 // concours / recrutement
    /\b(ترقية بالاختيار|ترقية في الرتبة|ترقية في الدرجة)\b/, // promotions administratives
    /\b(استيداع|إسناد رتبة)\b/,                           // disponibilité / attribution grade
    /\b(يُعيَّن|تُعيَّن|يُنقَّل|تُنقَّل)\b/,             // passif nomination/mutation dans titre
    /\b(يُرقَّى|تُرقَّى|يُنتدَب|تُنتدَب)\b/,             // passif promotion/détachement dans titre
    /\b(يُحال|تُحال)\s+على\s+التقاعد\b/,                 // passif retraite dans titre
    /\b(وسام|نيشان)\b/,                                   // décorations / médailles (aucune valeur juridique)
    /\b(والي|معتمد أول)\b/,                               // grades civils nommés par décret présidentiel
  ]
  // Patterns détectés dans le CORPS du texte (verbes/noms de nomination absents du titre)
  const IORT_CONTENT_NOISE_PATTERNS = [
    /\b(يُسمَّى|تُسمَّى|يسمّى|تسمّى|سُمِّيَ)\b/,           // formes verbales "est nommé(e)"
    /\b(يُكلَّف|تُكلَّف|كُلِّفَ|كُلِّفَت|تكلف بمهام)\b/,    // formes verbales "est chargé(e)"
    /\b(تُسند|يُسند|أُسندت|أُسند)\b/,                        // formes verbales "est confié(e)"
    /\b(يُعيَّن|تُعيَّن|يُنقَّل|تُنقَّل)\b/,                 // passif nomination/mutation dans corps
    /\b(يُرقَّى|تُرقَّى|يُنتدَب|تُنتدَب)\b/,                 // passif promotion/détachement dans corps
    /\b(يُحال|تُحال)\s+على\s+التقاعد\b/,                     // passif retraite dans corps
    /\bالسيدة\s+[\u0600-\u06FF]{2,}/,                        // "السيدة [Prénom]" — femme nommée
    /\b(العقيد|العميد|اللواء|الرائد|النقيب|المقدم)\b/,        // grades militaires
    /\b(وسام|نيشان)\b/,                                       // décorations dans corps
    /\b(والي|معتمد أول)\b/,                                   // grades civils de nomination dans corps
    /\b(شروط الترشح|ملف الترشح)\b/,                          // détails concours dans corps du texte
  ]
  // S'applique aux قرارات, أوامر ET مراسيم (nominations présidentielles par décret)
  const isIortNoiseType = sourceOrigin === 'iort_gov_tn' &&
    ['قرار', 'أمر', 'مرسوم'].includes(iortStructuredData.textType as string)
  const contentSnippet = (row.extracted_text || '').slice(0, 600)
  const isNoise = isIortNoiseType && (
    IORT_NOISE_PATTERNS.some(p => p.test(rawPageTitle)) ||
    IORT_CONTENT_NOISE_PATTERNS.some(p => p.test(contentSnippet))
  )
  if (isNoise) {
    console.log(`[WebIndexer] ${iortStructuredData.textType} bruit IORT — rag_enabled=false: "${rawPageTitle.slice(0, 80)}"`)
  }

  // Normaliser le texte
  const normalizedText = normalizeText(row.extracted_text)
  const detectedLang = row.language_detected || detectTextLanguage(normalizedText) || 'fr'

  // Fix titre corrompu (noms fichiers Google Drive avec caractères arabes → underscores ou noms 8.3)
  let pageTitle = row.title || row.url
  const isCorruptedTitle = pageTitle && (
    /_{3,}/.test(pageTitle) ||                         // underscores (arabe corrompu)
    /^[A-F0-9~]+\.\w{3,4}$/i.test(pageTitle) ||       // noms 8.3 (A71E~D.DOC)
    (/\.\w{3,4}$/.test(pageTitle) && !/[\u0600-\u06FF]/.test(pageTitle) && pageTitle.length < 30) // fichier court sans arabe
  )
  if (isCorruptedTitle) {
    const lines = normalizedText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 5)
    if (lines.length > 0) {
      pageTitle = lines[0].substring(0, 200)
    }
  }

  // Persister language_detected si manquant (évite re-détection à chaque cron)
  if (!row.language_detected && detectedLang) {
    db.query(
      'UPDATE web_pages SET language_detected = $1 WHERE id = $2',
      [detectedLang, pageId]
    ).catch(() => {})
  }

  // Stratégie arabe uniquement : ignorer le contenu non-arabe
  // Exception: Google Drive accepte français et mixte
  // NOTE : On utilise source_category pour ce check technique (propriété de la source)
  const isGoogleDrive = row.source_category === 'google_drive'
  if (KB_ARABIC_ONLY && !isGoogleDrive && detectedLang !== 'ar') {
    console.log(`[WebIndexer] Contenu non-arabe ignoré: page ${pageId} (${detectedLang})`)
    return { success: false, chunksCreated: 0, error: `Contenu non-arabe ignoré (${detectedLang})` }
  }

  // Seules les langues 'ar' et 'fr' sont supportées dans knowledge_base
  const language: 'ar' | 'fr' = KB_ARABIC_ONLY ? 'ar' : ((detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr')

  // Import des services
  const { chunkText, getOverlapForCategory } = await getChunkingService()
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Déterminer l'overlap selon la catégorie KB (basée sur le contenu)
  const overlap = getOverlapForCategory(kbCategory)

  // Découper en chunks selon la catégorie KB
  // - justice_gov_tn : stratégie 'page' — split sur marqueurs --- Page X --- (PDFs OCR procéduraux)
  // - IORT + codes/legislation/constitution : stratégie 'article' — détecte "الفصل X" / "Article X"
  // - Autres : stratégie 'adaptive' (par taille + paragraphes)
  const chunkingStrategy =
    sourceOrigin === 'justice_gov_tn'
      ? 'page'
      : (sourceOrigin === 'iort_gov_tn' || ['codes', 'legislation', 'constitution'].includes(kbCategory))
        ? 'article'
        : 'adaptive'

  // Pour les stratégies article et page, préserver les '\n' via normalizeText({ preserveNewlines: true })
  // pour la détection des marqueurs الفصل/Article et --- Page X ---.
  // PIÈGE IORT : le scraper extrait les textes sans \n → injecter des \n avant chaque الفصل/Article.
  const needsNewlines = chunkingStrategy === 'article' || chunkingStrategy === 'page'
  let textForChunking = normalizeText(
    (row.extracted_text || '').replace(/\r\n/g, '\n'),
    { preserveNewlines: needsNewlines }
  )
  if (chunkingStrategy === 'article' && sourceOrigin === 'iort_gov_tn') {
    textForChunking = textForChunking
      .replace(/(?<!\n)(الفصل\s+)/g, '\n$1')
      .replace(/(?<!\n)(Article\s+)/g, '\n$1')
  }

  const chunks = chunkText(textForChunking, {
    chunkSize: aiConfig.rag.chunkSize,
    overlap,
    preserveParagraphs: true,
    preserveSentences: true,
    category: kbCategory, // Catégorie basée sur le contenu (classification IA)
    strategy: chunkingStrategy,
  })

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  // Vérifier si un document KB existe déjà pour cette page
  let knowledgeBaseId = row.knowledge_base_id
  const wasUpdate = !!knowledgeBaseId

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // Verrouiller la page pour éviter l'indexation concurrente (SKIP LOCKED = pas de blocage)
    const lockResult = await client.query(
      `SELECT id FROM web_pages WHERE id = $1 AND is_indexed = false FOR UPDATE SKIP LOCKED`,
      [pageId]
    )
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return { success: true, chunksCreated: 0, error: 'Page déjà indexée ou en cours d\'indexation' }
    }

    // Créer ou mettre à jour le document KB
    if (!knowledgeBaseId) {
      // Créer un nouveau document KB avec classification IA pure
      // Pipeline supervisé: nouveau doc → pipeline_stage = 'crawled', pas d'indexation auto
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, subcategory, language, title, description,
          metadata, tags, full_text, source_file, is_indexed,
          rag_enabled, pipeline_stage, pipeline_stage_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, 'crawled', NOW())
        RETURNING id`,
        [
          kbCategory, // ← Classification IA pure (pas de fallback source)
          null, // subcategory
          language,
          pageTitle,
          row.meta_description,
          JSON.stringify({
            source: 'web_scraper',
            sourceId: row.web_source_id,
            sourceName: row.source_name,
            sourceOrigin,               // 'iort_gov_tn' | '9anoun_tn' | 'cassation_tn' | ...
            ...(normLevel ? { normLevel } : {}), // Niveau normatif IORT (si détecté)
            pageId: pageId,
            url: row.url,
            author: row.meta_author,
            publishedAt: row.meta_date,
            crawledAt: row.last_crawled_at,
            // Tracking classification pour audit
            classification_source: classificationSource,
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: classificationSource === 'default', // Flag si ni IA ni URL pattern
          }),
          row.meta_keywords || [],
          normalizedText,
          row.url,
          !isNoise, // rag_enabled = false pour قرارات bruit (nominations, concours, mutations)
        ]
      )
      knowledgeBaseId = kbResult.rows[0].id
    } else {
      // Créer une version avant la mise à jour (historique)
      try {
        await client.query(
          `INSERT INTO knowledge_base_versions
           (knowledge_base_id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, changed_by, change_reason, change_type)
           SELECT id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, NULL,
            'Mise à jour automatique - contenu source modifié', 'content_update'
           FROM knowledge_base WHERE id = $1`,
          [knowledgeBaseId]
        )
      } catch (versionError) {
        // Ne pas bloquer l'indexation si le versioning échoue
        console.warn(`[WebIndexer] Erreur versioning KB ${knowledgeBaseId}:`, versionError)
      }

      // Mettre à jour le document existant + incrémenter version
      const updateResult = await client.query(
        `UPDATE knowledge_base SET
          title = $2,
          description = $3,
          language = $4,
          full_text = $5,
          metadata = metadata || $6::jsonb,
          category = $7,
          is_indexed = false,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1`,
        [
          knowledgeBaseId,
          pageTitle,
          row.meta_description,
          language,
          normalizedText,
          JSON.stringify({
            lastCrawledAt: row.last_crawled_at,
            updatedAt: new Date().toISOString(),
            sourceOrigin,               // Mise à jour si source change
            ...(normLevel ? { normLevel } : {}),
            // Tracking classification (mise à jour si classification changée)
            classification_source: classificationSource,
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: classificationSource === 'default',
          }),
          kbCategory, // Mettre à jour la catégorie (ex: 'constitution' pour IORT دستور)
        ]
      )

      if ((updateResult.rowCount ?? 0) === 0) {
        // Référence périmée : le doc KB a été supprimé mais web_pages.knowledge_base_id
        // pointe encore dessus. Créer un nouveau doc KB.
        console.warn(`[WebIndexer] KB doc ${knowledgeBaseId} introuvable — création d'un nouveau`)
        const kbResult = await client.query(
          `INSERT INTO knowledge_base (
            category, subcategory, language, title, description,
            metadata, tags, full_text, source_file, is_indexed,
            rag_enabled, pipeline_stage, pipeline_stage_updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, 'crawled', NOW())
          RETURNING id`,
          [
            kbCategory,
            null,
            language,
            pageTitle,
            row.meta_description,
            JSON.stringify({
              source: 'web_scraper',
              sourceId: row.web_source_id,
              sourceName: row.source_name,
              sourceOrigin,
              ...(normLevel ? { normLevel } : {}),
              pageId: pageId,
              url: row.url,
              author: row.meta_author,
              publishedAt: row.meta_date,
              crawledAt: row.last_crawled_at,
              classification_source: classificationSource,
              classification_confidence: classification?.confidence_score || null,
              classification_signals: classification?.signals_used || null,
              needs_review: classificationSource === 'default',
            }),
            row.meta_keywords || [],
            normalizedText,
            row.url,
            !isNoise,
          ]
        )
        knowledgeBaseId = kbResult.rows[0].id
      } else {
        // Supprimer les anciens chunks (seulement si le KB doc existait)
        await client.query(
          'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [knowledgeBaseId]
        )
      }
    }

    // Générer les embeddings avec retry (résilience si Ollama tombe temporairement)
    const EMBEDDING_RETRY_CONFIG = {
      maxRetries: 2,
      initialDelayMs: 3000,
      maxDelayMs: 15000,
      retryableStatusCodes: [429, 503, 504],
      retryableErrors: ['TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    }
    const chunkContents = chunks.map(c => c.content)
    const embeddingsResult = await withRetry(
      () => generateEmbeddingsBatch(chunkContents, { operationName: 'indexation' }),
      (error) => isRetryableError(error),
      EMBEDDING_RETRY_CONFIG,
      (attempt, delay) => console.log(`[WebIndexer] Retry embedding batch (tentative ${attempt + 1}, délai ${delay}ms)`)
    )

    const primaryEmbeddings = embeddingsResult

    // Générer l'embedding du document (titre + description)
    const docSummary = `${row.title || ''}. ${row.meta_description || ''}`.trim()
    const docEmbeddingResult = await withRetry(
      () => generateEmbedding(
        docSummary || normalizedText.substring(0, 500),
        { operationName: 'indexation' }
      ),
      (error) => isRetryableError(error),
      EMBEDDING_RETRY_CONFIG,
    )

    // Déterminer la colonne d'embedding selon le provider utilisé
    const isOpenAI = primaryEmbeddings.provider === 'openai'
    const embeddingColumn = isOpenAI ? 'embedding_openai' : 'embedding'

    // C4 : Extraire les en-têtes hiérarchiques du texte pour enrichir les chunks adaptatifs
    // Heuristique : lignes courtes (≤80 chars) sans ponctuation finale = probable en-tête de section
    const headingLines: Array<{ position: number; text: string }> = []
    if (chunkingStrategy === 'adaptive') {
      const lines = normalizedText.split('\n')
      let linePos = 0
      for (const line of lines) {
        const trimmed = line.trim()
        // Critères : 5-80 chars, ne termine pas par . ! ? ؟ ، ; :
        if (trimmed.length >= 5 && trimmed.length <= 80 && !/[.!?؟،;:،]$/.test(trimmed)) {
          headingLines.push({ position: linePos, text: trimmed })
        }
        linePos += line.length + 1 // +1 pour le \n
      }
    }

    // Batch INSERT des chunks (réduction N requêtes → 1 par batch de 50)
    const CHUNK_BATCH_SIZE = 50
    for (let batchStart = 0; batchStart < chunks.length; batchStart += CHUNK_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + CHUNK_BATCH_SIZE, chunks.length)
      const batchChunks = chunks.slice(batchStart, batchEnd)

      const values: unknown[] = []
      const placeholders: string[] = []

      for (let i = 0; i < batchChunks.length; i++) {
        const chunkIndex = batchStart + i

        // Trouver l'en-tête de section le plus proche avant ce chunk (contexte hiérarchique)
        const chunkStart = batchChunks[i].metadata?.startPosition ?? 0
        const nearestHeading = headingLines
          .filter((h) => h.position <= chunkStart)
          .at(-1)

        const chunkMeta = batchChunks[i].metadata
        const meta = JSON.stringify({
          wordCount: chunkMeta.wordCount,
          charCount: chunkMeta.charCount,
          sourceUrl: row.url,
          sourceOrigin,
          chunkingStrategy: chunkMeta.chunkingStrategy || chunkingStrategy,
          ...(chunkMeta.chunkType ? { chunkType: chunkMeta.chunkType } : {}),
          ...(chunkMeta.articleNumber ? { articleNumber: chunkMeta.articleNumber } : {}),
          ...(chunkMeta.overlapWithPrevious ? { overlapPrev: true } : {}),
          ...(chunkMeta.overlapWithNext ? { overlapNext: true } : {}),
          ...(normLevel ? { normLevel } : {}),
          ...(nearestHeading ? { sectionHeader: nearestHeading.text } : {}),
        })

        const offset = i * 5
        placeholders.push(
          `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}::vector, $${offset+5})`
        )
        values.push(
          knowledgeBaseId,
          batchChunks[i].index,
          batchChunks[i].content,
          formatEmbeddingForPostgres(primaryEmbeddings.embeddings[chunkIndex]),
          meta,
        )
      }

      await client.query(
        `INSERT INTO knowledge_base_chunks (knowledge_base_id, chunk_index, content, ${embeddingColumn}, metadata) VALUES ${placeholders.join(', ')}`,
        values
      )
    }

    // Mettre à jour le document KB avec son embedding
    if (isOpenAI) {
      await client.query(
        `UPDATE knowledge_base SET is_indexed = true, updated_at = NOW() WHERE id = $1`,
        [knowledgeBaseId]
      )
    } else {
      await client.query(
        `UPDATE knowledge_base SET
          embedding = $2::vector,
          is_indexed = true,
          updated_at = NOW()
        WHERE id = $1`,
        [knowledgeBaseId, formatEmbeddingForPostgres(docEmbeddingResult.embedding)]
      )
    }

    // Mettre à jour la page web (titre corrigé + langue détectée)
    await client.query(
      `UPDATE web_pages SET
        knowledge_base_id = $2,
        is_indexed = true,
        chunks_count = $3,
        title = $4,
        language_detected = COALESCE(language_detected, $5),
        last_indexed_at = NOW(),
        status = 'indexed',
        updated_at = NOW()
      WHERE id = $1`,
      [pageId, knowledgeBaseId, chunks.length, pageTitle, detectedLang]
    )

    await client.query('COMMIT')

    console.log(`[WebIndexer] Page ${pageId} indexée: ${chunks.length} chunks${wasUpdate ? ' (mise à jour)' : ''}`)

    // Auto-advance pipeline si éligible (après COMMIT)
    if (knowledgeBaseId) {
      try {
        const { autoAdvanceIfEligible } = await import('@/lib/pipeline/document-pipeline-service')
        const autoResult = await autoAdvanceIfEligible(knowledgeBaseId, 'system-crawler')
        if (autoResult && autoResult.advanced.length > 0) {
          console.log(`[WebIndexer] Auto-advance doc ${knowledgeBaseId}: ${autoResult.advanced.join(' → ')} (arrêt: ${autoResult.stoppedAt})`)
        }
      } catch (autoError) {
        // Ne pas bloquer l'indexation si l'auto-advance échoue
        console.warn(`[WebIndexer] Auto-advance échoué pour ${knowledgeBaseId}:`, autoError)
      }
    }

    // Extraction d'amendements JORT (si source IORT — post-indexation)
    if (sourceOrigin === 'iort_gov_tn' && knowledgeBaseId) {
      try {
        const { isLikelyAmendingDocument, extractAmendmentsFromJORT } = await import('@/lib/knowledge-base/jort-amendment-extractor')
        const { linkAmendmentToKB } = await import('@/lib/knowledge-base/amendment-linker')

        // Test léger avant analyse complète (~60% des JORT ne modifient pas de codes)
        if (isLikelyAmendingDocument(normalizedText)) {
          const { getKnowledgeDocument } = await import('@/lib/ai/knowledge-base-service')
          const kbDoc = await getKnowledgeDocument(knowledgeBaseId)
          if (kbDoc) {
            const extraction = await extractAmendmentsFromJORT(kbDoc)
            if (extraction.isAmendingDocument && extraction.amendments.length > 0) {
              const linking = await linkAmendmentToKB(extraction)
              console.log(
                `[WebIndexer] Amendements JORT: ${extraction.amendments.length} détectés, ` +
                `${linking.relationsCreated} liaisons, ` +
                `${linking.originalChunksMarked} chunks originaux marqués`
              )
            } else {
              // Marquer quand même que l'extraction a été faite
              await import('@/lib/db/postgres').then(({ db: _db }) =>
                _db.query(
                  `UPDATE knowledge_base SET jort_amendments_extracted_at = NOW() WHERE id = $1`,
                  [knowledgeBaseId]
                )
              )
            }
          }
        }
      } catch (amendErr) {
        // Ne jamais bloquer l'indexation si l'extraction d'amendements échoue
        console.warn(`[WebIndexer] Extraction amendements JORT échouée pour ${knowledgeBaseId}:`, amendErr)
      }
    }

    // Notification admin si c'était une mise à jour
    if (wasUpdate) {
      try {
        await db.query(
          `INSERT INTO admin_notifications
           (notification_type, priority, title, message, target_type, target_id, metadata)
           VALUES ('kb_update', 'normal', $1, $2, 'knowledge_base', $3, $4)`,
          [
            `Document KB mis à jour : ${pageTitle}`,
            `Contenu modifié détecté sur ${row.url}. Re-indexation automatique (${chunks.length} chunks).`,
            knowledgeBaseId,
            JSON.stringify({ pageId, sourceUrl: row.url, chunksCreated: chunks.length }),
          ]
        )
      } catch (notifError) {
        console.warn(`[WebIndexer] Erreur notification:`, notifError)
      }
    }

    return {
      success: true,
      knowledgeBaseId,
      chunksCreated: chunks.length,
    }

  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`[WebIndexer] Erreur indexation page ${pageId}:`, error)

    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Erreur indexation',
    }
  } finally {
    client.release()
  }
}

/**
 * Indexe toutes les pages non indexées d'une source
 */
export async function indexSourcePages(
  sourceId: string,
  options: { limit?: number; reindex?: boolean } = {}
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  const { limit = 50, reindex = false } = options

  // Guard: skip si la source est désactivée pour le RAG
  const sourceRagCheck = await db.query(
    'SELECT rag_enabled FROM web_sources WHERE id = $1',
    [sourceId]
  )
  if (!sourceRagCheck.rows[0] || sourceRagCheck.rows[0].rag_enabled === false) {
    console.log(`[Index] Source ${sourceId} désactivée (rag_enabled=false) — indexation ignorée`)
    return { processed: 0, succeeded: 0, failed: 0, results: [] }
  }

  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  let sql = `
    SELECT id FROM web_pages
    WHERE web_source_id = $1
    AND status IN ('crawled', 'unchanged')
    AND extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50
  `

  if (KB_ARABIC_ONLY) {
    sql += ` AND (language_detected = 'ar' OR language_detected IS NULL)`
  }

  if (!reindex) {
    sql += ' AND is_indexed = false'
  }

  sql += ` ORDER BY last_crawled_at DESC LIMIT $2`

  const pagesResult = await db.query(sql, [sourceId, limit])
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable
  const MAX_CONSECUTIVE_FAILURES = 5
  let consecutiveFailures = 0
  let stopped = false

  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length && !stopped; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
        if (result.success) {
          consecutiveFailures = 0
        } else {
          consecutiveFailures++
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`[WebIndexer] ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs — arrêt indexation source ${sourceId}`)
            stopped = true
            break
          }
        }
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      let batchFailures = 0
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
          if (!settled.value.success) batchFailures++
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
          batchFailures++
        }
      }
      if (batchFailures === batch.length) {
        consecutiveFailures += batchFailures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`[WebIndexer] ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs — arrêt indexation source ${sourceId}`)
          stopped = true
        }
      } else {
        consecutiveFailures = 0
      }
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Indexe les pages web en attente (toutes sources ou une source spécifique)
 * Utilisé par le cron d'indexation progressive
 */
export async function indexWebPages(
  limit: number = 10,
  sourceId?: string
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  // Les pages fichiers-seuls (Google Drive sans texte) sont exclues pour éviter une boucle infinie
  const params: (number | string)[] = [limit]
  const sourceFilter = sourceId ? `AND wp.web_source_id = $2` : ''
  if (sourceId) params.push(sourceId)

  const sql = `
    SELECT wp.id FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE ws.rag_enabled = true
    AND wp.status IN ('crawled', 'unchanged', 'indexed')
    AND wp.is_indexed = false
    AND wp.extracted_text IS NOT NULL AND LENGTH(wp.extracted_text) >= 50
    ${KB_ARABIC_ONLY ? `AND (wp.language_detected = 'ar' OR wp.language_detected IS NULL)` : ''}
    ${sourceFilter}
    ORDER BY wp.last_crawled_at DESC
    LIMIT $1
  `

  const pagesResult = await db.query(sql, params)
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable + circuit-breaker
  const MAX_CONSECUTIVE_FAILURES = 5
  let consecutiveFailures = 0
  let stopped = false

  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length && !stopped; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
        if (result.success) {
          consecutiveFailures = 0
        } else {
          consecutiveFailures++
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`[WebIndexer] ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs — arrêt indexation batch`)
            stopped = true
            break
          }
        }
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      let batchFailures = 0
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
          if (!settled.value.success) batchFailures++
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
          batchFailures++
        }
      }
      if (batchFailures === batch.length) {
        consecutiveFailures += batchFailures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`[WebIndexer] ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs — arrêt indexation batch`)
          stopped = true
        }
      } else {
        consecutiveFailures = 0
      }
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Ajoute les pages d'une source à la queue d'indexation
 */
export async function queueSourcePagesForIndexing(
  sourceId: string,
  options: { limit?: number; priority?: number } = {}
): Promise<number> {
  const { limit = 100, priority = 5 } = options

  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  const pagesResult = await db.query(
    `SELECT id FROM web_pages
     WHERE web_source_id = $1
     AND status IN ('crawled', 'unchanged')
     AND is_indexed = false
     AND extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50
     ORDER BY last_crawled_at DESC
     LIMIT $2`,
    [sourceId, limit]
  )

  if (pagesResult.rows.length === 0) {
    return 0
  }

  // Import du service de queue
  const { addToQueue } = await import('@/lib/ai/indexing-queue-service')

  let queued = 0
  for (const row of pagesResult.rows) {
    try {
      await addToQueue('web_page_index', row.id, priority, {
        sourceId,
        type: 'web_page',
      })
      queued++
    } catch (error) {
      console.error(`[WebIndexer] Erreur ajout queue page ${row.id}:`, error)
    }
  }

  return queued
}

/**
 * Récupère les statistiques d'indexation d'une source
 */
export async function getSourceIndexingStats(sourceId: string): Promise<{
  totalPages: number
  indexedPages: number
  pendingPages: number
  failedPages: number
  totalChunks: number
}> {
  // FIX: Inclure aussi les pages 'unchanged' dans les pending_pages
  const result = await db.query(
    `SELECT
      COUNT(*) as total_pages,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages,
      COUNT(*) FILTER (WHERE status IN ('crawled', 'unchanged', 'indexed') AND is_indexed = false) as pending_pages,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_pages,
      COALESCE(SUM(chunks_count), 0) as total_chunks
     FROM web_pages
     WHERE web_source_id = $1`,
    [sourceId]
  )

  const row = result.rows[0]
  return {
    totalPages: parseInt(row.total_pages) || 0,
    indexedPages: parseInt(row.indexed_pages) || 0,
    pendingPages: parseInt(row.pending_pages) || 0,
    failedPages: parseInt(row.failed_pages) || 0,
    totalChunks: parseInt(row.total_chunks) || 0,
  }
}

/**
 * Supprime l'indexation d'une page
 */
export async function unindexWebPage(pageId: string): Promise<boolean> {
  try {
    // Récupérer le knowledge_base_id
    const pageResult = await db.query(
      'SELECT knowledge_base_id FROM web_pages WHERE id = $1',
      [pageId]
    )

    if (pageResult.rows.length === 0) return false

    const kbId = pageResult.rows[0].knowledge_base_id

    const client = await db.getClient()

    try {
      await client.query('BEGIN')

      // Supprimer les chunks si KB existe
      if (kbId) {
        await client.query(
          'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [kbId]
        )

        // Supprimer le document KB
        await client.query(
          'DELETE FROM knowledge_base WHERE id = $1',
          [kbId]
        )
      }

      // Mettre à jour la page
      await client.query(
        `UPDATE web_pages SET
          knowledge_base_id = NULL,
          is_indexed = false,
          chunks_count = 0,
          last_indexed_at = NULL,
          updated_at = NOW()
        WHERE id = $1`,
        [pageId]
      )

      await client.query('COMMIT')
      return true

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

  } catch (error) {
    console.error(`[WebIndexer] Erreur désindexation page ${pageId}:`, error)
    return false
  }
}
