import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

type Step = 'input' | 'clarifying' | 'analyzing' | 'result'

export interface ClarifyingQuestion {
  id: string
  question: string
  hint: string
  required: boolean
}

interface AssistantState {
  // État principal
  step: Step
  narratif: string
  result: StructuredDossier | null
  error: string

  // Questions clarificatrices
  clarifyingQuestions: ClarifyingQuestion[]
  clarifyingAnswers: Record<string, string>
  enrichedNarratif: string

  // Actions
  setStep: (step: Step) => void
  setNarratif: (narratif: string) => void
  setResult: (result: StructuredDossier | null) => void
  setError: (error: string) => void
  setClarifyingQuestions: (questions: ClarifyingQuestion[]) => void
  setClarifyingAnswer: (questionId: string, answer: string) => void
  setEnrichedNarratif: (narratif: string) => void
  updateResult: (updates: Partial<StructuredDossier>) => void
  reset: () => void
}

const initialState = {
  step: 'input' as Step,
  narratif: '',
  result: null,
  error: '',
  clarifyingQuestions: [] as ClarifyingQuestion[],
  clarifyingAnswers: {} as Record<string, string>,
  enrichedNarratif: '',
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) => set({ step }),

      setNarratif: (narratif) => set({ narratif }),

      setResult: (result) => set({ result }),

      setError: (error) => set({ error }),

      setClarifyingQuestions: (questions) => set({ clarifyingQuestions: questions }),

      setClarifyingAnswer: (questionId, answer) =>
        set((state) => ({
          clarifyingAnswers: { ...state.clarifyingAnswers, [questionId]: answer },
        })),

      setEnrichedNarratif: (narratif) => set({ enrichedNarratif: narratif }),

      updateResult: (updates) =>
        set((state) => ({
          result: state.result ? { ...state.result, ...updates } : null,
        })),

      reset: () => set(initialState),
    }),
    {
      name: 'assistant-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? sessionStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      partialize: (state) => {
        let lightResult = null
        if (state.result) {
          lightResult = {
            ...state.result,
            narratifOriginal: undefined,
            ragMetrics: undefined,
            actionsSuggerees: state.result.actionsSuggerees?.slice(0, 10) || [],
            references: state.result.references?.slice(0, 5) || [],
          }
        }

        return {
          step:
            state.step === 'analyzing' || state.step === 'clarifying'
              ? 'input'
              : state.step,
          narratif: state.narratif.slice(0, 2000),
          result: lightResult,
          error: state.error,
          clarifyingQuestions: [],
          clarifyingAnswers: {},
          enrichedNarratif: '',
        }
      },
    }
  )
)
