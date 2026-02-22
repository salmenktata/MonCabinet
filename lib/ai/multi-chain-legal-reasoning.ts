/**
 * Service de Raisonnement Juridique Multi-Chain (Phase 3.1)
 *
 * Implémente un raisonnement juridique professionnel en 4 chains séquentielles :
 * 1. Analyse Sources : Extraire points droit, arguments, contradictions, confiance
 * 2. Détection Contradictions : Résolution hiérarchique (Cassation > Appel > Doctrine)
 * 3. Construction Argumentaire : Thèse, antithèse, synthèse, recommandation
 * 4. Vérification Cohérence : Validation finale (pas contradiction interne, tout sourcé)
 *
 * Objectif : 90% questions controversées → analyse contradictoire automatique
 *
 * @module lib/ai/multi-chain-legal-reasoning
 */

import { callLLMWithFallback } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface MultiChainInput {
  question: string
  sources: LegalSource[]
  language: 'fr' | 'ar'
  usePremiumModel?: boolean
}

export interface LegalSource {
  id: string
  content: string
  category: string
  metadata?: {
    tribunalCode?: string
    chambreCode?: string
    decisionDate?: Date
    citationCount?: number
    hasContradiction?: boolean
    domain?: string
    articleNumber?: string
    codeReference?: string
    documentType?: string
    document_type?: string
    doc_type?: string
    documentNature?: string
    document_nature?: string
  }
}

export interface Chain1Output {
  sourceAnalysis: SourceAnalysis[]
  overallConfidence: number
  detectedContradictions: number
  durationMs: number
}

export interface SourceAnalysis {
  sourceId: string
  legalPoints: string[]
  arguments: {
    type: 'pour' | 'contre' | 'neutre'
    content: string
    confidence: number
  }[]
  contradictions: string[]
  confidence: number
  tribunal?: string
  date?: string
  category: string
}

export interface Chain2Output {
  contradictions: DetectedContradiction[]
  resolutions: ContradictionResolution[]
  synthesizedPosition: string
  durationMs: number
}

export interface DetectedContradiction {
  source1Id: string
  source2Id: string
  contradictionType: 'direct' | 'nuance' | 'evolution'
  description: string
  severity: 'critique' | 'moderate' | 'mineure'
}

export interface ContradictionResolution {
  contradictionId: string
  resolutionMethod: 'hierarchie' | 'temporel' | 'contexte'
  preferredSourceId: string
  reason: string
  confidence: number
}

export interface Chain3Output {
  thesis: ArgumentSection
  antithesis: ArgumentSection
  synthesis: ArgumentSection
  recommendation: RecommendationSection
  durationMs: number
}

export interface ArgumentSection {
  title: string
  arguments: Argument[]
  strength: number
}

export interface Argument {
  content: string
  sources: string[]
  confidence: number
  legalBasis: string
}

export interface RecommendationSection {
  mainRecommendation: string
  alternativeOptions: string[]
  risks: string[]
  confidence: number
}

export interface Chain4Output {
  isCoherent: boolean
  internalContradictions: string[]
  unsourcedClaims: string[]
  validationScore: number
  corrections: string[]
  durationMs: number
}

export interface MultiChainResponse {
  question: string
  language: 'fr' | 'ar'
  chain1: Chain1Output
  chain2: Chain2Output
  chain3: Chain3Output
  chain4: Chain4Output
  finalResponse: string
  overallConfidence: number
  totalDurationMs: number
  metadata: {
    sourcesUsed: number
    chainsExecuted: number
    premium: boolean
  }
}

// =============================================================================
// Configuration
// =============================================================================

const CHAIN_CONFIG = {
  chain1: {
    temperature: 0.1, // Précision extraction
    maxTokens: 2000,
  },
  chain2: {
    temperature: 0.2, // Balance précision/créativité
    maxTokens: 1500,
  },
  chain3: {
    temperature: 0.3, // Plus créatif pour argumentaire
    maxTokens: 2500,
  },
  chain4: {
    temperature: 0.1, // Précision validation
    maxTokens: 1000,
  },
}

// =============================================================================
// HIÉRARCHIE DÉTERMINISTE (AVANT CHAIN 2)
// =============================================================================

type HierarchyClass = 'norme' | 'jurisprudence' | 'doctrine' | 'modeles' | 'autre'

interface SourceHierarchyInfo {
  classType: HierarchyClass
  classRank: number
  levelRank: number
  label: string
}

const NORMATIVE_CATEGORIES = new Set([
  'constitution',
  'conventions',
  'legislation',
  'codes',
  'jort',
])

const JURIS_CATEGORIES = new Set([
  'jurisprudence',
])

const MODEL_CATEGORIES = new Set([
  'modeles',
  'templates',
  'procedures',
  'formulaires',
  'google_drive',
])

const DOCTRINE_CATEGORIES = new Set([
  'doctrine',
  'guides',
  'lexique',
  'actualites',
  'autre',
])

