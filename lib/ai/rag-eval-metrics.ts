/**
 * Métriques d'évaluation RAG (retrieval)
 *
 * Fonctions pures partagées entre le script CLI et l'API.
 *
 * @module lib/ai/rag-eval-metrics
 */

/**
 * Recall@K : proportion des documents gold retrouvés dans les K premiers résultats
 */
export function computeRecallAtK(goldIds: string[], retrievedIds: string[], k: number): number {
  if (goldIds.length === 0) return 1
  const topK = retrievedIds.slice(0, k)
  const found = goldIds.filter(id => topK.includes(id)).length
  return found / goldIds.length
}

/**
 * Precision@K : proportion des K premiers résultats qui sont dans le gold set
 */
export function computePrecisionAtK(goldIds: string[], retrievedIds: string[], k: number): number {
  if (goldIds.length === 0) return 1
  const topK = retrievedIds.slice(0, k)
  if (topK.length === 0) return 0
  const relevant = topK.filter(id => goldIds.includes(id)).length
  return relevant / topK.length
}

/**
 * MRR : inverse du rang du premier document gold trouvé
 */
export function computeMRR(goldIds: string[], retrievedIds: string[]): number {
  if (goldIds.length === 0) return 1
  for (let i = 0; i < retrievedIds.length; i++) {
    if (goldIds.includes(retrievedIds[i])) {
      return 1 / (i + 1)
    }
  }
  return 0
}

/**
 * Citation Accuracy : proportion des articles attendus effectivement cités
 */
export function computeCitationAccuracy(answer: string, expectedArticles: string[]): number {
  if (!expectedArticles || expectedArticles.length === 0) return 1
  const found = expectedArticles.filter(article => {
    const normalized = article.replace(/\s+/g, '\\s*')
    const regex = new RegExp(normalized, 'i')
    return regex.test(answer)
  }).length
  return found / expectedArticles.length
}

/**
 * Faithfulness via keyword matching (baseline)
 */
export function computeFaithfulness(
  question: string,
  answer: string,
  keyPoints: string[]
): number {
  if (keyPoints.length === 0) return 1
  const answerLower = answer.toLowerCase()
  const found = keyPoints.filter(kp => answerLower.includes(kp.toLowerCase())).length
  return found / keyPoints.length
}
