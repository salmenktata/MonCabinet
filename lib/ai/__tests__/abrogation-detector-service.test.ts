/**
 * Tests unitaires - Service Détection Abrogations
 *
 * Vérifie la détection des lois/articles abrogés :
 * 1. Extraction références juridiques
 * 2. Vérification statut abrogation (DB)
 * 3. Détection patterns auto-déclaration
 * 4. Pipeline complet + warnings
 *
 * Objectif coverage : ≥75% abrogation-detector-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractLegalReferences,
  checkAbrogationStatus,
  detectAbrogationPatternsInText,
  detectAbrogatedReferences,
  normalizeReference,
  formatAbrogationWarnings,
  type AbrogationInfo,
  type AbrogationWarning,
} from '@/lib/ai/abrogation-detector-service'
import { db } from '@/lib/db/postgres'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/lib/db/postgres', () => ({
  db: {
    query: vi.fn(),
  },
}))

// =============================================================================
// FIXTURES
// =============================================================================

const mockAbrogationInfo: AbrogationInfo = {
  abrogatedReference: 'Loi n°1968-07',
  abrogatedReferenceAr: 'القانون عدد 7 لسنة 1968',
  abrogatingReference: 'Loi n°2016-36',
  abrogatingReferenceAr: 'القانون عدد 36 لسنة 2016',
  abrogationDate: new Date('2016-05-15'),
  scope: 'total',
  sourceUrl: 'https://legislation.tn',
  notes: 'Réforme complète',
  similarityScore: 0.95,
}

// =============================================================================
// TESTS - extractLegalReferences
// =============================================================================

describe('Abrogation Detector - extractLegalReferences', () => {
  it('devrait extraire lois françaises (Loi n°YYYY-NN)', () => {
    const text = 'La Loi n°2016-36 et L.2017-58 régissent...'
    const refs = extractLegalReferences(text)

    const lois = refs.filter(r => r.type === 'loi' && r.language === 'fr')
    expect(lois.length).toBeGreaterThanOrEqual(2)
    expect(lois.some(l => l.reference.includes('2016-36'))).toBe(true)
  })

  it('devrait extraire circulaires françaises', () => {
    const text = 'Circulaire n°216 du 5 novembre 1973'
    const refs = extractLegalReferences(text)

    const circulaires = refs.filter(r => r.type === 'circulaire')
    expect(circulaires.length).toBeGreaterThanOrEqual(1)
    expect(circulaires[0].reference).toContain('216')
  })

  it('devrait extraire lois arabes (القانون عدد N)', () => {
    const text = 'القانون عدد 58 لسنة 2017 والقانون رقم 36 لسنة 2016'
    const refs = extractLegalReferences(text)

    const loisAR = refs.filter(r => r.type === 'loi' && r.language === 'ar')
    expect(loisAR.length).toBeGreaterThanOrEqual(2)
    expect(loisAR.some(l => l.reference.includes('58'))).toBe(true)
  })

  it('devrait extraire articles avec contexte Code/Loi', () => {
    const text = 'Article 207 du Code Pénal et Article 30 du CSP'
    const refs = extractLegalReferences(text)

    const articles = refs.filter(r => r.type === 'article')
    // Au moins un article devrait être extrait (contexte Code proche)
    expect(articles.length).toBeGreaterThanOrEqual(1)
    expect(articles.some(a => a.reference.includes('207') || a.reference.includes('30'))).toBe(true)
  })

  it('devrait retourner array vide si pas de références', () => {
    const text = 'Texte juridique sans références spécifiques'
    const refs = extractLegalReferences(text)

    expect(refs).toEqual([])
  })
})

// =============================================================================
// TESTS - checkAbrogationStatus
// =============================================================================

describe('Abrogation Detector - checkAbrogationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait retourner info abrogation si match DB', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        {
          abrogated_reference: 'Loi n°1968-07',
          abrogated_reference_ar: 'القانون عدد 7 لسنة 1968',
          abrogating_reference: 'Loi n°2016-36',
          abrogating_reference_ar: 'القانون عدد 36 لسنة 2016',
          abrogation_date: '2016-05-15',
          scope: 'total',
          affected_articles: null,
          source_url: 'https://legislation.tn',
          jort_url: null,
          notes: 'Réforme complète',
          similarity_score: 0.95,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const result = await checkAbrogationStatus('Loi n°1968-07', 0.6)

    expect(result).not.toBeNull()
    expect(result?.abrogatedReference).toBe('Loi n°1968-07')
    expect(result?.abrogatingReference).toBe('Loi n°2016-36')
    expect(result?.scope).toBe('total')
    expect(result?.similarityScore).toBe(0.95)
  })

  it('devrait retourner null si pas de match', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const result = await checkAbrogationStatus('Loi n°9999-99', 0.6)

    expect(result).toBeNull()
  })

  it('devrait gérer erreur DB gracefully', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('DB error'))

    const result = await checkAbrogationStatus('Loi n°1968-07', 0.6)

    expect(result).toBeNull()
  })
})

// =============================================================================
// TESTS - detectAbrogationPatternsInText
// =============================================================================

describe('Abrogation Detector - detectAbrogationPatternsInText', () => {
  it('devrait détecter pattern "abrogé par" français', () => {
    const text = 'Cette loi a été abrogée par la Loi n°2016-36'
    const patterns = detectAbrogationPatternsInText(text)

    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns[0].abrogatedBy).toContain('2016-36')
  })

  it('devrait détecter pattern "remplacé par" français', () => {
    const text = 'Le décret a été remplacé par le Décret n°2020-30'
    const patterns = detectAbrogationPatternsInText(text)

    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns[0].abrogatedBy).toContain('2020-30')
  })

  it('devrait détecter pattern "ألغي بموجب" arabe', () => {
    const text = 'القانون ألغي بموجب القانون عدد 58'
    const patterns = detectAbrogationPatternsInText(text)

    expect(patterns.length).toBeGreaterThan(0)
  })

  it('devrait retourner array vide si pas de patterns', () => {
    const text = 'Loi en vigueur sans mention d\'abrogation'
    const patterns = detectAbrogationPatternsInText(text)

    expect(patterns).toEqual([])
  })
})

// =============================================================================
// TESTS - detectAbrogatedReferences
// =============================================================================

describe('Abrogation Detector - detectAbrogatedReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait détecter références abrogées et générer warnings', async () => {
    // Mock DB retournant une abrogation
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        {
          abrogated_reference: 'Loi n°1968-07',
          abrogated_reference_ar: 'القانون عدد 7 لسنة 1968',
          abrogating_reference: 'Loi n°2016-36',
          abrogating_reference_ar: 'القانون عدد 36 لسنة 2016',
          abrogation_date: '2016-05-15',
          scope: 'total',
          affected_articles: null,
          source_url: 'https://legislation.tn',
          jort_url: null,
          notes: 'Réforme complète',
          similarity_score: 0.95,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const answer = 'Selon la Loi n°1968-07, les entreprises...'
    const warnings = await detectAbrogatedReferences(answer)

    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].type).toBe('abrogation_detected')
    expect(warnings[0].reference).toContain('1968-07')
    expect(warnings[0].severity).toBe('high') // total = high
    expect(warnings[0].message).toContain('abrogé')
  })

  it('devrait déterminer severity selon scope', async () => {
    // Scope partial = medium severity
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        {
          abrogated_reference: 'Loi n°2005-95',
          abrogating_reference: 'Loi n°2020-30',
          abrogation_date: '2020-06-10',
          scope: 'partial',
          similarity_score: 0.85,
          abrogated_reference_ar: null,
          abrogating_reference_ar: null,
          affected_articles: ['Article 12'],
          source_url: null,
          jort_url: null,
          notes: null,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const answer = 'La Loi n°2005-95 prévoit...'
    const warnings = await detectAbrogatedReferences(answer)

    expect(warnings[0].severity).toBe('medium')
  })

  it('devrait retourner array vide si pas d\'abrogations détectées', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const answer = 'Loi n°9999-99 en vigueur'
    const warnings = await detectAbrogatedReferences(answer)

    expect(warnings).toEqual([])
  })

  it('devrait générer messages bilingues FR/AR', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [
        {
          abrogated_reference: 'Circulaire n°216',
          abrogated_reference_ar: 'المنشور عدد 216',
          abrogating_reference: 'Circulaire n°164',
          abrogating_reference_ar: 'المنشور عدد 164',
          abrogation_date: '2017-09-08',
          scope: 'total',
          similarity_score: 0.90,
          affected_articles: null,
          source_url: null,
          jort_url: null,
          notes: null,
        },
      ],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const answer = 'La Circulaire n°216 interdit...'
    const warnings = await detectAbrogatedReferences(answer)

    expect(warnings[0].message).toBeTruthy()
    expect(warnings[0].messageAr).toBeTruthy()
    expect(warnings[0].message).toContain('216')
    expect(warnings[0].messageAr).toContain('216')
  })

  it('devrait compléter détection en <150ms (performance)', async () => {
    vi.mocked(db.query).mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })

    const answer = 'Loi n°2016-36 et Loi n°2017-58 et Loi n°2020-30'

    const start = Date.now()
    await detectAbrogatedReferences(answer)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(150)
  })
})

// =============================================================================
// TESTS - Helpers
// =============================================================================

describe('Abrogation Detector - Helpers', () => {
  it('normalizeReference - devrait normaliser référence', () => {
    expect(normalizeReference('Loi n°2016-36')).toBe('loi n201636')
    expect(normalizeReference('L.2017-58')).toBe('l201758')
    expect(normalizeReference('القانون عدد 58')).toContain('58')
  })

  it('formatAbrogationWarnings - devrait formater warnings', () => {
    const warnings: AbrogationWarning[] = [
      {
        type: 'abrogation_detected',
        reference: 'Loi n°1968-07',
        position: 10,
        abrogationInfo: mockAbrogationInfo,
        severity: 'high',
        message: 'Test message',
        messageAr: 'رسالة تجريبية',
      },
    ]

    const formatted = formatAbrogationWarnings(warnings)

    expect(formatted).toContain('🚨')
    expect(formatted).toContain('1 référence')
    expect(formatted).toContain('🔴 CRITIQUE')
    expect(formatted).toContain('Test message')
  })

  it('formatAbrogationWarnings - devrait retourner vide si 0 warnings', () => {
    const formatted = formatAbrogationWarnings([])
    expect(formatted).toBe('')
  })
})

// =============================================================================
// TESTS - Edge Cases
// =============================================================================

describe('Abrogation Detector - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait gérer texte vide', async () => {
    const warnings = await detectAbrogatedReferences('')
    expect(warnings).toEqual([])
  })

  it('devrait gérer références multiples dans même texte', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({
        rows: [
          {
            abrogated_reference: 'Loi n°1968-07',
            abrogating_reference: 'Loi n°2016-36',
            abrogation_date: '2016-05-15',
            scope: 'total',
            similarity_score: 0.95,
            abrogated_reference_ar: null,
            abrogating_reference_ar: null,
            affected_articles: null,
            source_url: null,
            jort_url: null,
            notes: null,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            abrogated_reference: 'Circulaire n°216',
            abrogating_reference: 'Circulaire n°164',
            abrogation_date: '2017-09-08',
            scope: 'total',
            similarity_score: 0.90,
            abrogated_reference_ar: null,
            abrogating_reference_ar: null,
            affected_articles: null,
            source_url: null,
            jort_url: null,
            notes: null,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })

    const answer = 'La Loi n°1968-07 et la Circulaire n°216 stipulent...'
    const warnings = await detectAbrogatedReferences(answer)

    expect(warnings.length).toBe(2)
  })

  it('devrait gérer caractères spéciaux dans références', () => {
    const text = 'Loi n°2016-36 §2 (alinéa 3)'
    const refs = extractLegalReferences(text)

    expect(refs.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// TESTS - Performance
// =============================================================================

describe('Abrogation Detector - Performance', () => {
  it('devrait extraire 20 références en <50ms', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Loi n°2020-${i}`).join(', ')

    const start = Date.now()
    const refs = extractLegalReferences(text)
    const elapsed = Date.now() - start

    expect(refs.length).toBeGreaterThanOrEqual(10)
    expect(elapsed).toBeLessThan(50)
  })
})