const NORMATIVE_LEVELS: Array<{ level: number; label: string; patterns: RegExp[] }> = [
  { level: 1, label: 'دستور / Constitution', patterns: [/constitution|دستور/i] },
  { level: 2, label: 'اتفاقيات / Conventions', patterns: [/convention|conventions|traite|traité|اتفاقية|اتفاقيات|معاهدة/i] },
  { level: 3, label: 'قانون أساسي / Loi organique', patterns: [/loi[\s_-]?organique|قانون\s*أساسي/i] },
  { level: 4, label: 'قانون عادي / Loi', patterns: [/^loi$|law|legislation|code|code_article|مجلة|قانون(?!\s*أساسي)/i] },
  { level: 5, label: 'مرسوم / Décret', patterns: [/decret|décret|decree|مرسوم/i] },
  { level: 6, label: 'أمر ترتيبي / Ordre', patterns: [/ordre|order|أمر/i] },
  { level: 7, label: 'قرار وزاري / Arrêté', patterns: [/arrete|arrêté|قرار|ministerial|وزاري/i] },
]

function normalizeValue(value: string | undefined | null): string | null {
  if (!value) return null
  return value.toString().trim().toLowerCase()
}

function extractDocumentTypeHint(source: LegalSource): string | null {
  const meta = source.metadata
  return normalizeValue(
    meta?.documentType ||
    meta?.document_type ||
    meta?.doc_type ||
    meta?.documentNature ||
    meta?.document_nature
  )
}

function isNormativeDocType(docType: string | null): boolean {
  if (!docType) return false
  return NORMATIVE_LEVELS.some(level => level.patterns.some(p => p.test(docType)))
}

function getNormativeLevel(docType: string | null, category: string): { level: number; label: string } | null {
  const cat = normalizeValue(category)
  const value = docType || cat
  if (!value) return null
  if (!isNormativeDocType(value) && !(cat && NORMATIVE_CATEGORIES.has(cat))) {
    return null
  }
  for (const level of NORMATIVE_LEVELS) {
    if (level.patterns.some(p => p.test(value))) {
      return { level: level.level, label: level.label }
    }
  }
  // Si catégorie normative sans détail fin, placer au niveau "loi" par défaut
  return { level: 4, label: 'قانون / Loi (générique)' }
}

function getJurisprudenceLevel(tribunalCode?: string | null): { level: number; label: string } {
  const code = normalizeValue(tribunalCode)
  if (!code) return { level: 5, label: 'Juridiction non précisée' }
  if (code.includes('cassation') || code.includes('تعقيب')) return { level: 1, label: 'Cassation' }
  if (code.includes('appel') || code.includes('استئناف')) return { level: 2, label: 'Appel' }
  if (code.includes('instance') || code.includes('ابتدائية')) return { level: 3, label: 'Première instance' }
  return { level: 5, label: 'Juridiction non classée' }
}

function getSourceHierarchyInfo(source: LegalSource): SourceHierarchyInfo {
  const category = normalizeValue(source.category) || 'autre'
  const docType = extractDocumentTypeHint(source)

  let classType: HierarchyClass = 'autre'
  if (NORMATIVE_CATEGORIES.has(category) || isNormativeDocType(docType)) {
    classType = 'norme'
  } else if (JURIS_CATEGORIES.has(category) || (docType && docType.includes('juris'))) {
    classType = 'jurisprudence'
  } else if (MODEL_CATEGORIES.has(category)) {
    classType = 'modeles'
  } else if (DOCTRINE_CATEGORIES.has(category)) {
    classType = 'doctrine'
  }

  const classRank = classType === 'norme' ? 1
    : classType === 'jurisprudence' ? 2
      : classType === 'doctrine' ? 3
        : classType === 'modeles' ? 4
          : 5

  if (classType === 'norme') {
    const norm = getNormativeLevel(docType, category)
    return {
      classType,
      classRank,
      levelRank: norm?.level ?? 8,
      label: `Norme: ${norm?.label ?? 'niveau non précisé'}`,
    }
  }

  if (classType === 'jurisprudence') {
    const juris = getJurisprudenceLevel(source.metadata?.tribunalCode)
    return {
      classType,
      classRank,
      levelRank: juris.level,
      label: `Jurisprudence: ${juris.label}`,
    }
  }

  if (classType === 'doctrine') {
    return {
      classType,
      classRank,
      levelRank: 8,
      label: 'Doctrine / analyses',
    }
  }

  if (classType === 'modeles') {
    return {
      classType,
      classRank,
      levelRank: 9,
      label: 'Modèles / procédures',
    }
  }

  return {
    classType,
    classRank,
    levelRank: 10,
    label: 'Autre',
  }
}

function getDecisionTimestamp(value: unknown): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  const ts = date.getTime()
  return Number.isFinite(ts) ? ts : null
}

