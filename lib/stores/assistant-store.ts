import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

type Step = 'input' | 'analyzing' | 'result'

interface AssistantState {
  // État principal
  step: Step
  narratif: string
  result: StructuredDossier | null
  error: string

  // Actions
  setStep: (step: Step) => void
  setNarratif: (narratif: string) => void
  setResult: (result: StructuredDossier | null) => void
  setError: (error: string) => void
  updateResult: (updates: Partial<StructuredDossier>) => void
  reset: () => void
}

const initialState = {
  step: 'input' as Step,
  narratif: '',
  result: null,
  error: '',
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) => set({ step }),

      setNarratif: (narratif) => set({ narratif }),

      setResult: (result) => set({ result }),

      setError: (error) => set({ error }),

      updateResult: (updates) =>
        set((state) => ({
          result: state.result ? { ...state.result, ...updates } : null,
        })),

      reset: () => set(initialState),
    }),
    {
      name: 'assistant-store',
      storage: createJSONStorage(() => sessionStorage),
      // Ne pas persister l'étape 'analyzing' - si on recharge pendant l'analyse, revenir à 'input'
      partialize: (state) => {
        // Optimisation mémoire : exclure les données volumineuses non essentielles
        let lightResult = null
        if (state.result) {
          lightResult = {
            ...state.result,
            // Exclure le narratif original (déjà dans state.narratif)
            narratifOriginal: undefined,
            // Exclure les métriques RAG (debug uniquement)
            ragMetrics: undefined,
            // Garder uniquement les N premières actions/références
            actionsSuggerees: state.result.actionsSuggerees?.slice(0, 10) || [],
            references: state.result.references?.slice(0, 5) || [],
          }
        }

        return {
          step: state.step === 'analyzing' ? 'input' : state.step,
          // Limiter la taille du narratif stocké (garder 2000 premiers caractères)
          narratif: state.narratif.slice(0, 2000),
          result: lightResult,
          error: state.error,
        }
      },
    }
  )
)
