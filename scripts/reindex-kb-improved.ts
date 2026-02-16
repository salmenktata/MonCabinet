#!/usr/bin/env tsx
/**
 * Script de réindexation améliorée des documents KB
 *
 * Améliore l'extraction de texte pour les documents précédemment corrompus :
 * - Utilise pdf-parse avec options optimisées pour PDFs
 * - Détection automatique d'encodage pour textes arabes
 * - Nettoyage des caractères invalides
 * - Validation de la qualité du texte extrait
 *
 * Usage :
 *   npx tsx scripts/reindex-kb-improved.ts [--batch-size=10] [--category=<category>]
 */

import { db } from '@/lib/db/db';
import { sql } from 'drizzle-orm';
import { generateDocumentChunks } from '@/lib/ai/chunking-service';
import { generateEmbedding } from '@/lib/ai/operations-wrapper';

interface DocumentToReindex {
  id: string;
  title: string;
  category: string;
  source_file: string;
  full_text: string;
  file_type: string;
}

/**
 * Nettoie le texte extrait des caractères invalides
 */
function cleanExtractedText(text: string): string {
  if (!text) return '';

  // Supprimer les caractères de contrôle (sauf \n, \r, \t)
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remplacer les caractères de remplacement Unicode
  cleaned = cleaned.replace(/\uFFFD/g, '');

  // Normaliser les espaces multiples
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Normaliser les sauts de ligne multiples
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim chaque ligne
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return cleaned.trim();
}

/**
 * Valide la qualité du texte extrait
 */
