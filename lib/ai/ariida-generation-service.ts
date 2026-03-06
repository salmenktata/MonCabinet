/**
 * Service de génération de عريضة الدعوى (requête introductive d'instance) tunisienne
 *
 * Flow :
 * 1. Recherche hybride KB → articles légaux pertinents
 * 2. Construction du contexte sources
 * 3. Appel DeepSeek → JSON عريضة structurée
 * 4. Retourne AriidaDocument + sources
 */

import { createLogger } from '@/lib/logger'
import { callLLMWithFallback } from './llm-fallback-service'
import { searchRelevantContext } from './rag-search-service'
import { buildContextFromSources } from './rag-context-builder'
import { ARIIDA_SYSTEM_PROMPT, buildAriidaUserPrompt } from './prompts/ariida-prompt'
import type { ChatSource } from './rag-search-service'

const log = createLogger('AI:Ariida')

// =============================================================================
// TYPES
// =============================================================================

export interface AriidaParty {
  nom: string
  prenom?: string
  qualite?: string
  adresse?: string
  cin?: string
}

export interface AriidaQualification {
  nature: string
  type?: string
  fondement?: string
}

export interface AriidaDocument {
  tribunal: string
  division: string
  ville?: string
  demandeur: AriidaParty
  defendeur: AriidaParty
  objetDemande: string
  qualification: AriidaQualification
  faits: string
  fondementsJuridiques: string[]
  pretentions: string[]
  pieces: string[]
  remarques?: string
  langueDocument: 'ar' | 'fr'
  sources?: ChatSource[]
}

// =============================================================================
// GÉNÉRATION
// =============================================================================

/**
 * Génère une عريضة دعوى complète à partir d'un narratif de faits.
 *
 * @param narratif - Description libre des faits par l'avocat
 * @param userId   - ID utilisateur (pour le RAG search)
 */
export async function genererAriida(narratif: string, userId: string): Promise<AriidaDocument> {
  log.info('[Ariida] Démarrage génération عريضة')

  // Étape 1 : Recherche RAG pour trouver les textes légaux pertinents
  let sources: ChatSource[] = []
  let sourcesContext = ''

  try {
    const searchResult = await searchRelevantContext(narratif, userId, {
      includeJurisprudence: false,
      includeKnowledgeBase: true,
      maxContextChunks: 5,
    })
    sources = searchResult.sources

    if (sources.length > 0) {
      sourcesContext = await buildContextFromSources(sources, 'ar')
      log.info(`[Ariida] ${sources.length} source(s) KB trouvée(s)`)
    }
  } catch (err) {
    // Ne pas bloquer la génération si la recherche échoue
    log.error('[Ariida] Erreur recherche KB (non bloquante):', err)
  }

  // Étape 2 : Appel LLM (DeepSeek)
  const userPrompt = buildAriidaUserPrompt(narratif, sourcesContext)

  const llmResponse = await callLLMWithFallback(
    [
      { role: 'system', content: ARIIDA_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      operationName: 'ariida-generation',
      temperature: 0.2,
      maxTokens: 3000,
    }
  )

  const rawText = llmResponse.answer?.trim() ?? ''

  // Étape 3 : Parser le JSON retourné
  let ariida: AriidaDocument

  try {
    // Extraire le JSON (peut être entouré de ```json ... ```)
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : rawText
    ariida = JSON.parse(jsonStr)
  } catch (parseErr) {
    log.error('[Ariida] Erreur parsing JSON LLM:', parseErr)
    log.error('[Ariida] Réponse brute:', rawText.slice(0, 500))
    throw new Error('Impossible de parser la réponse IA en عريضة. Veuillez reformuler les faits.')
  }

  // Attacher les sources KB à la عريضة
  ariida.sources = sources

  return ariida
}

// =============================================================================
// STREAMING: Generator SSE pour feedback temps réel
// =============================================================================

export type AriidaStreamEvent =
  | { type: 'progress'; step: 'searching' | 'sources_found' | 'generating'; count?: number }
  | { type: 'done'; result: string; sources: ChatSource[]; tokensUsed: { input: number; output: number; total: number } }
  | { type: 'error'; error: string }

/**
 * Version streaming de genererAriida().
 * Émet des événements de progression : recherche KB → génération LLM → résultat.
 */
export async function* genererAriidaStream(
  narratif: string,
  userId: string
): AsyncGenerator<AriidaStreamEvent> {
  yield { type: 'progress', step: 'searching' }

  let sources: ChatSource[] = []
  let sourcesContext = ''

  try {
    const searchResult = await searchRelevantContext(narratif, userId, {
      includeJurisprudence: false,
      includeKnowledgeBase: true,
      maxContextChunks: 5,
    })
    sources = searchResult.sources

    if (sources.length > 0) {
      sourcesContext = await buildContextFromSources(sources, 'ar')
      log.info(`[Ariida Stream] ${sources.length} source(s) KB trouvée(s)`)
    }

    yield { type: 'progress', step: 'sources_found', count: sources.length }
  } catch (err) {
    log.error('[Ariida Stream] Erreur recherche KB (non bloquante):', err)
    yield { type: 'progress', step: 'sources_found', count: 0 }
  }

  yield { type: 'progress', step: 'generating' }

  try {
    const userPrompt = buildAriidaUserPrompt(narratif, sourcesContext)
    const llmResponse = await callLLMWithFallback(
      [
        { role: 'system', content: ARIIDA_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        operationName: 'ariida-generation',
        temperature: 0.2,
        maxTokens: 3000,
      }
    )

    const rawText = llmResponse.answer?.trim() ?? ''
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : rawText
    const ariida: AriidaDocument = JSON.parse(jsonStr)
    const { sources: _srcs, ...ariidaWithoutSources } = ariida

    yield {
      type: 'done',
      result: JSON.stringify(ariidaWithoutSources, null, 2),
      sources,
      tokensUsed: { input: 0, output: 0, total: 0 },
    }
  } catch (error) {
    log.error('[Ariida Stream] Erreur génération:', error)
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Impossible de générer la عريضة',
    }
  }
}