function choosePreferredSource(
  sourceA: LegalSource,
  sourceB: LegalSource
): LegalSource {
  const infoA = getSourceHierarchyInfo(sourceA)
  const infoB = getSourceHierarchyInfo(sourceB)

  if (infoA.classRank !== infoB.classRank) {
    return infoA.classRank < infoB.classRank ? sourceA : sourceB
  }

  if (infoA.levelRank !== infoB.levelRank) {
    return infoA.levelRank < infoB.levelRank ? sourceA : sourceB
  }

  const dateA = getDecisionTimestamp(sourceA.metadata?.decisionDate)
  const dateB = getDecisionTimestamp(sourceB.metadata?.decisionDate)
  if (dateA && dateB) {
    return dateA >= dateB ? sourceA : sourceB
  }

  return sourceA
}

function applyDeterministicHierarchy(
  chain2: Omit<Chain2Output, 'durationMs'>,
  sources: LegalSource[]
): Omit<Chain2Output, 'durationMs'> {
  const byId = new Map(sources.map(s => [s.id, s]))

  const updatedResolutions = chain2.resolutions.map((resolution) => {
    if (!resolution || resolution.resolutionMethod !== 'hierarchie') {
      return resolution
    }

    const index = parseInt(resolution.contradictionId, 10)
    const contradiction = Number.isFinite(index) ? chain2.contradictions[index] : undefined
    if (!contradiction) return resolution

    const sourceA = byId.get(contradiction.source1Id)
    const sourceB = byId.get(contradiction.source2Id)
    if (!sourceA || !sourceB) return resolution

    const preferred = choosePreferredSource(sourceA, sourceB)
    if (preferred.id !== resolution.preferredSourceId) {
      return {
        ...resolution,
        preferredSourceId: preferred.id,
        reason: 'Priorité hiérarchique déterministe (prétraitement)',
      }
    }

    return resolution
  })

  return {
    ...chain2,
    resolutions: updatedResolutions,
  }
}

// =============================================================================
// CHAIN 1 : ANALYSE SOURCES
// =============================================================================

/**
 * Chain 1 : Analyse approfondie des sources juridiques
 *
 * Extrait pour chaque source :
 * - Points de droit (principes juridiques)
 * - Arguments (pour/contre/neutre)
 * - Contradictions détectées
 * - Confiance (0-1)
 */
async function executeChain1(
  input: MultiChainInput
): Promise<Chain1Output> {
  const startTime = Date.now()

  const prompt = buildChain1Prompt(input)

  try {
    const response = await callLLMWithFallback(
      [
        { role: 'system', content: getChain1SystemPrompt(input.language) },
        { role: 'user', content: prompt },
      ],
      {
        temperature: CHAIN_CONFIG.chain1.temperature,
        maxTokens: CHAIN_CONFIG.chain1.maxTokens,
      },
      input.usePremiumModel
    )

    const parsed = parseChain1Response(response.answer, input.sources)

    return {
      sourceAnalysis: parsed.sourceAnalysis,
      overallConfidence: parsed.overallConfidence,
      detectedContradictions: parsed.detectedContradictions,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[MultiChain] Chain 1 error:', error)
    // Fallback : analyse basique
    return {
      sourceAnalysis: input.sources.map(s => ({
        sourceId: s.id,
        legalPoints: ['[Analyse non disponible]'],
        arguments: [],
        contradictions: [],
        confidence: 0.5,
        category: s.category,
      })),
      overallConfidence: 0.5,
      detectedContradictions: 0,
      durationMs: Date.now() - startTime,
    }
  }
}

function getChain1SystemPrompt(language: 'fr' | 'ar'): string {
  if (language === 'ar') {
    return `أنت خبير قانوني تونسي متخصص في تحليل المصادر القانونية.

مهمتك: تحليل كل مصدر قانوني لاستخراج:
1. النقاط القانونية الرئيسية (المبادئ، القواعد)
2. الحجج (مع، ضد، محايد)
3. التناقضات المحتملة
4. مستوى الثقة (0-1)

كن دقيقًا وموضوعيًا.`
  }

  return `Tu es un expert juridique tunisien spécialisé dans l'analyse de sources juridiques.

Ta mission : Analyser chaque source juridique pour extraire :
1. Les points de droit principaux (principes, règles)
2. Les arguments (pour, contre, neutre)
3. Les contradictions potentielles
4. Le niveau de confiance (0-1)

Sois précis et objectif.`
}

function buildChain1Prompt(input: MultiChainInput): string {
  const { question, sources, language } = input

  if (language === 'ar') {
    return `السؤال القانوني: ${question}

عدد المصادر: ${sources.length}

حلل كل مصدر وقدم بتنسيق JSON:

{
  "sourceAnalysis": [
    {
      "sourceId": "id",
      "legalPoints": ["نقطة 1", "نقطة 2"],
      "arguments": [
        {"type": "pour|contre|neutre", "content": "...", "confidence": 0.8}
      ],
      "contradictions": ["تناقض محتمل مع..."],
      "confidence": 0.8,
      "tribunal": "محكمة التعقيب",
      "date": "2024-01-15",
      "category": "jurisprudence"
    }
  ],
  "overallConfidence": 0.75,
  "detectedContradictions": 2
}

المصادر:
${sources.map((s, i) => `\n--- مصدر ${i + 1} (ID: ${s.id}) ---\nالفئة: ${s.category}\n${s.metadata?.tribunalCode ? `المحكمة: ${s.metadata.tribunalCode}\n` : ''}${s.content.substring(0, 800)}...\n`).join('\n')}`
  }

  return `Question juridique : ${question}

Nombre de sources : ${sources.length}

Analyse chaque source et fournis au format JSON :

{
  "sourceAnalysis": [
    {
      "sourceId": "id",
      "legalPoints": ["Point 1", "Point 2"],
      "arguments": [
        {"type": "pour|contre|neutre", "content": "...", "confidence": 0.8}
      ],
      "contradictions": ["Contradiction potentielle avec..."],
      "confidence": 0.8,
      "tribunal": "Cour de Cassation",
      "date": "2024-01-15",
      "category": "jurisprudence"
    }
  ],
  "overallConfidence": 0.75,
  "detectedContradictions": 2
}

Sources :
${sources.map((s, i) => `\n--- Source ${i + 1} (ID: ${s.id}) ---\nCatégorie: ${s.category}\n${s.metadata?.tribunalCode ? `Tribunal: ${s.metadata.tribunalCode}\n` : ''}${s.content.substring(0, 800)}...\n`).join('\n')}`
}

function parseChain1Response(
  response: string,
  sources: LegalSource[]
): {
  sourceAnalysis: SourceAnalysis[]
  overallConfidence: number
  detectedContradictions: number
} {
  try {
    // Extraire JSON de la réponse
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      sourceAnalysis: parsed.sourceAnalysis || [],
      overallConfidence: parsed.overallConfidence || 0.5,
      detectedContradictions: parsed.detectedContradictions || 0,
    }
  } catch (error) {
    console.error('[MultiChain] Chain 1 parsing error:', error)
    // Fallback parsing
    return {
      sourceAnalysis: sources.map(s => ({
        sourceId: s.id,
        legalPoints: ['[Analyse non disponible]'],
        arguments: [],
        contradictions: [],
        confidence: 0.5,
        category: s.category,
      })),
      overallConfidence: 0.5,
      detectedContradictions: 0,
    }
  }
}

