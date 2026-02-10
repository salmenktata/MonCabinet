#!/usr/bin/env tsx

/**
 * Tests unitaires pour le fast-path de classification 9anoun.tn
 * Sans connexion DB requise.
 *
 * Usage:
 *   npx tsx scripts/test-9anoun-classification.ts
 */

import { tryDeterministicClassification } from '../lib/web-scraper/legal-classifier-service'
import { NINEANOUN_CODE_DOMAINS } from '../lib/web-scraper/9anoun-code-domains'

let passed = 0
let failed = 0

function assert(
  testName: string,
  condition: boolean,
  details?: string
) {
  if (condition) {
    passed++
    console.log(`  OK  ${testName}`)
  } else {
    failed++
    console.log(`  FAIL  ${testName}${details ? ` -- ${details}` : ''}`)
  }
}

function assertNull(testName: string, value: unknown) {
  assert(testName, value === null, `expected null, got ${JSON.stringify(value)}`)
}

// ============================================================
// TEST 1: Chaque slug de code -> domaine correct
// ============================================================
console.log('\n1. Codes individuels (50+ tests)\n')

for (const [slug, expected] of Object.entries(NINEANOUN_CODE_DOMAINS)) {
  const url = `https://9anoun.tn/kb/codes/${slug}`
  const result = tryDeterministicClassification(url)

  assert(
    `${slug} -> ${expected.domain}`,
    result !== null &&
      result.primaryCategory === 'legislation' &&
      result.domain === expected.domain &&
      result.documentNature === expected.documentType,
    result
      ? `got cat=${result.primaryCategory} dom=${result.domain} nature=${result.documentNature}`
      : 'got null'
  )
}

// ============================================================
// TEST 2: Articles heritent le domaine du code parent
// ============================================================
console.log('\n2. Articles heritent domaine du code parent\n')

const articleTests = [
  {
    url: 'https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1',
    expectedDomain: 'civil',
  },
  {
    url: 'https://9anoun.tn/kb/codes/code-penal/code-penal-article-312',
    expectedDomain: 'penal',
  },
  {
    url: 'https://9anoun.tn/kb/codes/code-commerce/code-commerce-article-42',
    expectedDomain: 'commercial',
  },
  {
    url: 'https://9anoun.tn/kb/codes/code-tva/code-tva-article-5',
    expectedDomain: 'fiscal',
  },
  {
    url: 'https://9anoun.tn/kb/codes/code-assurances/code-assurances-article-2',
    expectedDomain: 'assurance',
  },
]

for (const test of articleTests) {
  const result = tryDeterministicClassification(test.url)
  const shortUrl = test.url.replace('https://9anoun.tn', '')
  assert(
    `${shortUrl} -> domain=${test.expectedDomain}`,
    result !== null &&
      result.primaryCategory === 'legislation' &&
      result.domain === test.expectedDomain,
    result
      ? `got dom=${result.domain}`
      : 'got null'
  )
}

// ============================================================
// TEST 3: Sections non-code (/kb/jurisprudence, /kb/doctrine, etc.)
// ============================================================
console.log('\n3. Sections /kb/ non-code\n')

const sectionTests = [
  {
    url: 'https://9anoun.tn/kb/jurisprudence/some-case-123',
    expectedCategory: 'jurisprudence',
    expectedDomain: null,
    expectedNature: 'arret',
  },
  {
    url: 'https://9anoun.tn/kb/doctrine/some-article',
    expectedCategory: 'doctrine',
    expectedDomain: null,
    expectedNature: 'article_doctrine',
  },
  {
    url: 'https://9anoun.tn/kb/jorts/jort-2024-001',
    expectedCategory: 'jort',
    expectedDomain: null,
    expectedNature: 'jort_publication',
  },
  {
    url: 'https://9anoun.tn/kb/constitutions/constitution-2022',
    expectedCategory: 'legislation',
    expectedDomain: 'constitutionnel',
    expectedNature: 'constitution',
  },
  {
    url: 'https://9anoun.tn/kb/conventions/convention-abc',
    expectedCategory: 'legislation',
    expectedDomain: 'international_public',
    expectedNature: 'convention',
  },
  {
    url: 'https://9anoun.tn/kb/lois/loi-2024-10',
    expectedCategory: 'legislation',
    expectedDomain: null,
    expectedNature: 'loi',
  },
]

