/**
 * LLM Judge pour évaluer la fidélité des réponses RAG
 *
 * Utilise un LLM pour vérifier que les key points attendus sont couverts
 * dans la réponse générée. Plus fiable que le simple keyword matching.
 *
 * @module lib/ai/rag-eval-judge
 */

import { callLLMWithFallback, type LLMMessage } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface FaithfulnessJudgement {
  score: number           // 0.0–1.0
  coveredPoints: number
  totalPoints: number
  reasoning: string
}

// =============================================================================
// PROMPT
// =============================================================================

const JUDGE_SYSTEM_PROMPT = `Tu es un juge expert en droit tunisien. Ta tâche est d'évaluer si une réponse générée couvre les points clés attendus.

Pour chaque point clé, vérifie s'il est couvert dans la réponse (même reformulé ou exprimé différemment).
Un point est "couvert" s'il est mentionné explicitement OU si son sens est clairement transmis.

Sois GÉNÉREUX dans ton évaluation : un concept exprimé avec des synonymes ou une reformulation équivalente est couvert.
Un point NOT couvert = absent de la réponse sans aucune allusion.

Exemples few-shot :
---
Points clés: ["prescription 5 ans", "droit de recours", "notification obligatoire"]
Réponse: "Le délai de prescription est de cinq années à compter de la date de connaissance. La partie lésée peut exercer un recours devant le tribunal compétent. La loi impose une mise en demeure préalable."
→ {"covered": 3, "total": 3, "reasoning": "Prescription 5 ans ✓, recours ✓ (exercer un recours), notification ✓ (mise en demeure)"}
---
Points clés: ["accord écrit exigé", "nullité du contrat", "compétence exclusive tribunal commercial"]
Réponse: "Le contrat verbal est insuffisant car la loi exige un écrit signé par les deux parties. Tout contrat non conforme est frappé de nullité absolue."
→ {"covered": 2, "total": 3, "reasoning": "Accord écrit ✓, nullité ✓, compétence tribunal commercial ✗ (non mentionné)"}
---

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks :
{"covered": <nombre de points couverts>, "total": <nombre total de points>, "reasoning": "<explication courte>"}`

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Évalue la fidélité d'une réponse RAG via LLM judge
 *
 * @param question - La question posée
 * @param generatedAnswer - La réponse générée par le RAG
 * @param keyPoints - Les points clés attendus
 * @returns Score de fidélité 0.0–1.0
 */
export async function computeFaithfulnessLLM(
  question: string,
  generatedAnswer: string,
  keyPoints: string[]
): Promise<FaithfulnessJudgement> {
  if (keyPoints.length === 0) {
    return { score: 1, coveredPoints: 0, totalPoints: 0, reasoning: 'Aucun point clé à vérifier' }
  }

  // Rate limit: 200ms entre appels
  await new Promise(resolve => setTimeout(resolve, 200))

  const keyPointsList = keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')

  const messages: LLMMessage[] = [
    { role: 'system', content: JUDGE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Question: ${question}

Points clés attendus:
${keyPointsList}

Réponse à évaluer:
${generatedAnswer.substring(0, 5000)}

Évalue combien de points clés sont couverts dans la réponse. Réponds en JSON.`,
    },
  ]

  try {
    const response = await callLLMWithFallback(messages, {
      temperature: 0.1,
      maxTokens: 400, // Augmenté 200→400 pour reasoning plus détaillé
      operationName: 'rag-eval-judge',
    })

    // Parse JSON depuis response.answer
    const jsonMatch = response.answer.match(/\{.*\}/s)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const covered = Math.min(parsed.covered || 0, keyPoints.length)
      const total = parsed.total || keyPoints.length
      return {
        score: total > 0 ? covered / total : 0,
        coveredPoints: covered,
        totalPoints: total,
        reasoning: parsed.reasoning || '',
      }
    }

    // Fallback: keyword matching si parse échoue
    return computeFaithfulnessKeyword(generatedAnswer, keyPoints)
  } catch (error) {
    console.warn('[LLM Judge] Erreur, fallback keyword matching:', error instanceof Error ? error.message : error)
    return computeFaithfulnessKeyword(generatedAnswer, keyPoints)
  }
}

/**
 * Fallback keyword matching (identique à l'ancien computeFaithfulness)
 */
function computeFaithfulnessKeyword(
  answer: string,
  keyPoints: string[]
): FaithfulnessJudgement {
  const answerLower = answer.toLowerCase()
  const found = keyPoints.filter(kp => answerLower.includes(kp.toLowerCase())).length
  return {
    score: found / keyPoints.length,
    coveredPoints: found,
    totalPoints: keyPoints.length,
    reasoning: 'Fallback keyword matching',
  }
}