// =============================================================================
// CHAIN 2 : DÉTECTION CONTRADICTIONS
// =============================================================================

/**
 * Chain 2 : Détection et résolution des contradictions
 *
 * - Identifie contradictions entre sources
 * - Applique résolution hiérarchique (Cassation > Appel > Doctrine)
 * - Favorise source plus récente si même niveau
 * - Synthétise position cohérente
 */
async function executeChain2(
  input: MultiChainInput,
  chain1Output: Chain1Output
): Promise<Chain2Output> {
  const startTime = Date.now()

  // Skip si pas de contradictions détectées
  if (chain1Output.detectedContradictions === 0) {
    return {
      contradictions: [],
      resolutions: [],
      synthesizedPosition: 'Aucune contradiction majeure détectée entre les sources.',
      durationMs: Date.now() - startTime,
    }
  }

  const prompt = buildChain2Prompt(input, chain1Output)

  try {
    const response = await callLLMWithFallback(
      [
        { role: 'system', content: getChain2SystemPrompt(input.language) },
        { role: 'user', content: prompt },
      ],
      {
        temperature: CHAIN_CONFIG.chain2.temperature,
        maxTokens: CHAIN_CONFIG.chain2.maxTokens,
      },
      input.usePremiumModel
    )

    const parsed = parseChain2Response(response.answer)
    const normalized = applyDeterministicHierarchy(parsed, input.sources)

    return {
      ...normalized,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[MultiChain] Chain 2 error:', error)
    return {
      contradictions: [],
      resolutions: [],
      synthesizedPosition: 'Erreur analyse contradictions.',
      durationMs: Date.now() - startTime,
    }
  }
}

function getChain2SystemPrompt(language: 'fr' | 'ar'): string {
  if (language === 'ar') {
    return `أنت خبير قانوني متخصص في حل التناقضات القانونية.

قواعد الحل الهرمي:
1. محكمة التعقيب > محكمة الاستئناف > المحاكم الابتدائية
2. هرمية القواعد القانونية: الدستور > الاتفاقيات والمعاهدات الدولية المصادق عليها > القوانين الأساسية > القوانين العادية > المراسيم > الأوامر الترتيبية > القرارات الوزارية
3. القانون > الفقه القانوني > النماذج
4. إذا كان نفس المستوى: الأحدث > الأقدم

حدد التناقضات، اقترح حلولًا، وقدم موقفًا موحدًا.`
  }

  return `Tu es un expert juridique spécialisé dans la résolution de contradictions juridiques.

Règles de résolution hiérarchique :
1. Cassation > Appel > Première Instance
2. Hiérarchie des normes : Constitution > Conventions internationales ratifiées > Lois organiques > Lois ordinaires > Décrets > Ordres réglementaires > Arrêtés ministériels
3. Loi > Doctrine > Modèles
4. Si même niveau : Plus récent > Plus ancien

Identifie les contradictions, propose des résolutions, et fournis une position synthétisée.`
}

function buildChain2Prompt(
  input: MultiChainInput,
  chain1Output: Chain1Output
): string {
  const { language } = input

  const sourcesWithContradictions = chain1Output.sourceAnalysis.filter(
    s => s.contradictions.length > 0
  )
  const analysisById = new Map(chain1Output.sourceAnalysis.map(s => [s.sourceId, s]))
  const sourceMeta = input.sources.map((source) => {
    const analysis = analysisById.get(source.id)
    const tribunal = analysis?.tribunal || source.metadata?.tribunalCode
    const decisionTs = getDecisionTimestamp(source.metadata?.decisionDate)
    const date = analysis?.date || (decisionTs ? new Date(decisionTs).toISOString().slice(0, 10) : null)
    const hierarchy = getSourceHierarchyInfo(source)
    const tribunalPart = tribunal ? `, tribunal: ${tribunal}` : ''
    const datePart = date ? `, date: ${date}` : ''
    return `- ${source.id}: catégorie=${source.category}, hiérarchie=${hierarchy.label} (rang=${hierarchy.classRank}.${hierarchy.levelRank})${tribunalPart}${datePart}`
  })

  if (language === 'ar') {
    return `تحليل Chain 1 حدد ${chain1Output.detectedContradictions} تناقضات محتملة.

المصادر المتناقضة:
${sourcesWithContradictions.map(s => `- ${s.sourceId}: ${s.contradictions.join(', ')}`).join('\n')}

بيانات المصادر (للاستدلال الهرمي):
${sourceMeta.join('\n')}

حلل التناقضات وقدم بتنسيق JSON:

{
  "contradictions": [
    {
      "source1Id": "...",
      "source2Id": "...",
      "contradictionType": "direct|nuance|evolution",
      "description": "...",
      "severity": "critique|moderate|mineure"
    }
  ],
  "resolutions": [
    {
      "contradictionId": "0",
      "resolutionMethod": "hierarchie|temporel|contexte",
      "preferredSourceId": "...",
      "reason": "محكمة التعقيب لها الأولوية",
      "confidence": 0.9
    }
  ],
  "synthesizedPosition": "الموقف القانوني الموحد..."
}`
  }

  return `L'analyse Chain 1 a détecté ${chain1Output.detectedContradictions} contradictions potentielles.

Sources contradictoires :
${sourcesWithContradictions.map(s => `- ${s.sourceId}: ${s.contradictions.join(', ')}`).join('\n')}

Métadonnées sources (pour résolution hiérarchique) :
${sourceMeta.join('\n')}

Analyse les contradictions et fournis au format JSON :

{
  "contradictions": [
    {
      "source1Id": "...",
      "source2Id": "...",
      "contradictionType": "direct|nuance|evolution",
      "description": "...",
      "severity": "critique|moderate|mineure"
    }
  ],
  "resolutions": [
    {
      "contradictionId": "0",
      "resolutionMethod": "hierarchie|temporel|contexte",
      "preferredSourceId": "...",
      "reason": "Cassation a priorité hiérarchique",
      "confidence": 0.9
    }
  ],
  "synthesizedPosition": "Position juridique synthétisée..."
}`
}

function parseChain2Response(response: string): Omit<Chain2Output, 'durationMs'> {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')

    const parsed = JSON.parse(jsonMatch[0])

    return {
      contradictions: parsed.contradictions || [],
      resolutions: parsed.resolutions || [],
      synthesizedPosition: parsed.synthesizedPosition || '',
    }
  } catch (error) {
    console.error('[MultiChain] Chain 2 parsing error:', error)
    return {
      contradictions: [],
      resolutions: [],
      synthesizedPosition: 'Erreur parsing Chain 2',
    }
  }
}