for (const test of sectionTests) {
  const result = tryDeterministicClassification(test.url)
  const shortUrl = test.url.replace('https://9anoun.tn', '')
  assert(
    `${shortUrl} -> cat=${test.expectedCategory} dom=${test.expectedDomain} nature=${test.expectedNature}`,
    result !== null &&
      result.primaryCategory === test.expectedCategory &&
      result.domain === test.expectedDomain &&
      result.documentNature === test.expectedNature,
    result
      ? `got cat=${result.primaryCategory} dom=${result.domain} nature=${result.documentNature}`
      : 'got null'
  )
}

// ============================================================
// TEST 4: Sections hors /kb/ (modeles, formulaires)
// ============================================================
console.log('\n4. Sections hors /kb/\n')

const otherTests = [
  {
    url: 'https://9anoun.tn/modeles/contrat-bail',
    expectedCategory: 'modeles',
    expectedNature: 'modele_contrat',
  },
  {
    url: 'https://9anoun.tn/formulaires/demande-extrait',
    expectedCategory: 'formulaires',
    expectedNature: 'formulaire',
  },
]

for (const test of otherTests) {
  const result = tryDeterministicClassification(test.url)
  const shortUrl = test.url.replace('https://9anoun.tn', '')
  assert(
    `${shortUrl} -> cat=${test.expectedCategory}`,
    result !== null &&
      result.primaryCategory === test.expectedCategory &&
      result.documentNature === test.expectedNature,
    result
      ? `got cat=${result.primaryCategory} nature=${result.documentNature}`
      : 'got null'
  )
}

// ============================================================
// TEST 5: URLs non-9anoun retournent null
// ============================================================
console.log('\n5. URLs non-9anoun -> null\n')

const nullTests = [
  'https://legislation.tn/loi-2024',
  'https://cassation.tn/arret/123',
  'https://example.com/kb/codes/code-penal',
  'https://da5ira.com/2024/01/article.html',
]

for (const url of nullTests) {
  assertNull(`${url} -> null`, tryDeterministicClassification(url))
}

// ============================================================
// TEST 6: Proprietes du resultat (confidence, tokens, provider)
// ============================================================
console.log('\n6. Proprietes du resultat\n')

const sampleResult = tryDeterministicClassification(
  'https://9anoun.tn/kb/codes/code-penal'
)!

assert('confidenceScore = 0.98', sampleResult.confidenceScore === 0.98)
assert('tokensUsed = 0', sampleResult.tokensUsed === 0)
assert('llmProvider = none', sampleResult.llmProvider === 'none')
assert('llmModel = deterministic-url', sampleResult.llmModel === 'deterministic-url')
assert('classificationSource = rules', sampleResult.classificationSource === 'rules')
assert('requiresValidation = false', sampleResult.requiresValidation === false)
assert('signalsUsed.length = 1', sampleResult.signalsUsed.length === 1)
assert('rulesMatched includes deterministic', sampleResult.rulesMatched.includes('deterministic-9anoun-url'))

// ============================================================
// TEST 7: Slug inconnu dans /kb/codes/ -> legislation sans domaine
// ============================================================
console.log('\n7. Slug inconnu -> fallback legislation\n')

const unknownResult = tryDeterministicClassification(
  'https://9anoun.tn/kb/codes/code-inconnu-2030'
)!

assert('slug inconnu -> legislation', unknownResult.primaryCategory === 'legislation')
assert('slug inconnu -> domain null', unknownResult.domain === null)
assert('slug inconnu -> nature loi', unknownResult.documentNature === 'loi')

// ============================================================
// RESUME
// ============================================================
console.log('\n' + '='.repeat(60))
console.log(`\nResultats: ${passed} OK, ${failed} FAIL (total: ${passed + failed})`)

if (failed > 0) {
  console.log('\nDes tests ont echoue !\n')
  process.exit(1)
} else {
  console.log('\nTous les tests passent !\n')
}
