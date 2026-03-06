'use client'

import { useState, useEffect, useRef } from 'react'
import {
  getSuggestions,
  getDefaultSuggestions,
  type Suggestion,
  type SuggestionMode,
  type SuggestionDomain,
} from '@/lib/data/suggestions'

interface UseSuggestionsOptions {
  mode: SuggestionMode
  domain?: SuggestionDomain | 'all'
  enableAI?: boolean
}

interface UseSuggestionsResult {
  suggestions: Suggestion[]
  isLoading: boolean
  isAI: boolean
}

export function useSuggestions({
  mode,
  domain = 'all',
  enableAI = true,
}: UseSuggestionsOptions): UseSuggestionsResult {
  const staticSuggestions =
    domain === 'all' ? getDefaultSuggestions(mode, 4) : getSuggestions(mode, domain)

  const [suggestions, setSuggestions] = useState<Suggestion[]>(staticSuggestions)
  const [isLoading, setIsLoading] = useState(false)
  const [isAI, setIsAI] = useState(false)
  const cacheRef = useRef<Map<string, Suggestion[]>>(new Map())

  useEffect(() => {
    // Mise à jour immédiate des suggestions statiques lors du changement de domaine
    const newStatic = domain === 'all' ? getDefaultSuggestions(mode, 4) : getSuggestions(mode, domain)
    setSuggestions(newStatic)
    setIsAI(false)

    if (!enableAI) return

    const cacheKey = `${mode}:${domain}`

    // Cache sessionStorage
    try {
      const cached = sessionStorage.getItem(`suggestions:${cacheKey}`)
      if (cached) {
        const parsed = JSON.parse(cached) as Suggestion[]
        setSuggestions(parsed)
        setIsAI(true)
        return
      }
    } catch {
      // ignore
    }

    // Cache mémoire
    if (cacheRef.current.has(cacheKey)) {
      setSuggestions(cacheRef.current.get(cacheKey)!)
      setIsAI(true)
      return
    }

    // Fetch IA en arrière-plan
    const controller = new AbortController()
    setIsLoading(true)

    const params = new URLSearchParams({ mode })
    if (domain !== 'all') params.set('domain', domain)

    fetch(`/api/chat/suggestions?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.fallback || !Array.isArray(data.suggestions)) return
        const aiSuggestions: Suggestion[] = data.suggestions
        // Sauvegarder en cache
        cacheRef.current.set(cacheKey, aiSuggestions)
        try {
          sessionStorage.setItem(`suggestions:${cacheKey}`, JSON.stringify(aiSuggestions))
        } catch {
          // ignore quota exceeded
        }
        setSuggestions(aiSuggestions)
        setIsAI(true)
      })
      .catch(() => {
        // Garder les suggestions statiques en cas d'erreur
      })
      .finally(() => {
        setIsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [mode, domain, enableAI])

  return { suggestions, isLoading, isAI }
}
