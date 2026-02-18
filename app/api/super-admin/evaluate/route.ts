import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Les mêmes interfaces que dans le script précédent
interface EvaluationItem {
  question: string;
  golden_answer: string;
}

interface EvaluationResult extends EvaluationItem {
  generated_answer: string;
}

// --- Configuration ---
const API_URL = 'http://localhost:3000/api/chat'; 
const EVAL_SET_PATH = path.join(process.cwd(), 'evaluation', 'legal_questions.json');
// ---

// La fonction pour interroger le RAG reste la même
async function queryRagApi(question: string): Promise<string> {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
        });

        if (!response.ok) {
            return `Erreur API: ${response.status} ${await response.text()}`;
        }
        
        const reader = response.body?.getReader();
        if (!reader) return "Erreur: Impossible de lire le corps de la réponse.";
        
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }
        return fullText;
    } catch (error) {
        console.error(`Erreur lors de l'interrogation de l'API RAG :`, error);
        return "Erreur : Échec de la récupération de la réponse de l'API.";
    }
}


export async function POST(req: NextRequest) {
  // Utilisation d'un ReadableStream pour envoyer les résultats en temps réel au client
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendMessage = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}

`));
      };

      sendMessage({ type: 'status', message: "Chargement du jeu d'évaluation..." });
      
      let evaluationSet: EvaluationItem[];
      try {
        const fileContent = await fs.readFile(EVAL_SET_PATH, 'utf-8');
        evaluationSet = JSON.parse(fileContent);
        sendMessage({ type: 'status', message: `${evaluationSet.length} questions trouvées.` });
      } catch (error) {
        sendMessage({ type: 'error', message: "Échec du chargement du fichier d'évaluation." });
        controller.close();
        return;
      }

      for (let i = 0; i < evaluationSet.length; i++) {
        const item = evaluationSet[i];
        sendMessage({ 
          type: 'status', 
          message: `Évaluation de la question ${i + 1}/${evaluationSet.length}: "${item.question}"`
        });
        
        const generated_answer = await queryRagApi(item.question);
        
        const result: EvaluationResult = { ...item, generated_answer };
        sendMessage({ type: 'result', data: result });
      }

      sendMessage({ type: 'status', message: 'Évaluation terminée !' });
      sendMessage({ type: 'done' });
      controller.close();
    },
  });

  // Retourner la réponse en streaming avec le bon type de contenu
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
