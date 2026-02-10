#!/usr/bin/env tsx

/**
 * Script de re-classification des pages 9anoun.tn avec le fast-path deterministe
 *
 * Re-classifie les pages dont :
 * - domain IS NULL
 * - classification_source = 'llm'
 * - confidence_score < 0.90
 *
 * Usage:
 *   npx tsx scripts/reclassify-9anoun-pages.ts --dry-run   # Preview sans ecriture
 *   npx tsx scripts/reclassify-9anoun-pages.ts              # Execution reelle
 */

import { Pool } from 'pg'
import { tryDeterministicClassification } from '../lib/web-scraper/legal-classifier-service'

const isDryRun = process.argv.includes('--dry-run')

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_NAME || 'qadhya',
  user: process.env.DB_USER || 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  connectionTimeoutMillis: 10000,
  keepAlive: true,
}

async function main() {
  console.log(`\nRe-classification 9anoun.tn (${isDryRun ? 'DRY RUN' : 'EXECUTION'})\n`)
  console.log('='.repeat(60))

  const pool = new Pool(DB_CONFIG)

  try {
    await pool.query('SELECT NOW()')
    console.log('DB connectee\n')

    // Trouver les pages 9anoun.tn/kb/ a re-classifier
    const result = await pool.query(`
      SELECT
        wp.id,
        wp.url,
        wp.legal_domain,
        lc.primary_category AS old_category,
        lc.domain AS old_domain,
        lc.document_nature AS old_doc_nature,
        lc.confidence_score AS old_confidence,
        lc.classification_source AS old_source,
        lc.llm_provider AS old_provider
      FROM web_pages wp
      LEFT JOIN legal_classifications lc ON lc.web_page_id = wp.id
      WHERE wp.url LIKE '%9anoun.tn%'
        AND (
          wp.legal_domain IS NULL
          OR lc.classification_source = 'llm'
          OR lc.confidence_score < 0.90
          OR lc.domain IS NULL
        )
      ORDER BY wp.url
    `)

    console.log(`Pages trouvees : ${result.rows.length}\n`)

    let reclassified = 0
    let skipped = 0
    let noMatch = 0

    for (const row of result.rows) {
      const newResult = tryDeterministicClassification(row.url)

      if (!newResult) {
        noMatch++
        continue
      }

      const changed =
        row.old_category !== newResult.primaryCategory ||
        row.old_domain !== newResult.domain ||
        row.old_doc_nature !== newResult.documentNature

      if (!changed && row.old_confidence >= 0.98) {
        skipped++
        continue
      }

      reclassified++

      // Extraire le segment apres /kb/ pour un affichage compact
      const shortUrl = row.url.replace('https://9anoun.tn', '')

      console.log(
        `  ${shortUrl}\n` +
        `    AVANT: cat=${row.old_category || '-'} dom=${row.old_domain || '-'} ` +
        `nature=${row.old_doc_nature || '-'} conf=${row.old_confidence || '-'} src=${row.old_source || '-'}\n` +
        `    APRES: cat=${newResult.primaryCategory} dom=${newResult.domain || '-'} ` +
        `nature=${newResult.documentNature || '-'} conf=${newResult.confidenceScore} src=rules`
      )

      if (!isDryRun) {
        // Mettre a jour legal_classifications
        await pool.query(
          `INSERT INTO legal_classifications (
            web_page_id,
            primary_category, domain, document_nature,
            confidence_score, requires_validation,
            llm_provider, llm_model, tokens_used,
            classification_source, signals_used, rules_matched
          ) VALUES ($1, $2, $3, $4, $5, false, 'none', 'deterministic-url', 0, 'rules', $6, $7)
          ON CONFLICT (web_page_id) DO UPDATE SET
            primary_category = EXCLUDED.primary_category,
            domain = EXCLUDED.domain,
            document_nature = EXCLUDED.document_nature,
            confidence_score = EXCLUDED.confidence_score,
            requires_validation = false,
            llm_provider = EXCLUDED.llm_provider,
            llm_model = EXCLUDED.llm_model,
            tokens_used = 0,
            classification_source = EXCLUDED.classification_source,
            signals_used = EXCLUDED.signals_used,
            rules_matched = EXCLUDED.rules_matched,
            classified_at = NOW()`,
          [
            row.id,
            newResult.primaryCategory,
            newResult.domain,
            newResult.documentNature,
            newResult.confidenceScore,
            JSON.stringify(newResult.signalsUsed),
            newResult.rulesMatched,
          ]
        )

        // Mettre a jour web_pages
        await pool.query(
          `UPDATE web_pages
           SET legal_domain = $1, processing_status = 'classified', updated_at = NOW()
           WHERE id = $2`,
          [newResult.domain, row.id]
        )
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('\nRESUME:')
    console.log(`  Re-classifiees : ${reclassified}`)
    console.log(`  Inchangees     : ${skipped}`)
    console.log(`  Non-matchees   : ${noMatch} (URLs hors patterns connus)`)
    console.log(`  Total          : ${result.rows.length}`)
    if (isDryRun) {
      console.log('\n  (Aucune ecriture - mode --dry-run)')
    }
    console.log()
  } catch (error) {
    console.error('\nErreur:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
