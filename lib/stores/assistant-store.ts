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
      partialize: (state) => ({
        step: state.step === 'analyzing' ? 'input' : state.step,
        narratif: state.narratif,
        result: state.result,
        error: state.error,
      }),
    }
  )
)
