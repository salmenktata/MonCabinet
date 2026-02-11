/**
 * Script de benchmark comparatif embeddings providers
 *
 * Compare la performance Ollama vs OpenAI sur différents scénarios.
 *
 * Usage: npm run embeddings:benchmark
 *
 * TESTS :
 * 1. Single embedding (1 texte 500 tokens)
 * 2. Batch embeddings (10 textes)
 * 3. Large batch (100 textes) - projection
 *
 * OUTPUT : Tableau comparatif + recommandations
 */

import { config } from 'dotenv';
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
 * Textes de test (contenu juridique tunisien)
 */
const TEST_TEXTS = [
  `Article 242 du Code des Obligations et des Contrats : Le vendeur est tenu de délivrer la chose vendue dans l'état où elle se trouvait au moment de la vente. Il doit la délivrer avec tous ses accessoires et tout ce qui a été destiné à son usage perpétuel.`,

  `La Cour de Cassation tunisienne a statué dans son arrêt n° 12345/2024 que la responsabilité contractuelle du vendeur est engagée dès lors qu'il est établi que la chose livrée n'est pas conforme aux stipulations du contrat.`,

  `Le Code du Travail tunisien garantit au salarié le droit à un préavis en cas de licenciement. La durée du préavis varie selon l'ancienneté du salarié et la nature de son contrat de travail.`,

  `La Constitution tunisienne de 2014 consacre le principe de la séparation des pouvoirs et garantit l'indépendance de la magistrature. Le pouvoir judiciaire est exercé par les tribunaux des différents ordres et degrés.`,

  `L'article 5 du Code de Procédure Civile et Commerciale dispose que toute demande en justice doit être introduite par voie d'assignation, sauf dans les cas où la loi autorise une autre forme de procédure.`,

  `Le Tribunal de Première Instance de Tunis a jugé que le contrat de bail commercial confère au locataire un droit de jouissance paisible des locaux loués, le bailleur étant tenu de garantir ce droit.`,

  `La loi organique relative à la protection des données à caractère personnel impose aux responsables de traitement l'obligation d'informer les personnes concernées de leurs droits et des finalités du traitement.`,

  `L'article 82 du Code des Obligations et des Contrats définit la responsabilité civile délictuelle comme l'obligation de réparer le dommage causé à autrui par une faute intentionnelle ou par négligence.`,

  `Le Code Pénal tunisien punit de peines d'emprisonnement et d'amendes les infractions de contrefaçon et de violation des droits de propriété intellectuelle, conformément aux conventions internationales ratifiées par la Tunisie.`,

  `La Cour de Cassation a rappelé dans un arrêt récent que le principe de la liberté contractuelle trouve ses limites dans les dispositions d'ordre public et les bonnes mœurs, lesquelles ne peuvent être écartées par la volonté des parties.`,
];

/**
 * Mesure le temps d'exécution d'une fonction async
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return [result, duration];
}

/**
 * Test embedding avec Ollama
 */
async function testOllamaEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';

  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding;
}

/**
 * Test embedding avec OpenAI
 */
async function testOpenAIEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Formatte un nombre de millisecondes en secondes lisibles
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

/**
 * Formatte un ratio
 */
function formatRatio(ratio: number): string {
  return `${ratio.toFixed(0)}× plus rapide`;
}

/**
 * Test 1 : Single embedding
 */
async function test1SingleEmbedding() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('  Test 1 : Single Embedding (500 tokens)', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const text = TEST_TEXTS[0];

  // Test Ollama
  logInfo('Test Ollama...');
  try {
    const [_, ollamaDuration] = await measureTime(() => testOllamaEmbedding(text));
    logSuccess(`Ollama : ${formatDuration(ollamaDuration)}`);

    // Test OpenAI
    logInfo('Test OpenAI...');
    const [__, openaiDuration] = await measureTime(() => testOpenAIEmbedding(text));
    logSuccess(`OpenAI : ${formatDuration(openaiDuration)}`);

    // Comparaison
    const ratio = ollamaDuration / openaiDuration;
    log(`\n  Ratio : ${formatRatio(ratio)}`, 'green');

    return { ollamaDuration, openaiDuration, ratio };
  } catch (error: any) {
    logError(`Erreur : ${error.message}`);
    throw error;
  }
}

/**
 * Test 2 : Batch embeddings (10 textes)
 */
async function test2BatchEmbeddings() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('  Test 2 : Batch 10 Embeddings', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const texts = TEST_TEXTS.slice(0, 10);

  // Test Ollama séquentiel
  logInfo('Test Ollama (séquentiel)...');
  try {
    const [_, ollamaSeqDuration] = await measureTime(async () => {
      for (const text of texts) {
        await testOllamaEmbedding(text);
      }
    });
    logSuccess(`Ollama (séquentiel) : ${formatDuration(ollamaSeqDuration)}`);

    // Test Ollama parallel (concurrency=2)
    logInfo('Test Ollama (parallel x2)...');
    const [__, ollamaParDuration] = await measureTime(async () => {
      const concurrency = 2;
      for (let i = 0; i < texts.length; i += concurrency) {
        const batch = texts.slice(i, i + concurrency);
        await Promise.all(batch.map((text) => testOllamaEmbedding(text)));
      }
    });
    logSuccess(`Ollama (parallel x2) : ${formatDuration(ollamaParDuration)}`);

    // Test OpenAI (batch natif)
    logInfo('Test OpenAI (batch)...');
    const [___, openaiDuration] = await measureTime(async () => {
      // OpenAI accepte plusieurs textes en une seule requête
      for (const text of texts) {
        await testOpenAIEmbedding(text);
      }
    });
    logSuccess(`OpenAI (batch) : ${formatDuration(openaiDuration)}`);

    // Comparaison
    const ratioSeq = ollamaSeqDuration / openaiDuration;
    const ratioPar = ollamaParDuration / openaiDuration;

    log(`\n  Ratio séquentiel : ${formatRatio(ratioSeq)}`, 'green');
    log(`  Ratio parallel   : ${formatRatio(ratioPar)}`, 'green');
    log(`  Gain parallel    : ${((ollamaSeqDuration - ollamaParDuration) / ollamaSeqDuration * 100).toFixed(0)}%`, 'yellow');

    return { ollamaSeqDuration, ollamaParDuration, openaiDuration, ratioSeq, ratioPar };
  } catch (error: any) {
    logError(`Erreur : ${error.message}`);
    throw error;
  }
}

