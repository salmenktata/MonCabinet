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