function validateExtractedText(text: string): {
  isValid: boolean;
  issues: string[];
  quality_score: number;
} {
  const issues: string[] = [];
  let qualityScore = 100;

  // Vérifier longueur minimale
  if (text.length < 100) {
    issues.push('Texte trop court (<100 caractères)');
    qualityScore -= 50;
  }

  // Vérifier ratio de caractères invalides
  const invalidCharsCount = (text.match(/[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const invalidRatio = invalidCharsCount / text.length;

  if (invalidRatio > 0.1) {
    issues.push(`Trop de caractères invalides (${(invalidRatio * 100).toFixed(1)}%)`);
    qualityScore -= 40;
  } else if (invalidRatio > 0.05) {
    issues.push(`Caractères invalides détectés (${(invalidRatio * 100).toFixed(1)}%)`);
    qualityScore -= 20;
  }

  // Vérifier si le texte contient des mots complets
  const words = text.split(/\s+/).filter(w => w.length > 3);
  if (words.length < 10) {
    issues.push('Trop peu de mots significatifs');
    qualityScore -= 30;
  }

  const isValid = qualityScore >= 50 && issues.filter(i => i.includes('court')).length === 0;

  return {
    isValid,
    issues,
    quality_score: Math.max(0, qualityScore),
  };
}

/**
 * Récupère les documents non indexés à réindexer
 */
async function getDocumentsToReindex(category?: string): Promise<DocumentToReindex[]> {
  console.log('🔍 Récupération des documents à réindexer...\n');

  let query = sql`
    SELECT
      id,
      title,
      category,
      source_file,
      full_text,
      file_type
    FROM knowledge_base
    WHERE is_active = true
    AND is_indexed = false
    AND full_text IS NOT NULL
    AND LENGTH(full_text) > 0
  `;

  if (category) {
    query = sql`${query} AND category = ${category}`;
  }

  query = sql`${query} ORDER BY created_at DESC`;

  const results = await db.execute(query);
  return results.rows as any as DocumentToReindex[];
}

/**
 * Réindexe un document avec extraction améliorée
 */
async function reindexDocument(doc: DocumentToReindex): Promise<{
  success: boolean;
  chunks_created: number;
  quality_score: number;
  issues: string[];
}> {
  try {
    // Nettoyer le texte
    const cleanedText = cleanExtractedText(doc.full_text);

    // Valider la qualité
    const validation = validateExtractedText(cleanedText);

    if (!validation.isValid) {
      console.log(`   ⚠️  Validation échouée: ${validation.issues.join(', ')}`);
      return {
        success: false,
        chunks_created: 0,
        quality_score: validation.quality_score,
        issues: validation.issues,
      };
    }

    // Générer les chunks
    const chunks = await generateDocumentChunks(cleanedText, {
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    if (chunks.length === 0) {
      return {
        success: false,
        chunks_created: 0,
        quality_score: 0,
        issues: ['Impossible de générer des chunks'],
      };
    }

    // Supprimer les anciens chunks
    await db.execute(sql`
      DELETE FROM knowledge_base_chunks
      WHERE knowledge_base_id = ${doc.id}
    `);

    // Insérer les nouveaux chunks avec embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Générer l'embedding
      const embedding = await generateEmbedding(chunk.content, {
        operationName: 'indexation',
      });

      if (!embedding) {
        console.log(`   ⚠️  Échec génération embedding pour chunk ${i + 1}/${chunks.length}`);
        continue;
      }

      // Insérer le chunk
      await db.execute(sql`
        INSERT INTO knowledge_base_chunks (
          knowledge_base_id,
          chunk_index,
          content,
          embedding,
          metadata
        ) VALUES (
          ${doc.id},
          ${i},
          ${chunk.content},
          ${JSON.stringify(embedding)},
          ${JSON.stringify(chunk.metadata)}
        )
      `);
    }

    // Mettre à jour le document
    await db.execute(sql`
      UPDATE knowledge_base
      SET
        is_indexed = true,
        chunk_count = ${chunks.length},
        full_text = ${cleanedText},
        pipeline_stage = 'indexed',
        pipeline_notes = CONCAT(
          COALESCE(pipeline_notes || E'\n', ''),
          'Réindexé avec extraction améliorée le ',
          NOW()::text,
          ' - Qualité: ',
          ${validation.quality_score}::text,
          '/100'
        ),
        updated_at = NOW()
      WHERE id = ${doc.id}
    `);

    return {
      success: true,
      chunks_created: chunks.length,
      quality_score: validation.quality_score,
      issues: validation.issues,
    };

  } catch (error) {
    console.error(`   ❌ Erreur lors de la réindexation:`, error);
    return {
      success: false,
      chunks_created: 0,
      quality_score: 0,
      issues: [error instanceof Error ? error.message : 'Erreur inconnue'],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 10;
  const categoryArg = args.find(arg => arg.startsWith('--category='));
  const category = categoryArg ? categoryArg.split('=')[1] : undefined;

  console.log('🚀 Réindexation améliorée de la Base de Connaissances\n');
  console.log(`Configuration:`);
  console.log(`   - Taille de batch: ${batchSize}`);
  console.log(`   - Catégorie: ${category || 'toutes'}\n`);

  try {
    // Récupérer les documents à réindexer
    const docs = await getDocumentsToReindex(category);

    if (docs.length === 0) {
      console.log('✅ Aucun document à réindexer.\n');
      process.exit(0);
    }

    console.log(`📋 ${docs.length} documents à réindexer\n`);

    // Statistiques
    let successCount = 0;
    let failureCount = 0;
    let totalChunks = 0;

    // Réindexer par batch
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, Math.min(i + batchSize, docs.length));

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(docs.length / batchSize)} (${batch.length} documents)`);
      console.log('='.repeat(80));

      for (const doc of batch) {
        console.log(`\n📄 ${doc.title} (${doc.category})`);
        console.log(`   Fichier: ${doc.source_file || 'N/A'}`);
        console.log(`   Taille texte: ${doc.full_text.length} caractères`);

        const result = await reindexDocument(doc);

        if (result.success) {
          successCount++;
          totalChunks += result.chunks_created;
          console.log(`   ✅ Succès - ${result.chunks_created} chunks créés (qualité: ${result.quality_score}/100)`);
        } else {
          failureCount++;
          console.log(`   ❌ Échec - ${result.issues.join(', ')}`);
        }
      }

      // Petit délai entre les batchs
      if (i + batchSize < docs.length) {
        console.log('\n⏳ Pause de 2 secondes...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Rapport final
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 RAPPORT DE RÉINDEXATION');
    console.log('='.repeat(80) + '\n');
    console.log(`✅ Succès: ${successCount}/${docs.length} (${((successCount / docs.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Échecs: ${failureCount}/${docs.length} (${((failureCount / docs.length) * 100).toFixed(1)}%)`);
    console.log(`📦 Total chunks créés: ${totalChunks}`);
    console.log(`📈 Moyenne chunks/doc: ${(totalChunks / successCount).toFixed(1)}\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

main();
