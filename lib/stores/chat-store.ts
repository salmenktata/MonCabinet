/**
 * Store Zustand pour gérer l'état du chat
 * Gère la préférence mode rapide/premium de l'utilisateur
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ChatState {
  // Mode LLM : false = rapide (Ollama), true = premium (cloud providers)
  usePremiumModel: boolean
  setUsePremiumModel: (premium: boolean) => void

  // Conversation active
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void

  // Messages en cours de streaming
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      // État initial
      usePremiumModel: false,
      activeConversationId: null,
      isStreaming: false,

      // Actions
      setUsePremiumModel: (premium) => set({ usePremiumModel: premium }),
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      setIsStreaming: (streaming) => set({ isStreaming: streaming }),
    }),
    {
      name: 'chat-preferences',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      partialize: (state) => ({
        // Persister uniquement la préférence du modèle
        usePremiumModel: state.usePremiumModel,
      }),
    }
  )
)