// =============================================================================
// CHAIN 3 : CONSTRUCTION ARGUMENTAIRE
// =============================================================================

/**
 * Chain 3 : Construction argumentaire dialectique
 *
 * - Thèse : Arguments en faveur de la position principale
 * - Antithèse : Arguments contraires ou nuances
 * - Synthèse : Position équilibrée intégrant les deux
 * - Recommandation : Conseils pratiques et risques
 */
async function executeChain3(
  input: MultiChainInput,
  chain1Output: Chain1Output,
  chain2Output: Chain2Output
): Promise<Chain3Output> {
  const startTime = Date.now()

  const prompt = buildChain3Prompt(input, chain1Output, chain2Output)

  try {
    const response = await callLLMWithFallback(
      [
        { role: 'system', content: getChain3SystemPrompt(input.language) },
        { role: 'user', content: prompt },
      ],
      {
        temperature: CHAIN_CONFIG.chain3.temperature,
        maxTokens: CHAIN_CONFIG.chain3.maxTokens,
      },
      input.usePremiumModel
    )

    const parsed = parseChain3Response(response.answer)

    return {
      ...parsed,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[MultiChain] Chain 3 error:', error)
    return {
      thesis: { title: 'Thèse', arguments: [], strength: 0.5 },
      antithesis: { title: 'Antithèse', arguments: [], strength: 0.5 },
      synthesis: { title: 'Synthèse', arguments: [], strength: 0.5 },
      recommendation: {
        mainRecommendation: 'Erreur génération recommandation',
        alternativeOptions: [],
        risks: [],
        confidence: 0.5,
      },
      durationMs: Date.now() - startTime,
    }
  }
}

function getChain3SystemPrompt(language: 'fr' | 'ar'): string {
  if (language === 'ar') {
    return `أنت محامٍ تونسي خبير في البناء الجدلي القانوني.

قدم تحليلاً جدليًا كاملاً:
1. الأطروحة: الحجج لصالح الموقف الرئيسي
2. نقيض الأطروحة: الحجج المضادة أو الفروق الدقيقة
3. التوليف: موقف متوازن يدمج الجانبين
4. التوصية: نصائح عملية ومخاطر

كل حجة يجب أن تكون مصدرها وثقتها واضحة.`
  }

  return `Tu es un avocat tunisien expert en construction argumentaire juridique dialectique.

Fournis une analyse dialectique complète :
1. Thèse : Arguments en faveur de la position principale
2. Antithèse : Arguments contraires ou nuances
3. Synthèse : Position équilibrée intégrant les deux
4. Recommandation : Conseils pratiques et risques

Chaque argument doit être sourcé et avoir une confiance claire.`
}

function buildChain3Prompt(
  input: MultiChainInput,
  chain1Output: Chain1Output,
  chain2Output: Chain2Output
): string {
  const { question, language } = input

  if (language === 'ar') {
    return `السؤال: ${question}

التحليل Chain 1: ${chain1Output.sourceAnalysis.length} مصادر محللة
التحليل Chain 2: ${chain2Output.contradictions.length} تناقضات محلولة

الموقف الموحد: ${chain2Output.synthesizedPosition}

قدم بناءً جدليًا كاملاً بتنسيق JSON:

{
  "thesis": {
    "title": "الأطروحة - الموقف الرئيسي",
    "arguments": [
      {"content": "...", "sources": ["id1"], "confidence": 0.8, "legalBasis": "المادة X"}
    ],
    "strength": 0.75
  },
  "antithesis": {
    "title": "نقيض الأطروحة - الموقف المضاد",
    "arguments": [...],
    "strength": 0.6
  },
  "synthesis": {
    "title": "التوليف - الموقف المتوازن",
    "arguments": [...],
    "strength": 0.85
  },
  "recommendation": {
    "mainRecommendation": "التوصية الرئيسية...",
    "alternativeOptions": ["خيار 1", "خيار 2"],
    "risks": ["خطر 1", "خطر 2"],
    "confidence": 0.8
  }
}`
  }

  return `Question : ${question}

Analyse Chain 1 : ${chain1Output.sourceAnalysis.length} sources analysées
Analyse Chain 2 : ${chain2Output.contradictions.length} contradictions résolues

Position synthétisée : ${chain2Output.synthesizedPosition}

Fournis une construction dialectique complète au format JSON :

{
  "thesis": {
    "title": "Thèse - Position principale",
    "arguments": [
      {"content": "...", "sources": ["id1"], "confidence": 0.8, "legalBasis": "Article X"}
    ],
    "strength": 0.75
  },
  "antithesis": {
    "title": "Antithèse - Position contraire",
    "arguments": [...],
    "strength": 0.6
  },
  "synthesis": {
    "title": "Synthèse - Position équilibrée",
    "arguments": [...],
    "strength": 0.85
  },
  "recommendation": {
    "mainRecommendation": "Recommandation principale...",
    "alternativeOptions": ["Option 1", "Option 2"],
    "risks": ["Risque 1", "Risque 2"],
    "confidence": 0.8
  }
}`
}

function parseChain3Response(response: string): Omit<Chain3Output, 'durationMs'> {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')

    const parsed = JSON.parse(jsonMatch[0])

    return {
      thesis: parsed.thesis || { title: '', arguments: [], strength: 0.5 },
      antithesis: parsed.antithesis || { title: '', arguments: [], strength: 0.5 },
      synthesis: parsed.synthesis || { title: '', arguments: [], strength: 0.5 },
      recommendation: parsed.recommendation || {
        mainRecommendation: '',
        alternativeOptions: [],
        risks: [],
        confidence: 0.5,
      },
    }
  } catch (error) {
    console.error('[MultiChain] Chain 3 parsing error:', error)
    return {
      thesis: { title: 'Thèse', arguments: [], strength: 0.5 },
      antithesis: { title: 'Antithèse', arguments: [], strength: 0.5 },
      synthesis: { title: 'Synthèse', arguments: [], strength: 0.5 },
      recommendation: {
        mainRecommendation: 'Erreur parsing',
        alternativeOptions: [],
        risks: [],
        confidence: 0.5,
      },
    }
  }
}

