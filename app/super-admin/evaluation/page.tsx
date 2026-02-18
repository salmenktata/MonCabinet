'use client';

import { useState } from 'react';

// Définition des types pour les résultats et les messages
interface EvaluationResult {
  question: string;
  golden_answer: string;
  generated_answer: string;
}

interface StatusMessage {
  type: 'status' | 'error';
  message: string;
}

// Composant pour afficher une carte de résultat
function ResultCard({ result }: { result: EvaluationResult }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm">
      <h3 className="font-bold text-lg mb-2 text-gray-800">Question: {result.question}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-50 p-3 rounded-md">
          <h4 className="font-semibold text-green-800 mb-1">Réponse Attendue (Golden)</h4>
          <p className="text-sm text-gray-700">{result.golden_answer}</p>
        </div>
        <div className="bg-blue-50 p-3 rounded-md">
          <h4 className="font-semibold text-blue-800 mb-1">Réponse Générée</h4>
          <p className="text-sm text-gray-700">{result.generated_answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function EvaluationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [statusMessages, setStatusMessages] = useState<StatusMessage[]>([]);

  const startEvaluation = async () => {
    setIsRunning(true);
    setResults([]);
    setStatusMessages([]);

    const eventSource = new EventSource('/api/super-admin/evaluate', { withCredentials: false });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'status' || data.type === 'error') {
        setStatusMessages((prev) => [...prev, { type: data.type, message: data.message }]);
      } else if (data.type === 'result') {
        setResults((prev) => [...prev, data.data]);
      } else if (data.type === 'done') {
        setIsRunning(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (err) => {
      setStatusMessages((prev) => [...prev, { type: 'error', message: 'Erreur de connexion avec le serveur.' }]);
      setIsRunning(false);
      eventSource.close();
    };
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Évaluation du Système RAG</h1>
          <button
            onClick={startEvaluation}
            disabled={isRunning}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? "Évaluation en cours..." : "Lancer l'Évaluation"}
          </button>
        </div>

        {/* Section pour les messages de statut */}
        {statusMessages.length > 0 && (
          <div className="mb-6 p-4 border rounded-lg bg-white shadow-sm">
             <h2 className="font-semibold text-gray-800 mb-2">Statut de l'évaluation :</h2>
             <div className="text-sm text-gray-600 space-y-1">
                {statusMessages.map((msg, index) => (
                    <p key={index} className={msg.type === 'error' ? 'text-red-500' : ''}>
                        {msg.message}
                    </p>
                ))}
             </div>
          </div>
        )}
        
        {/* Section pour les résultats */}
        <div>
          {results.map((result, index) => (
            <ResultCard key={index} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}
