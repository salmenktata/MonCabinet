import fs from 'fs/promises';
import path from 'path';

// Définit la structure d'un élément dans notre jeu de données d'évaluation
interface EvaluationItem {
  question: string;
  golden_answer: string;
}

// Définit la structure pour stocker les résultats
interface EvaluationResult extends EvaluationItem {
  generated_answer: string;
  // Des champs pour les scores pourront être ajoutés ici plus tard
  // par exemple : similarity_score?: number;
}

// --- Configuration ---
const API_URL = 'http://localhost:3000/api/chat'; // Ajustez si votre API RAG est sur une autre URL
const EVAL_SET_PATH = path.join(process.cwd(), 'evaluation', 'legal_questions.json');
const RESULTS_PATH = path.join(process.cwd(), 'evaluation', 'evaluation_results.json');
// ---

/**
 * Interroge l'API RAG avec une question donnée.
 * NOTE : Cette fonction suppose que votre API attend un corps JSON avec un tableau 'messages',
 * similaire à l'API de complétion de chat d'OpenAI. Adaptez-la au schéma réel de votre API.
 */
async function queryRagApi(question: string): Promise<string> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: question }],
        // Incluez ici d'autres paramètres que votre API pourrait nécessiter
      }),
    });

    if (!response.ok) {
      throw new Error(`La requête API a échoué avec le statut ${response.status}: ${await response.text()}`);
    }
    
    // Le SDK Vercel AI et Next.js streament souvent des réponses textuelles.
    // Le code ci-dessous lit ce flux de texte jusqu'à la fin.
    const reader = response.body?.getReader();
    if (!reader) {
        return "Erreur : Impossible de lire le corps de la réponse.";
    }
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
    }
    
    // Si votre API renvoie un simple JSON (pas un flux), la logique est plus simple :
    // const data = await response.json();
    // return data.answer; // ajustez à la structure de votre réponse API
    
    return fullText;

  } catch (error) {
    console.error(`Erreur lors de l'interrogation de l'API RAG pour la question : "${question}"`, error);
    return "Erreur : Échec de la récupération de la réponse de l'API.";
  }
}

/**
 * Fonction principale d'évaluation
 */
async function runEvaluation() {
  console.log(`[1/4] Chargement du jeu d'évaluation depuis : ${EVAL_SET_PATH}`);
  let evaluationSet: EvaluationItem[];
  try {
    const fileContent = await fs.readFile(EVAL_SET_PATH, 'utf-8');
    evaluationSet = JSON.parse(fileContent);
  } catch (error) {
    console.error("Échec du chargement ou de l'analyse du jeu d'évaluation.", error);
    process.exit(1);
  }
  console.log(`  > ${evaluationSet.length} questions à évaluer trouvées.`);

  const results: EvaluationResult[] = [];
  
  console.log('
[2/4] Exécution des questions sur le système RAG...');
  for (let i = 0; i < evaluationSet.length; i++) {
    const item = evaluationSet[i];
    console.log(`  > Évaluation question ${i + 1}/${evaluationSet.length}: "${item.question}"`);
    
    const generated_answer = await queryRagApi(item.question);
    
    results.push({
      ...item,
      generated_answer,
    });
  }
  
  console.log('
[3/4] Analyse comparative des résultats...');
  // Pour l'instant, nous affichons simplement les comparaisons.
  // C'est ici que vous intégrerez plus tard une logique de scoring quantitative.
  for (const result of results) {
      console.log('--------------------------------------------------');
      console.log(`QUESTION: ${result.question}`);
      console.log(`
RÉPONSE ATTENDUE (GOLDEN):
${result.golden_answer}`);
      console.log(`
RÉPONSE GÉNÉRÉE:
${result.generated_answer}`);
      console.log('--------------------------------------------------
');
  }

  console.log(`[4/4] Sauvegarde des résultats détaillés dans : ${RESULTS_PATH}`);
  try {
    await fs.writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf-8');
    console.log('  > Évaluation terminée !');
  } catch (error) {
    console.error("Échec de la sauvegarde des résultats d'évaluation.", error);
    process.exit(1);
  }
}

runEvaluation();
