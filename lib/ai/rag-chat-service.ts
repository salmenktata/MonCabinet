/**
 * Service RAG Chat - Barrel re-export
 * Ce fichier re-exporte tous les modules RAG pour préserver la rétrocompatibilité.
 *
 * Modules:
 * - rag-search-service   : Recherche contextuelle, re-ranking, quality gate, recherche bilingue
 * - rag-context-builder  : Construction du contexte LLM, sanitisation des citations
 * - rag-pipeline         : Types publics, clients LLM, answerQuestion(), answerQuestionStream()
 * - rag-conversation     : CRUD conversations et messages
 */
export * from './rag-search-service'
export * from './rag-context-builder'
export * from './rag-pipeline'
export * from './rag-conversation'
