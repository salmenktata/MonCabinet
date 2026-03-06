import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getRedisClient } from '@/lib/cache/redis'
import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'
import {
  getSuggestions,
  getDefaultSuggestions,
  ALL_DOMAINS,
  type Suggestion,
  type SuggestionMode,
  type SuggestionDomain,
} from '@/lib/data/suggestions'

export const dynamic = 'force-dynamic'

const CACHE_TTL_SECONDS = 86400 // 24h

function isValidMode(v: string): v is SuggestionMode {
  return v === 'chat' || v === 'structure' || v === 'ariida'
}

function isValidDomain(v: string): v is SuggestionDomain {
  return ALL_DOMAINS.includes(v as SuggestionDomain)
}

const PROMPT = (mode: SuggestionMode, domain: SuggestionDomain | 'all') => {
  const modeLabel =
    mode === 'chat'
      ? 'assistant IA conversationnel'
      : mode === 'structure'
        ? 'structuration de dossier juridique'
        : 'rédaction de requête introductive'

  const domainLabel = domain === 'all' ? 'tous domaines du droit tunisien' : domain

  return `Tu es un assistant juridique tunisien expert. Génère 4 suggestions de cas juridiques concrets et réalistes pour un utilisateur utilisant un outil de ${modeLabel}, domaine: ${domainLabel}.

RÈGLES STRICTES:
- Chaque suggestion doit être un vrai cas tunisien (Code du travail, CSP, COCC, Code pénal...)
- label: 3-5 mots, résumé très court du cas
- send: 30-60 mots, description réaliste du problème que l'utilisateur enverrait à l'assistant

JSON UNIQUEMENT (pas de markdown):
[{"label":"...","send":"..."},{"label":"...","send":"..."},{"label":"...","send":"..."},{"label":"...","send":"..."}]`
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ fallback: true }, { status: 401 })
    }

    const { searchParams } = req.nextUrl
    const modeParam = searchParams.get('mode') ?? 'chat'
    const domainParam = searchParams.get('domain') ?? 'all'

    if (!isValidMode(modeParam)) {
      return NextResponse.json({ fallback: true }, { status: 400 })
    }

    const mode: SuggestionMode = modeParam
    const domain: SuggestionDomain | 'all' =
      domainParam !== 'all' && isValidDomain(domainParam) ? domainParam : 'all'

    const cacheKey = `suggestions:${mode}:${domain}`

    // Vérifier le cache Redis
    const redis = await getRedisClient()
    if (redis) {
      try {
        const cached = await redis.get(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as Suggestion[]
          return NextResponse.json({ suggestions: parsed, source: 'cache' })
        }
      } catch {
        // Ignore cache error
      }
    }

    // Appel LLM pour générer les suggestions
    const response = await callLLMWithFallback(
      [{ role: 'user', content: PROMPT(mode, domain) }],
      {
        temperature: 0.7,
        maxTokens: 800,
        operationName: 'dossiers-assistant',
      }
    )

    const text = response.answer.trim()

    // Extraire le JSON
    let jsonStr = text
    const match = text.match(/\[[\s\S]*\]/)
    if (match) jsonStr = match[0]

    const rawItems = JSON.parse(jsonStr) as Array<{ label: string; send: string }>

    // Construire les suggestions IA avec le même format que les statiques
    const staticBase = domain === 'all' ? getDefaultSuggestions(mode, 4) : getSuggestions(mode, domain)
    const aiSuggestions: Suggestion[] = rawItems
      .filter((item) => item.label && item.send)
      .slice(0, 4)
      .map((item, i) => ({
        id: `ai-${mode}-${domain}-${i}`,
        label: item.label.trim(),
        send: item.send.trim(),
        domain: (domain === 'all' ? (staticBase[i]?.domain ?? 'famille') : domain) as SuggestionDomain,
        icon: staticBase[i]?.icon ?? 'sparkles',
        mode,
      }))

    if (aiSuggestions.length === 0) {
      return NextResponse.json({ fallback: true })
    }

    // Sauvegarder en cache Redis
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(aiSuggestions), { EX: CACHE_TTL_SECONDS })
      } catch {
        // Ignore cache write error
      }
    }

    return NextResponse.json({ suggestions: aiSuggestions, source: 'llm' })
  } catch (error) {
    console.error('[Suggestions] Erreur:', error)
    return NextResponse.json({ fallback: true })
  }
}
