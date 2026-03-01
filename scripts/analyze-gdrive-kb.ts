#!/usr/bin/env tsx
/**
 * Analyse et nettoyage des documents KB provenant d'une source Google Drive
 *
 * Source cible : gdrive://1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS
 *
 * Phases :
 *   --analyze         (défaut) : rapport complet, lecture seule
 *   --fix-titles      : renomme les docs avec titre "Inconnu" ou corrompu
 *   --delete-useless  : supprime les docs sans contenu exploitable
 *   --dry-run         : simule sans écrire en DB
 *
 * Usage :
 *   npx tsx scripts/analyze-gdrive-kb.ts --analyze
 *   npx tsx scripts/analyze-gdrive-kb.ts --fix-titles --dry-run
 *   npx tsx scripts/analyze-gdrive-kb.ts --delete-useless --dry-run
 *   npx tsx scripts/analyze-gdrive-kb.ts --fix-titles
 *   npx tsx scripts/analyze-gdrive-kb.ts --delete-useless
 *
 * Prérequis prod :
 *   - Tunnel SSH actif sur port 5434 (npm run tunnel:start)
 *   - DATABASE_URL=postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Charger .env.local en priorité (nécessaire pour DATABASE_URL)
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { db } from '@/lib/db/postgres'

const GDRIVE_BASE_URL = 'gdrive://1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS'

// Seuils de qualité
const MIN_TEXT_LENGTH = 100  // < 100 chars = inutilisable
const MIN_TITLE_LENGTH = 3   // titre trop court

// Patterns de titres corrompus (réutilisés depuis web-indexer-service.ts:467-471)
function isCorruptedTitle(title: string): boolean {
  if (!title) return true
  return (
    /_{3,}/.test(title) ||                         // underscores arabes corrompus
    /^[A-F0-9~]+\.\w{3,4}$/i.test(title) ||       // noms 8.3 (A71E~D.DOC)
    (/\.\w{3,4}$/.test(title) && !/[\u0600-\u06FF]/.test(title) && title.length < 30) // court sans arabe
  )
}

function isInconnuTitle(title: string): boolean {
  if (!title) return true
  const t = title.trim().toLowerCase()
  return t === 'inconnu' || t.startsWith('inconnu') || t === 'unknown' || t.length < MIN_TITLE_LENGTH
}

function needsRename(title: string): boolean {
  return isInconnuTitle(title) || isCorruptedTitle(title)
}

type DocStatus = 'OK' | 'NEEDS_RENAME' | 'USELESS' | 'BOTH'

interface GDriveKBDoc {
  id: string
  title: string
  category: string
  language: string
  is_indexed: boolean
  text_length: number
  chunk_count: number
  linked_files: Array<{ filename?: string; url?: string; source?: string }> | null
  url: string | null
  created_at: Date
  status: DocStatus
  rename_suggestion: string | null
  useless_reason: string | null
}

async function findSourceId(): Promise<string | null> {
  const result = await db.query(
    `SELECT id, name FROM web_sources WHERE base_url = $1`,
    [GDRIVE_BASE_URL]
  )
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  console.log(`✅ Source trouvée : "${row.name}" (${row.id})`)
  return row.id as string
}

async function listDocs(sourceId: string): Promise<GDriveKBDoc[]> {
  const result = await db.query(`
    WITH source_pages AS (
      SELECT wp.id as page_id, wp.knowledge_base_id, wp.linked_files, wp.url
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND wp.knowledge_base_id IS NOT NULL
    )
    SELECT
      kb.id,
      kb.title,
      kb.category,
      kb.language,
      kb.is_indexed,
      COALESCE(LENGTH(kb.full_text), 0)::int as text_length,
      COUNT(kbc.id)::int as chunk_count,
      sp.linked_files,
      sp.url,
      kb.created_at
    FROM knowledge_base kb
    INNER JOIN source_pages sp ON sp.knowledge_base_id = kb.id
    LEFT JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    GROUP BY kb.id, sp.linked_files, sp.url
    ORDER BY kb.created_at DESC
  `, [sourceId])

  return result.rows.map((row) => {
    const textLen = row.text_length as number
    const chunkCount = row.chunk_count as number
    const title = row.title as string

    // Détecter si le doc est inutilisable
    const isUseless = textLen < MIN_TEXT_LENGTH && chunkCount === 0
    const uselessReason = isUseless
      ? (textLen === 0 ? 'Contenu vide' : `Contenu trop court (${textLen} chars) et non indexé`)
      : null

    // Détecter si le titre doit être corrigé
    const needsRenameFlag = needsRename(title)

    // Suggestion rapide depuis linked_files (sans fetch full_text)
    let renameSuggestion: string | null = null
    if (needsRenameFlag) {
      const files = row.linked_files as Array<{ filename?: string }> | null
      const filename = files?.[0]?.filename
      if (filename && !isCorruptedTitle(filename) && !isInconnuTitle(filename)) {
        renameSuggestion = filename.replace(/\.[a-zA-Z]{2,4}$/, '').replace(/_/g, ' ').trim()
      }
    }

    let status: DocStatus
    if (isUseless && needsRenameFlag) {
      status = 'BOTH'
    } else if (isUseless) {
      status = 'USELESS'
    } else if (needsRenameFlag) {
      status = 'NEEDS_RENAME'
    } else {
      status = 'OK'
    }

    return {
      id: row.id as string,
      title,
      category: row.category as string,
      language: row.language as string,
      is_indexed: row.is_indexed as boolean,
      text_length: textLen,
      chunk_count: chunkCount,
      linked_files: row.linked_files as GDriveKBDoc['linked_files'],
      url: row.url as string | null,
      created_at: row.created_at as Date,
      status,
      rename_suggestion: renameSuggestion,
      useless_reason: uselessReason,
    }
  })
}

async function getBetterTitle(docId: string, linked_files: GDriveKBDoc['linked_files']): Promise<string> {
  // Priorité 1 : filename depuis linked_files (si propre)
  const filename = linked_files?.[0]?.filename
  if (filename && !isCorruptedTitle(filename) && !isInconnuTitle(filename)) {
    return filename.replace(/\.[a-zA-Z]{2,4}$/, '').replace(/_/g, ' ').trim()
  }

  // Priorité 2 : première ligne significative du full_text
  const result = await db.query(
    `SELECT full_text FROM knowledge_base WHERE id = $1`,
    [docId]
  )
  const fullText: string = result.rows[0]?.full_text || ''
  if (fullText) {
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length >= 10)
    if (lines.length > 0) {
      return lines[0].substring(0, 200)
    }
  }

  // Fallback
  return `Document sans titre (${new Date().toISOString().split('T')[0]})`
}

function printAnalysis(docs: GDriveKBDoc[]): void {
  const ok = docs.filter(d => d.status === 'OK')
  const needsRenameList = docs.filter(d => d.status === 'NEEDS_RENAME' || d.status === 'BOTH')
  const uselessList = docs.filter(d => d.status === 'USELESS' || d.status === 'BOTH')

  console.log('\n' + '='.repeat(80))
  console.log("📊 RAPPORT D'ANALYSE — KB Google Drive")
  console.log('='.repeat(80))
  console.log(`\n📁 Source : ${GDRIVE_BASE_URL}`)
  console.log(`📄 Total documents : ${docs.length}`)
  console.log(`   ✅ OK            : ${ok.length}`)
  console.log(`   ✏️  À renommer    : ${needsRenameList.length}`)
  console.log(`   🗑️  Inutilisables : ${uselessList.length}`)

  if (needsRenameList.length > 0) {
    console.log('\n' + '─'.repeat(80))
    console.log('✏️  DOCUMENTS À RENOMMER')
    console.log('─'.repeat(80))
    for (const doc of needsRenameList) {
      const reason = isInconnuTitle(doc.title) ? 'titre "Inconnu"' : 'titre corrompu'
      console.log(`\n  📄 ID: ${doc.id}`)
      console.log(`     Titre actuel  : "${doc.title}"`)
      console.log(`     Raison        : ${reason}`)
      console.log(`     Suggestion    : ${doc.rename_suggestion ? `"${doc.rename_suggestion}"` : '(à calculer depuis full_text)'}`)
      console.log(`     Contenu       : ${doc.text_length} chars, ${doc.chunk_count} chunks`)
    }
  }

  if (uselessList.length > 0) {
    console.log('\n' + '─'.repeat(80))
    console.log('🗑️  DOCUMENTS INUTILISABLES')
    console.log('─'.repeat(80))
    for (const doc of uselessList) {
      console.log(`\n  📄 ID: ${doc.id}`)
      console.log(`     Titre   : "${doc.title}"`)
      console.log(`     Raison  : ${doc.useless_reason}`)
      console.log(`     URL     : ${doc.url || 'N/A'}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('💡 Prochaines étapes :')
  if (needsRenameList.length > 0) {
    console.log(`   npx tsx scripts/analyze-gdrive-kb.ts --fix-titles --dry-run`)
    console.log(`   npx tsx scripts/analyze-gdrive-kb.ts --fix-titles`)
  }
  if (uselessList.length > 0) {
    console.log(`   npx tsx scripts/analyze-gdrive-kb.ts --delete-useless --dry-run`)
    console.log(`   npx tsx scripts/analyze-gdrive-kb.ts --delete-useless`)
  }
  console.log('='.repeat(80) + '\n')
}

async function fixTitles(docs: GDriveKBDoc[], dryRun: boolean): Promise<void> {
  const toRename = docs.filter(d => d.status === 'NEEDS_RENAME' || d.status === 'BOTH')

  console.log('\n' + '='.repeat(80))
  console.log(`✏️  RENOMMAGE DES DOCUMENTS${dryRun ? ' [DRY RUN]' : ''}`)
  console.log('='.repeat(80))
  console.log(`\n📋 ${toRename.length} documents à renommer\n`)

  let renamed = 0
  let skipped = 0

  for (const doc of toRename) {
    const newTitle = await getBetterTitle(doc.id, doc.linked_files)
    console.log(`  📄 "${doc.title}"`)
    console.log(`     → "${newTitle}"`)

    if (dryRun) {
      console.log(`     [DRY RUN] Pas de modification`)
      skipped++
    } else {
      try {
        await db.query(
          `UPDATE knowledge_base SET title = $1, updated_at = NOW() WHERE id = $2`,
          [newTitle, doc.id]
        )
        console.log(`     ✅ Renommé`)
        renamed++
      } catch (err) {
        console.error(`     ❌ Erreur:`, err)
        skipped++
      }
    }
    console.log()
  }

  console.log('─'.repeat(80))
  if (dryRun) {
    console.log(`📊 Résumé [DRY RUN] : ${toRename.length} seraient renommés`)
  } else {
    console.log(`📊 Résumé : ${renamed} renommés, ${skipped} ignorés`)
  }
  console.log()
}

async function deleteUseless(docs: GDriveKBDoc[], dryRun: boolean): Promise<void> {
  const toDelete = docs.filter(d => d.status === 'USELESS' || d.status === 'BOTH')

  console.log('\n' + '='.repeat(80))
  console.log(`🗑️  SUPPRESSION DES DOCUMENTS INUTILISABLES${dryRun ? ' [DRY RUN]' : ''}`)
  console.log('='.repeat(80))
  console.log(`\n📋 ${toDelete.length} documents à supprimer\n`)

  let deleted = 0
  let skipped = 0

  for (const doc of toDelete) {
    console.log(`  📄 "${doc.title}" (${doc.id})`)
    console.log(`     Raison : ${doc.useless_reason}`)

    if (dryRun) {
      console.log(`     [DRY RUN] Pas de suppression`)
      skipped++
    } else {
      try {
        // 1. Délier la web_page
        await db.query(
          `UPDATE web_pages SET knowledge_base_id = NULL WHERE knowledge_base_id = $1`,
          [doc.id]
        )
        // 2. Supprimer les chunks (généralement 0 pour les docs inutilisables)
        await db.query(
          `DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1`,
          [doc.id]
        )
        // 3. Supprimer le document KB
        await db.query(
          `DELETE FROM knowledge_base WHERE id = $1`,
          [doc.id]
        )
        console.log(`     ✅ Supprimé`)
        deleted++
      } catch (err) {
        console.error(`     ❌ Erreur:`, err)
        skipped++
      }
    }
    console.log()
  }

  console.log('─'.repeat(80))
  if (dryRun) {
    console.log(`📊 Résumé [DRY RUN] : ${toDelete.length} seraient supprimés`)
  } else {
    console.log(`📊 Résumé : ${deleted} supprimés, ${skipped} ignorés`)
  }
  console.log()
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const doFixTitles = args.includes('--fix-titles')
  const doDeleteUseless = args.includes('--delete-useless')
  const doAnalyze = args.includes('--analyze') || (!doFixTitles && !doDeleteUseless)

  console.log('\n🔍 Analyse KB Google Drive — Qadhya')
  console.log(`   Source : ${GDRIVE_BASE_URL}`)
  console.log(`   Mode   : ${dryRun ? 'DRY RUN (simulation)' : 'PRODUCTION'}`)
  const phases = [doAnalyze && 'analyze', doFixTitles && 'fix-titles', doDeleteUseless && 'delete-useless'].filter(Boolean)
  console.log(`   Phases : ${phases.join(' + ')}\n`)

  try {
    // 1. Trouver la source
    const sourceId = await findSourceId()
    if (!sourceId) {
      console.error(`❌ Source non trouvée : ${GDRIVE_BASE_URL}`)
      console.error('   Vérifier que DATABASE_URL pointe vers la bonne base de données')
      process.exit(1)
    }

    // 2. Lister les documents
    console.log('📋 Chargement des documents...')
    const docs = await listDocs(sourceId)
    console.log(`✅ ${docs.length} documents chargés`)

    if (docs.length === 0) {
      console.log('\n⚠️  Aucun document KB trouvé pour cette source.')
      process.exit(0)
    }

    // 3. Exécuter les phases demandées
    if (doAnalyze) {
      printAnalysis(docs)
    }

    if (doFixTitles) {
      await fixTitles(docs, dryRun)
    }

    if (doDeleteUseless) {
      await deleteUseless(docs, dryRun)
    }

    console.log('✅ Terminé\n')

  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await db.closePool()
  }
}

main()