// =============================================================================
// CHAIN 4 : VÉRIFICATION COHÉRENCE
// =============================================================================

/**
 * Chain 4 : Vérification cohérence finale
 *
 * - Détecte contradictions internes dans la réponse générée
 * - Vérifie que toutes les affirmations sont sourcées
 * - Calcule score de validation global (0-100)
 * - Propose corrections si nécessaire
 */
async function executeChain4(
  input: MultiChainInput,
  chain3Output: Chain3Output
): Promise<Chain4Output> {
  const startTime = Date.now()

  const prompt = buildChain4Prompt(input, chain3Output)

  try {
    const response = await callLLMWithFallback(
      [
        { role: 'system', content: getChain4SystemPrompt(input.language) },
        { role: 'user', content: prompt },
      ],
      {
        temperature: CHAIN_CONFIG.chain4.temperature,
        maxTokens: CHAIN_CONFIG.chain4.maxTokens,
      },
      input.usePremiumModel
    )

    const parsed = parseChain4Response(response.answer)

    return {
      ...parsed,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[MultiChain] Chain 4 error:', error)
    return {
      isCoherent: true,
      internalContradictions: [],
      unsourcedClaims: [],
      validationScore: 70,
      corrections: [],
      durationMs: Date.now() - startTime,
    }
  }
}

function getChain4SystemPrompt(language: 'fr' | 'ar'): string {
  if (language === 'ar') {
    return `أنت مدقق قانوني صارم متخصص في التحقق من الاتساق القانوني.

تحقق من:
1. عدم وجود تناقضات داخلية
2. جميع التأكيدات مصدرها موثق
3. الحجج منطقية ومتماسكة
4. لا توجد ادعاءات غير مبررة

قدم تقرير تحقق مفصل.`
  }

  return `Tu es un auditeur juridique rigoureux spécialisé dans la vérification de cohérence juridique.

Vérifie :
1. Absence de contradictions internes
2. Toutes les affirmations sont sourcées
3. Les arguments sont logiques et cohérents
4. Pas de claims non justifiées

Fournis un rapport de validation détaillé.`
}

function buildChain4Prompt(
  input: MultiChainInput,
  chain3Output: Chain3Output
): string {
  const { language } = input

  const allArguments = [
    ...chain3Output.thesis.arguments,
    ...chain3Output.antithesis.arguments,
    ...chain3Output.synthesis.arguments,
  ]

  if (language === 'ar') {
    return `تحقق من الاتساق الداخلي للبناء الجدلي:

الأطروحة: ${chain3Output.thesis.arguments.length} حجج
نقيض الأطروحة: ${chain3Output.antithesis.arguments.length} حجج
التوليف: ${chain3Output.synthesis.arguments.length} حجج
التوصية: ${chain3Output.recommendation.mainRecommendation}

قدم تقرير تحقق بتنسيق JSON:

{
  "isCoherent": true|false,
  "internalContradictions": ["تناقض 1", "تناقض 2"],
  "unsourcedClaims": ["ادعاء غير موثق 1"],
  "validationScore": 85,
  "corrections": ["تصحيح مقترح 1"]
}`
  }

  return `Vérifie la cohérence interne de la construction dialectique :

Thèse : ${chain3Output.thesis.arguments.length} arguments
Antithèse : ${chain3Output.antithesis.arguments.length} arguments
Synthèse : ${chain3Output.synthesis.arguments.length} arguments
Recommandation : ${chain3Output.recommendation.mainRecommendation}

Fournis un rapport de validation au format JSON :

{
  "isCoherent": true|false,
  "internalContradictions": ["Contradiction 1", "Contradiction 2"],
  "unsourcedClaims": ["Affirmation non sourcée 1"],
  "validationScore": 85,
  "corrections": ["Correction suggérée 1"]
}`
}

function parseChain4Response(response: string): Omit<Chain4Output, 'durationMs'> {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')

    const parsed = JSON.parse(jsonMatch[0])

    return {
      isCoherent: parsed.isCoherent !== false,
      internalContradictions: parsed.internalContradictions || [],
      unsourcedClaims: parsed.unsourcedClaims || [],
      validationScore: parsed.validationScore || 70,
      corrections: parsed.corrections || [],
    }
  } catch (error) {
    console.error('[MultiChain] Chain 4 parsing error:', error)
    return {
      isCoherent: true,
      internalContradictions: [],
      unsourcedClaims: [],
      validationScore: 70,
      corrections: [],
    }
  }
}

