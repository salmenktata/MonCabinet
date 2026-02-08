#!/usr/bin/env tsx
/**
 * Script de test : Classification d'une page 9anoun.tn
 * Test réel du système de classification multi-signaux
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
config({ path: resolve(process.cwd(), '.env') })

import { db } from '@/lib/db/postgres'
import { classifyLegalContent } from '@/lib/web-scraper/legal-classifier-service'
import type { SiteStructure } from '@/lib/web-scraper/types'

const TEST_URL = 'https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1'

const TEST_PAGE_CONTENT = `
مجلة الالتزامات والعقود - الفصل 1

Code of Obligations and Contracts - Chapter 1

الفصل 1:
تعمير الذمة يترتب على الاتفاقات وغيرها من التصريحات الإرادية وعن شبه العقود والجنح وشبهها

Article 1:
Obligation and liability arise from agreements, other voluntary declarations, quasi-contracts, offenses, and similar circumstances.

المصدر: المعهد الأعلى للقضاء (IORT - Journal Officiel de la République Tunisienne)

الكلمات المفتاحية: العقد، الالتزامات، جنحة، شبه العقود
`

const TEST_SITE_STRUCTURE: SiteStructure = {
  breadcrumbs: [
    { label: 'قاعدة المعرفة', url: '/kb', level: 1 },
    { label: 'القوانين', url: '/kb/codes', level: 2 },
    { label: 'مجلة الالتزامات والعقود', url: '/kb/codes/code-obligations-contrats', level: 3 },
    { label: 'الفصل 1', url: '/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1', level: 4 },
  ],
  urlPath: {
    fullPath: '/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1',
    segments: [
      { value: 'kb', position: 0, isNumeric: false, isDate: false, suggestedMeaning: 'knowledge base' },
      { value: 'codes', position: 1, isNumeric: false, isDate: false, suggestedMeaning: 'legislation' },
      { value: 'code-obligations-contrats', position: 2, isNumeric: false, isDate: false, suggestedMeaning: 'code civil' },
      { value: 'code-obligations-contrats-article-1', position: 3, isNumeric: false, isDate: false, suggestedMeaning: 'article' },
    ],
    queryParams: {},
    detectedPatterns: [
      {
        pattern: '/codes/',
        suggestedCategory: 'legislation',
        suggestedDomain: 'civil',
        suggestedDocumentType: 'loi',
        confidence: 0.9,
      },
    ],
  },
  navigation: [
    { label: 'الفصل 2', url: '/kb/codes/code-obligations-contrats/code-obligations-contrats-article-2', isActive: false, level: 1 },
  ],
  headings: {
    h1: 'Code des Obligations et Contrats - Article 1 - مجلة الالتزامات والعقود - الفصل 1',
    h2: [],
    h3: [],
    structure: [],
  },
  sectionContext: {
    parentSection: 'Codes',
    currentSection: 'Code des Obligations et Contrats',
    siblingPages: ['Code Civil', 'Code de Procédure Civile'],
  },
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 TEST DE CLASSIFICATION - Page 9anoun.tn')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log(`📄 URL: ${TEST_URL}\n`)

  let webSourceId: string
  let pageId: string | null = null

  try {
    // 1. Trouver ou créer la source web 9anoun.tn
    console.log('1️⃣  Recherche de la source web 9anoun.tn...')

    const sourceResult = await db.query(
      `SELECT id, name, category FROM web_sources WHERE base_url LIKE '%9anoun.tn%' LIMIT 1`
    )

    if (sourceResult.rows.length === 0) {
      console.log('   ⚠️  Source non trouvée, création d\'une source de test...')

      const createResult = await db.query(
        `INSERT INTO web_sources (
          name, base_url, category, is_active
        ) VALUES ($1, $2, $3, true)
        RETURNING id, name, category`,
        ['9anoun.tn (TEST)', 'https://9anoun.tn', 'legislation']
      )

      webSourceId = createResult.rows[0].id
      console.log(`   ✅ Source créée: ${createResult.rows[0].name} (${createResult.rows[0].category})`)
    } else {
      webSourceId = sourceResult.rows[0].id
      console.log(`   ✅ Source trouvée: ${sourceResult.rows[0].name} (${sourceResult.rows[0].category})`)
    }

    // 2. Créer une page de test
    console.log('\n2️⃣  Création de la page de test...')

    const pageResult = await db.query(
      `INSERT INTO web_pages (
        web_source_id, url, url_hash, title, extracted_text,
        processing_status, site_structure
      ) VALUES ($1, $2, $3, $4, $5, 'analyzed', $6)
      RETURNING id, url, title`,
      [
        webSourceId,
        TEST_URL,
        require('crypto').createHash('sha256').update(TEST_URL).digest('hex'),
        'Code des Obligations et Contrats - Article 1',
        TEST_PAGE_CONTENT,
        JSON.stringify(TEST_SITE_STRUCTURE),
      ]
    )

    pageId = pageResult.rows[0].id
    console.log(`   ✅ Page créée: ${pageResult.rows[0].title}`)
    console.log(`   📋 ID: ${pageId}`)

    // 3. Classifier la page
    console.log('\n3️⃣  Classification en cours...\n')

    const startTime = Date.now()
    const result = await classifyLegalContent(pageId!)
    const duration = Date.now() - startTime

    // 4. Afficher les résultats détaillés
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 RÉSULTATS DE LA CLASSIFICATION')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🎯 Classification finale:')
    console.log(`   • Catégorie principale: ${result.primaryCategory}`)
    console.log(`   • Sous-catégorie: ${result.subcategory || 'N/A'}`)
    console.log(`   • Domaine juridique: ${result.domain || 'N/A'}`)
    console.log(`   • Sous-domaine: ${result.subdomain || 'N/A'}`)
    console.log(`   • Nature du document: ${result.documentNature || 'N/A'}`)

    console.log(`\n📈 Confiance:`)
    console.log(`   • Score: ${(result.confidenceScore * 100).toFixed(1)}%`)
    console.log(`   • Validation requise: ${result.requiresValidation ? '⚠️  OUI' : '✅ NON'}`)
    if (result.validationReason) {
      console.log(`   • Raison: ${result.validationReason}`)
    }

    console.log(`\n🔍 Source de classification: ${result.classificationSource}`)

    if (result.signalsUsed.length > 0) {
      console.log(`\n📡 Signaux utilisés (${result.signalsUsed.length}):`)
      for (const signal of result.signalsUsed) {
        console.log(`\n   ${signal.source.toUpperCase()} (poids: ${(signal.weight * 100).toFixed(0)}%):`)
        console.log(`   • Catégorie: ${signal.category || 'N/A'}`)
        console.log(`   • Domaine: ${signal.domain || 'N/A'}`)
        console.log(`   • Type doc: ${signal.documentType || 'N/A'}`)
        console.log(`   • Confiance: ${(signal.confidence * 100).toFixed(1)}%`)
        console.log(`   • Évidence: ${signal.evidence}`)
      }
    }

    if (result.structureHints && result.structureHints.length > 0) {
      console.log(`\n🏗️  Indices structurels détectés (${result.structureHints.length}):`)
      for (const hint of result.structureHints) {
        console.log(`   • ${hint.source}: ${hint.evidence} (confiance: ${(hint.confidence * 100).toFixed(0)}%)`)
        if (hint.suggestedCategory) console.log(`     → Catégorie: ${hint.suggestedCategory}`)
        if (hint.suggestedDomain) console.log(`     → Domaine: ${hint.suggestedDomain}`)
        if (hint.suggestedDocumentType) console.log(`     → Type: ${hint.suggestedDocumentType}`)
      }
    }

    if (result.rulesMatched.length > 0) {
      console.log(`\n📋 Règles matchées (${result.rulesMatched.length}):`)
      for (const ruleId of result.rulesMatched) {
        console.log(`   • ${ruleId}`)
      }
    }

    if (result.legalKeywords.length > 0) {
      console.log(`\n🔑 Mots-clés juridiques extraits:`)
      console.log(`   ${result.legalKeywords.join(', ')}`)
    }

    if (result.alternativeClassifications.length > 0) {
      console.log(`\n🔄 Classifications alternatives:`)
      for (const alt of result.alternativeClassifications) {
        console.log(`   • ${alt.category} / ${alt.domain} (${(alt.confidence * 100).toFixed(0)}%)`)
        if (alt.reason) console.log(`     Raison: ${alt.reason}`)
      }
    }

    console.log(`\n🤖 LLM:`)
    console.log(`   • Provider: ${result.llmProvider}`)
    console.log(`   • Modèle: ${result.llmModel}`)
    console.log(`   • Tokens utilisés: ${result.tokensUsed}`)

    console.log(`\n⏱️  Temps de classification: ${duration}ms`)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error) {
    console.error('\n❌ ERREUR:', error)
    throw error
  } finally {
    // 5. Nettoyage
    if (pageId) {
      console.log('🧹 Nettoyage des données de test...')

      await db.query(`DELETE FROM legal_classifications WHERE web_page_id = $1`, [pageId])
      await db.query(`DELETE FROM web_pages WHERE id = $1`, [pageId])

      console.log('   ✅ Données de test supprimées\n')
    }

    await db.closePool()
  }
}

main().catch(console.error)