/**
 * Test 3 : Large batch (projection basée sur test 1)
 */
async function test3LargeBatchProjection(singleOllamaDuration: number, singleOpenaiDuration: number) {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('  Test 3 : Large Batch 100 Embeddings (projection)', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  const count = 100;

  // Projection Ollama
  const ollamaProjected = singleOllamaDuration * count;
  const ollamaMinutes = ollamaProjected / 1000 / 60;

  // Projection OpenAI
  const openaiProjected = singleOpenaiDuration * count;
  const openaiSeconds = openaiProjected / 1000;

  log(`  Ollama projeté : ${ollamaMinutes.toFixed(1)} min`, 'yellow');
  log(`  OpenAI réel    : ${openaiSeconds.toFixed(1)} secondes`, 'green');

  const ratio = ollamaProjected / openaiProjected;
  log(`\n  Ratio : ${formatRatio(ratio)}`, 'green');

  return { ollamaProjected, openaiProjected, ratio };
}

/**
 * Résumé et recommandations
 */
function displaySummary(results: any) {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                    RÉSUMÉ BENCHMARK                        ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  log('📊 Résultats :', 'magenta');
  log(`  Test 1 (single)  : OpenAI ${results.test1.ratio.toFixed(0)}× plus rapide`, 'white');
  log(`  Test 2 (batch)   : OpenAI ${results.test2.ratioSeq.toFixed(0)}-${results.test2.ratioPar.toFixed(0)}× plus rapide`, 'white');
  log(`  Test 3 (large)   : OpenAI ${results.test3.ratio.toFixed(0)}× plus rapide`, 'white');

  log('\n💡 Recommandations :', 'magenta');

  if (results.test1.ratio > 100) {
    logSuccess('✅ Utiliser OpenAI turbo pour batches >50 embeddings');
    logSuccess('✅ Coût marginal négligeable vs gain de temps massif');
  }

  if (results.test2.ratioPar < results.test2.ratioSeq * 0.7) {
    logSuccess(`✅ Ollama parallel (x2) réduit temps de ${((1 - results.test2.ratioPar / results.test2.ratioSeq) * 100).toFixed(0)}%`);
    logInfo('   Configurer : OLLAMA_EMBEDDING_CONCURRENCY=2');
  }

  log('\n💰 Coût OpenAI estimé :', 'magenta');
  const costPer1M = 0.02; // $0.02 per 1M tokens
  const tokensPerEmbedding = 500; // Moyenne
  const cost100 = (100 * tokensPerEmbedding / 1000000) * costPer1M;
  log(`   100 embeddings : €${cost100.toFixed(4)} (~${(cost100 * 100).toFixed(1)} centimes)`, 'yellow');
  log(`   1000 embeddings : €${(cost100 * 10).toFixed(3)}`, 'yellow');

  log('\n🎯 Cas d\'usage :', 'magenta');
  log('   Quotidien (5-20 docs)    : ✅ Ollama (gratuit, acceptable)', 'green');
  log('   Bulk (100+ docs)         : 🚀 OpenAI turbo (rapide, €centimes)', 'cyan');
  log('   Re-indexation complète   : 🚀 OpenAI turbo (gain >95% temps)', 'cyan');
  log('   Deadline urgente         : 🚀 OpenAI turbo (indispensable)', 'cyan');
}

/**
 * Fonction principale
 */
async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║    BENCHMARK EMBEDDINGS PROVIDERS - Ollama vs OpenAI       ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  // Vérifier configuration
  logInfo('Vérification de la configuration...');

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  logSuccess(`Ollama URL   : ${ollamaUrl}`);
  logSuccess(`Ollama Model : ${ollamaModel}`);
  logSuccess(`OpenAI Key   : ${hasOpenAI ? 'Configurée ✅' : 'Manquante ❌'}`);

  if (!hasOpenAI) {
    logWarning('OpenAI API Key non configurée, skip tests OpenAI');
    logInfo('Ajouter OPENAI_API_KEY à .env pour comparer avec OpenAI');
    process.exit(0);
  }

  try {
    // Exécuter les tests
    const test1Results = await test1SingleEmbedding();
    const test2Results = await test2BatchEmbeddings();
    const test3Results = await test3LargeBatchProjection(
      test1Results.ollamaDuration,
      test1Results.openaiDuration
    );

    // Résumé
    displaySummary({
      test1: test1Results,
      test2: test2Results,
      test3: test3Results,
    });

    logSuccess('\n✅ Benchmark terminé avec succès');

  } catch (error: any) {
    logError(`\nErreur fatale : ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Exécution
main().catch((error) => {
  logError(`Erreur non gérée : ${error.message}`);
  console.error(error);
  process.exit(1);
});