// =============================================================================
// FONCTION PRINCIPALE : MULTI-CHAIN REASONING
// =============================================================================

/**
 * Exécute le raisonnement multi-chain complet (4 chains séquentielles)
 *
 * @param input - Question + Sources + Options
 * @returns Analyse complète multi-perspectives avec 4 chains
 *
 * @example
 * ```ts
 * const response = await multiChainReasoning({
 *   question: 'Puis-je résilier un contrat de vente immobilier?',
 *   sources: [...],
 *   language: 'fr',
 *   usePremiumModel: true
 * })
 *
 * console.log(`Thèse: ${response.chain3.thesis.arguments.length} arguments`)
 * console.log(`Validation: ${response.chain4.validationScore}/100`)
 * ```
 */
export async function multiChainReasoning(
  input: MultiChainInput
): Promise<MultiChainResponse> {
  const startTime = Date.now()

  console.log(
    `[MultiChain] Start - Question: "${input.question.substring(0, 50)}...", Sources: ${input.sources.length}, Premium: ${input.usePremiumModel || false}`
  )

  // Chain 1 : Analyse Sources
  const chain1 = await executeChain1(input)
  console.log(
    `[MultiChain] Chain 1 complete - ${chain1.sourceAnalysis.length} sources analyzed, ${chain1.detectedContradictions} contradictions, ${chain1.durationMs}ms`
  )

  // Chain 2 : Détection Contradictions
  const chain2 = await executeChain2(input, chain1)
  console.log(
    `[MultiChain] Chain 2 complete - ${chain2.contradictions.length} contradictions detected, ${chain2.resolutions.length} resolutions, ${chain2.durationMs}ms`
  )

  // Chain 3 : Construction Argumentaire
  const chain3 = await executeChain3(input, chain1, chain2)
  console.log(
    `[MultiChain] Chain 3 complete - Thesis: ${chain3.thesis.arguments.length}, Antithesis: ${chain3.antithesis.arguments.length}, Synthesis: ${chain3.synthesis.arguments.length}, ${chain3.durationMs}ms`
  )

  // Chain 4 : Vérification Cohérence
  const chain4 = await executeChain4(input, chain3)
  console.log(
    `[MultiChain] Chain 4 complete - Coherent: ${chain4.isCoherent}, Score: ${chain4.validationScore}/100, ${chain4.durationMs}ms`
  )

  // Générer réponse finale formatée
  const finalResponse = formatFinalResponse(input, chain1, chain2, chain3, chain4)

  const totalDurationMs = Date.now() - startTime

  // Calculer confiance globale
  const overallConfidence =
    (chain1.overallConfidence * 0.3 +
      chain3.synthesis.strength * 0.5 +
      chain4.validationScore / 100 * 0.2)

  console.log(
    `[MultiChain] Complete - Total: ${totalDurationMs}ms, Confidence: ${(overallConfidence * 100).toFixed(1)}%, Coherent: ${chain4.isCoherent}`
  )

  return {
    question: input.question,
    language: input.language,
    chain1,
    chain2,
    chain3,
    chain4,
    finalResponse,
    overallConfidence,
    totalDurationMs,
    metadata: {
      sourcesUsed: input.sources.length,
      chainsExecuted: 4,
      premium: input.usePremiumModel || false,
    },
  }
}

