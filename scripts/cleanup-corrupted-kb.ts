#!/usr/bin/env tsx
/**
 * Script de nettoyage des contenus corrompus dans la Base de Connaissances
 *
 * Étapes :
 * 1. Identifier les documents avec contenus corrompus
 * 2. Marquer ces documents comme non indexés (is_indexed=false)
 * 3. Supprimer leurs chunks pour éviter pollution du RAG
 * 4. Générer un rapport des documents à réindexer
 *
 * Usage :
 *   npx tsx scripts/cleanup-corrupted-kb.ts [--dry-run] [--category=<category>]
 */

import { db } from '@/lib/db/db';
import { sql } from 'drizzle-orm';

interface CorruptedChunk {
  chunk_id: string;
  kb_id: string;
  kb_title: string;
  category: string;
  source_file: string;
  chunk_length: number;
  preview: string;
  issue_type: 'invalid_chars' | 'too_short' | 'empty';
}

interface CorruptedDocument {
  id: string;
  title: string;
  category: string;
  source_file: string;
  chunk_count: number;
  corrupted_chunks: number;
  corruption_ratio: number;
  issues: string[];
}

async function identifyCorruptedChunks(): Promise<CorruptedChunk[]> {
  console.log('🔍 Identification des chunks corrompus...\n');

  const query = sql`
    SELECT
      kbc.id as chunk_id,
      kb.id as kb_id,
      kb.title as kb_title,
      kb.category,
      kb.source_file,
      LENGTH(kbc.content) as chunk_length,
      LEFT(kbc.content, 200) as preview,
      CASE
        WHEN kbc.content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]' THEN 'invalid_chars'
        WHEN LENGTH(kbc.content) < 50 THEN 'too_short'
        WHEN kbc.content IS NULL OR kbc.content = '' THEN 'empty'
      END as issue_type
    FROM knowledge_base_chunks kbc
    INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.is_active = true
    AND (
      -- Caractères invalides (hors ASCII printable, arabes, espaces)
      kbc.content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
      -- Chunks très courts
      OR LENGTH(kbc.content) < 50
      -- Chunks vides
      OR kbc.content IS NULL
      OR kbc.content = ''
    )
    ORDER BY kb.category, kb.title, kbc.chunk_index;
  `;

  const results = await db.execute(query);
  return results.rows as any as CorruptedChunk[];
}

async function analyzeCorruptedDocuments(chunks: CorruptedChunk[]): Promise<CorruptedDocument[]> {
  console.log('📊 Analyse des documents corrompus...\n');

  // Grouper par document
  const docMap = new Map<string, CorruptedDocument>();

  for (const chunk of chunks) {
    if (!docMap.has(chunk.kb_id)) {
      // Récupérer le nombre total de chunks pour ce document
      const totalChunks = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM knowledge_base_chunks
        WHERE knowledge_base_id = ${chunk.kb_id}
      `);

      docMap.set(chunk.kb_id, {
        id: chunk.kb_id,
        title: chunk.kb_title,
        category: chunk.category,
        source_file: chunk.source_file || 'N/A',
        chunk_count: Number(totalChunks.rows[0].total),
        corrupted_chunks: 0,
        corruption_ratio: 0,
        issues: [],
      });
    }

    const doc = docMap.get(chunk.kb_id)!;
    doc.corrupted_chunks++;
    if (!doc.issues.includes(chunk.issue_type)) {
      doc.issues.push(chunk.issue_type);
    }
  }

  // Calculer les ratios
  const docs = Array.from(docMap.values());
  docs.forEach(doc => {
    doc.corruption_ratio = doc.corrupted_chunks / doc.chunk_count;
  });

  // Trier par ratio de corruption (pire en premier)
  docs.sort((a, b) => b.corruption_ratio - a.corruption_ratio);

  return docs;
}

async function cleanupCorruptedDocuments(
  docs: CorruptedDocument[],
  options: { dryRun: boolean; minCorruptionRatio: number; category?: string }
): Promise<void> {
  console.log('🧹 Nettoyage des documents corrompus...\n');

  // Filtrer les documents à nettoyer
  let docsToClean = docs.filter(doc => doc.corruption_ratio >= options.minCorruptionRatio);

  if (options.category) {
    docsToClean = docsToClean.filter(doc => doc.category === options.category);
  }

  console.log(`📋 ${docsToClean.length} documents à nettoyer (ratio >= ${options.minCorruptionRatio * 100}%)\n`);

  if (docsToClean.length === 0) {
    console.log('✅ Aucun document à nettoyer.');
    return;
  }

  for (const doc of docsToClean) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 ${doc.title}`);
    console.log(`   Catégorie: ${doc.category}`);
    console.log(`   Fichier: ${doc.source_file}`);
    console.log(`   Chunks corrompus: ${doc.corrupted_chunks}/${doc.chunk_count} (${(doc.corruption_ratio * 100).toFixed(1)}%)`);
    console.log(`   Problèmes: ${doc.issues.join(', ')}`);

    if (options.dryRun) {
      console.log(`   [DRY RUN] Serait marqué comme non indexé et ses chunks seraient supprimés`);
    } else {
      try {
        // Supprimer les chunks
        await db.execute(sql`
          DELETE FROM knowledge_base_chunks
          WHERE knowledge_base_id = ${doc.id}
        `);

        // Marquer le document comme non indexé
        await db.execute(sql`
          UPDATE knowledge_base
          SET
            is_indexed = false,
            chunk_count = 0,
            pipeline_stage = 'crawled',
            pipeline_notes = CONCAT(
              COALESCE(pipeline_notes || E'\n', ''),
              'Marqué comme non indexé le ',
              NOW()::text,
              ' - Raison: contenu corrompu (',
              ${doc.corrupted_chunks}::text,
              '/',
              ${doc.chunk_count}::text,
              ' chunks corrompus)'
            )
          WHERE id = ${doc.id}
        `);

        console.log(`   ✅ Nettoyé avec succès`);
      } catch (error) {
        console.error(`   ❌ Erreur lors du nettoyage:`, error);
      }
    }
  }
}

