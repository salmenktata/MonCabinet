/**
 * Script d'estimation coût et temps pour indexation complète
 *
 * Calcule le coût estimé et le temps nécessaire pour indexer
 * tous les documents non indexés de la Knowledge Base.
 *
 * Usage: npm run embeddings:estimate [--provider ollama|openai]
 *
 * OUTPUT : Estimation temps/coût par provider + recommandation
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
config();

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

/**
 * Constantes d'estimation
 */
const CONSTANTS = {
  // Performance moyenne par provider
  OLLAMA_TIME_PER_EMBEDDING_MS: 20000, // 20s
  OLLAMA_PARALLEL_CONCURRENCY: 2,      // x2 sur VPS 4 cores
  OPENAI_TIME_PER_EMBEDDING_MS: 100,   // 0.1s

  // Coûts OpenAI
  OPENAI_COST_PER_1M_TOKENS: 0.02,     // $0.02 (€0.02)

  // Estimations moyennes
  AVG_CHUNKS_PER_DOC: 8,
  AVG_TOKENS_PER_CHUNK: 500,
};

/**
 * Formatte une durée en format lisible
 */
function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;

  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}min`;
  }

  if (minutes >= 1) {
    const m = Math.floor(minutes);
    const s = Math.floor((minutes - m) * 60);
    return `${m} min ${s}s`;
  }

  return `${seconds.toFixed(1)}s`;
}

/**
 * Formatte un coût en euros
 */
function formatCost(euros: number): string {
  if (euros < 0.01) {
    const centimes = euros * 100;
    return `€${euros.toFixed(4)} (~${centimes.toFixed(1)} centimes)`;
  }
  return `€${euros.toFixed(2)}`;
}

/**
 * Récupère les stats de la Knowledge Base
 */
async function getKnowledgeBaseStats(): Promise<{
  total: number;
  indexed: number;
  toIndex: number;
}> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Compter docs totaux
    const totalResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM knowledge_base'
    );
    const total = totalResult.rows[0].count;

    // Compter docs indexés
    const indexedResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM knowledge_base WHERE is_indexed = true'
    );
    const indexed = indexedResult.rows[0].count;

    const toIndex = total - indexed;

    return { total, indexed, toIndex };
  } finally {
    await pool.end();
  }
}

/**
 * Calcule l'estimation pour Ollama
 */
function estimateOllama(chunksCount: number) {
  const { OLLAMA_TIME_PER_EMBEDDING_MS, OLLAMA_PARALLEL_CONCURRENCY } = CONSTANTS;

  // Séquentiel
  const sequentialTimeMs = chunksCount * OLLAMA_TIME_PER_EMBEDDING_MS;

  // Parallel
  const parallelTimeMs = sequentialTimeMs / OLLAMA_PARALLEL_CONCURRENCY;

  return {
    sequentialTime: formatDuration(sequentialTimeMs),
    parallelTime: formatDuration(parallelTimeMs),
    cost: '€0',
    savings: `${((1 - 1 / OLLAMA_PARALLEL_CONCURRENCY) * 100).toFixed(0)}% avec concurrency=${OLLAMA_PARALLEL_CONCURRENCY}`,
  };
}

/**
 * Calcule l'estimation pour OpenAI
 */
function estimateOpenAI(chunksCount: number, tokensCount: number) {
  const { OPENAI_TIME_PER_EMBEDDING_MS, OPENAI_COST_PER_1M_TOKENS } = CONSTANTS;

  const timeMs = chunksCount * OPENAI_TIME_PER_EMBEDDING_MS;
  const costEuros = (tokensCount / 1000000) * OPENAI_COST_PER_1M_TOKENS;

  return {
    time: formatDuration(timeMs),
    cost: formatCost(costEuros),
    costRaw: costEuros,
  };
}

/**
 * Affiche les estimations
 */
function displayEstimations(
  stats: { total: number; indexed: number; toIndex: number },
  chunksCount: number,
  tokensCount: number,
  providerFilter?: string
) {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║           ESTIMATION INDEXATION COMPLÈTE                   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  // État actuel KB
  log('📊 État actuel Knowledge Base :', 'magenta');
  log(`   Docs totaux         : ${stats.total}`, 'white');
  log(`   Docs indexés        : ${stats.indexed}`, 'green');
  log(`   Docs à indexer      : ${stats.toIndex}`, stats.toIndex > 0 ? 'yellow' : 'green');
  log(`   Chunks estimés      : ${chunksCount} (${stats.toIndex} × ${CONSTANTS.AVG_CHUNKS_PER_DOC})`, 'white');
  log(`   Tokens estimés      : ${(tokensCount / 1000).toFixed(0)}K (${chunksCount} × ${CONSTANTS.AVG_TOKENS_PER_CHUNK})`, 'white');

  if (stats.toIndex === 0) {
    logSuccess('\n✅ Tous les documents sont déjà indexés !');
    return;
  }

  // Scénario 1 : Ollama
  if (!providerFilter || providerFilter === 'ollama') {
    const ollama = estimateOllama(chunksCount);

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('  Scénario 1 : Ollama (gratuit)', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

    log(`   Temps séquentiel    : ${ollama.sequentialTime}`, 'yellow');
    log(`   Temps parallel (x2) : ${ollama.parallelTime}`, 'green');
    log(`   Gain parallel       : ${ollama.savings}`, 'cyan');
    log(`   Coût                : ${ollama.cost}`, 'green');
  }

  // Scénario 2 : OpenAI
  if (!providerFilter || providerFilter === 'openai') {
    const openai = estimateOpenAI(chunksCount, tokensCount);

    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('  Scénario 2 : OpenAI Turbo (rapide)', 'cyan');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

    log(`   Temps               : ${openai.time}`, 'green');
    log(`   Coût                : ${openai.cost}`, 'yellow');

    // Comparaison avec Ollama
    const ollamaParallelMs = chunksCount * CONSTANTS.OLLAMA_TIME_PER_EMBEDDING_MS / CONSTANTS.OLLAMA_PARALLEL_CONCURRENCY;
    const openaiMs = chunksCount * CONSTANTS.OPENAI_TIME_PER_EMBEDDING_MS;
    const timeSavings = ((1 - openaiMs / ollamaParallelMs) * 100).toFixed(1);
    const ollamaTime = formatDuration(ollamaParallelMs);

    log(`   Gain temps          : ${timeSavings}% (${ollamaTime} → ${openai.time})`, 'cyan');
  }

  // Recommandation
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'magenta');
  log('  💡 RECOMMANDATION', 'magenta');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'magenta');

  const openai = estimateOpenAI(chunksCount, tokensCount);

  if (chunksCount < 50) {
    logSuccess('✅ Utiliser Ollama (batch petit, temps acceptable)');
    logInfo('   Commande : npm run rechunk:kb');
  } else if (openai.costRaw < 0.10) {
    logSuccess('🚀 Utiliser OpenAI turbo');
    logSuccess(`   Coût négligeable : ${openai.cost} (vs gain de temps massif)`);
    logInfo('   Commande : EMBEDDING_TURBO_MODE=true npm run rechunk:kb');
  } else {
    logWarning(`⚠️  Coût OpenAI significatif : ${openai.cost}`);
    logInfo('   Option 1 (rapide) : EMBEDDING_TURBO_MODE=true npm run rechunk:kb');
    logInfo('   Option 2 (gratuit) : npm run rechunk:kb (patience requise)');
  }
}

/**
 * Fonction principale
 */
async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     ESTIMATION COÛT & TEMPS - Indexation Knowledge Base   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  // Parse arguments
  const args = process.argv.slice(2);
  const providerFilter = args.find((arg) => arg.startsWith('--provider='))?.split('=')[1];

  if (providerFilter && !['ollama', 'openai'].includes(providerFilter)) {
    logError('Provider invalide. Utiliser : --provider=ollama ou --provider=openai');
    process.exit(1);
  }

  // Vérifier configuration
  logInfo('\nVérification de la configuration...');

  const hasDatabase = !!process.env.DATABASE_URL;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  logSuccess(`Database : ${hasDatabase ? 'Configurée ✅' : 'Manquante ❌'}`);
  logSuccess(`OpenAI   : ${hasOpenAI ? 'Configurée ✅' : 'Manquante ⚠️'}`);

  if (!hasDatabase) {
    logError('DATABASE_URL non configurée');
    process.exit(1);
  }

  if (!hasOpenAI && (!providerFilter || providerFilter === 'openai')) {
    logWarning('OpenAI API Key non configurée, estimations OpenAI indisponibles');
  }

  try {
    // Récupérer stats KB
    logInfo('\nRécupération des statistiques Knowledge Base...');
    const stats = await getKnowledgeBaseStats();

    logSuccess(`Stats récupérées : ${stats.total} docs totaux, ${stats.toIndex} à indexer`);

    // Calculs
    const chunksCount = stats.toIndex * CONSTANTS.AVG_CHUNKS_PER_DOC;
    const tokensCount = chunksCount * CONSTANTS.AVG_TOKENS_PER_CHUNK;

    // Afficher estimations
    displayEstimations(stats, chunksCount, tokensCount, providerFilter);

    logSuccess('\n✅ Estimation terminée avec succès');

  } catch (error) {
    logError(`\nErreur fatale : ${getErrorMessage(error)}`);
    console.error(error);
    process.exit(1);
  }
}

// Exécution
main().catch((error) => {
  logError(`Erreur non gérée : ${getErrorMessage(error)}`);
  console.error(error);
  process.exit(1);
});