/**
 * Formate la réponse finale en format texte structuré
 */
function formatFinalResponse(
  input: MultiChainInput,
  chain1: Chain1Output,
  chain2: Chain2Output,
  chain3: Chain3Output,
  chain4: Chain4Output
): string {
  const { language } = input

  if (language === 'ar') {
    return `# التحليل القانوني متعدد المنظورات

## الأطروحة - الموقف الرئيسي
${chain3.thesis.arguments.map(a => `- **${a.legalBasis}**: ${a.content} [${a.sources.join(', ')}] (ثقة: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## نقيض الأطروحة - المنظور المضاد
${chain3.antithesis.arguments.map(a => `- **${a.legalBasis}**: ${a.content} [${a.sources.join(', ')}] (ثقة: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## التوليف - الموقف المتوازن
${chain3.synthesis.arguments.map(a => `- **${a.legalBasis}**: ${a.content} [${a.sources.join(', ')}] (ثقة: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## التوصية
**الرئيسية**: ${chain3.recommendation.mainRecommendation}

**خيارات بديلة**:
${chain3.recommendation.alternativeOptions.map(o => `- ${o}`).join('\n')}

**المخاطر**:
${chain3.recommendation.risks.map(r => `- ⚠️ ${r}`).join('\n')}

---
*التحقق: ${chain4.isCoherent ? '✅ متسق' : '⚠️ تناقضات محتملة'} | النتيجة: ${chain4.validationScore}/100*`
  }

  return `# Analyse Juridique Multi-Perspectives

## Thèse - Position Principale
${chain3.thesis.arguments.map(a => `- **${a.legalBasis}** : ${a.content} [${a.sources.join(', ')}] (confiance: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## Antithèse - Perspective Contraire
${chain3.antithesis.arguments.map(a => `- **${a.legalBasis}** : ${a.content} [${a.sources.join(', ')}] (confiance: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## Synthèse - Position Équilibrée
${chain3.synthesis.arguments.map(a => `- **${a.legalBasis}** : ${a.content} [${a.sources.join(', ')}] (confiance: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}

## Recommandation
**Principale** : ${chain3.recommendation.mainRecommendation}

**Options Alternatives** :
${chain3.recommendation.alternativeOptions.map(o => `- ${o}`).join('\n')}

**Risques** :
${chain3.recommendation.risks.map(r => `- ⚠️ ${r}`).join('\n')}

---
*Validation : ${chain4.isCoherent ? '✅ Cohérent' : '⚠️ Contradictions potentielles'} | Score : ${chain4.validationScore}/100*`
}

// =============================================================================
// EXPORTS
// =============================================================================

export { multiChainReasoning as default }