async function generateReport(
  allDocs: CorruptedDocument[],
  cleanedDocs: CorruptedDocument[]
): Promise<void> {
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 RAPPORT DE NETTOYAGE');
  console.log('='.repeat(80) + '\n');

  console.log(`📈 Statistiques globales:`);
  console.log(`   - Total documents analysés avec corruption: ${allDocs.length}`);
  console.log(`   - Documents nettoyés: ${cleanedDocs.length}`);
  console.log(`   - Documents restants avec corruption mineure: ${allDocs.length - cleanedDocs.length}\n`);

  // Statistiques par catégorie
  const byCategory = new Map<string, number>();
  cleanedDocs.forEach(doc => {
    byCategory.set(doc.category, (byCategory.get(doc.category) || 0) + 1);
  });

  console.log(`📁 Répartition par catégorie des documents nettoyés:`);
  Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`   - ${category}: ${count} documents`);
    });

  // Documents avec corruption mineure (à surveiller)
  const minorCorruption = allDocs.filter(
    doc => !cleanedDocs.some(cleaned => cleaned.id === doc.id)
  );

  if (minorCorruption.length > 0) {
    console.log(`\n⚠️  Documents avec corruption mineure (non nettoyés):`);
    minorCorruption.slice(0, 10).forEach(doc => {
      console.log(`   - ${doc.title} (${(doc.corruption_ratio * 100).toFixed(1)}% corrompu)`);
    });
    if (minorCorruption.length > 10) {
      console.log(`   ... et ${minorCorruption.length - 10} autres`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔄 Prochaines étapes recommandées:');
  console.log('='.repeat(80) + '\n');
  console.log('1. Vérifier les sources des documents nettoyés');
  console.log('2. Améliorer l\'extraction de texte (OCR pour PDFs scannés)');
  console.log('3. Réindexer les documents avec de meilleurs extracteurs');
  console.log('4. Exécuter: npx tsx scripts/reindex-kb-improved.ts\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const categoryArg = args.find(arg => arg.startsWith('--category='));
  const category = categoryArg ? categoryArg.split('=')[1] : undefined;
  const minRatio = parseFloat(args.find(arg => arg.startsWith('--min-ratio='))?.split('=')[1] || '0.5');

  console.log('🚀 Nettoyage des contenus corrompus de la Base de Connaissances\n');
  console.log(`Configuration:`);
  console.log(`   - Mode: ${dryRun ? 'DRY RUN (simulation)' : 'PRODUCTION (nettoyage réel)'}`);
  console.log(`   - Ratio minimum de corruption: ${minRatio * 100}%`);
  console.log(`   - Catégorie filtrée: ${category || 'toutes'}\n`);

  try {
    // Étape 1: Identifier les chunks corrompus
    const corruptedChunks = await identifyCorruptedChunks();
    console.log(`✅ ${corruptedChunks.length} chunks corrompus identifiés\n`);

    if (corruptedChunks.length === 0) {
      console.log('🎉 Aucun chunk corrompu trouvé ! La KB est propre.\n');
      process.exit(0);
    }

    // Étape 2: Analyser les documents
    const corruptedDocs = await analyzeCorruptedDocuments(corruptedChunks);
    console.log(`✅ ${corruptedDocs.length} documents avec corruption identifiés\n`);

    // Étape 3: Nettoyer les documents
    const docsToClean = corruptedDocs.filter(doc => {
      let match = doc.corruption_ratio >= minRatio;
      if (category) match = match && doc.category === category;
      return match;
    });

    await cleanupCorruptedDocuments(corruptedDocs, {
      dryRun,
      minCorruptionRatio: minRatio,
      category,
    });

    // Étape 4: Générer le rapport
    await generateReport(corruptedDocs, docsToClean);

    console.log('\n✅ Nettoyage terminé avec succès\n');

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    process.exit(1);
  }
}

main();
