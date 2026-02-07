/**
 * Service de traduction AR ↔ FR via Groq
 *
 * Utilise un modèle rapide (llama-3.1-8b-instant) pour traduire
 * les questions juridiques entre arabe et français.
 */

import OpenAI from 'openai'
import { aiConfig } from './config'
import {
  getCachedTranslation,
  setCachedTranslation,
} from '@/lib/cache/translation-cache'

// =============================================================================
// CONFIGURATION
// =============================================================================

const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL || 'llama-3.1-8b-instant'

// Client Groq
let groqClient: OpenAI | null = null

function getGroqClient(): OpenAI | null {
  if (!aiConfig.groq.apiKey) {
    return null
  }

  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }

  return groqClient
}

// =============================================================================
// PROMPTS
// =============================================================================

const TRANSLATION_PROMPTS = {
  ar_to_fr: `Tu es un traducteur juridique spécialisé arabe-français.
Traduis la question suivante de l'arabe vers le français.
Garde le sens juridique précis et utilise la terminologie juridique française appropriée.
Réponds UNIQUEMENT avec la traduction, sans explication.`,

  fr_to_ar: `أنت مترجم قانوني متخصص فرنسي-عربي.
ترجم السؤال التالي من الفرنسية إلى العربية.
حافظ على المعنى القانوني الدقيق واستخدم المصطلحات القانونية العربية المناسبة.
أجب فقط بالترجمة، دون أي شرح.`,
}

// =============================================================================
// TYPES
// =============================================================================

export interface TranslationResult {
  originalText: string
  translatedText: string
  sourceLanguage: 'ar' | 'fr'
  targetLanguage: 'ar' | 'fr'
  success: boolean
  error?: string
}

// =============================================================================
// FONCTIONS
// =============================================================================

/**
 * Traduit une question juridique
 *
 * @param text - Texte à traduire
 * @param from - Langue source ('ar' ou 'fr')
 * @param to - Langue cible ('ar' ou 'fr')
 * @returns Résultat de traduction
 */
export async function translateQuery(
  text: string,
  from: 'ar' | 'fr',
  to: 'ar' | 'fr'
): Promise<TranslationResult> {
  // Validation
  if (from === to) {
    return {
      originalText: text,
      translatedText: text,
      sourceLanguage: from,
      targetLanguage: to,
      success: true,
    }
  }

  // Vérifier le cache de traduction
  const cachedTranslation = await getCachedTranslation(text, from, to)
  if (cachedTranslation) {
    return {
      originalText: text,
      translatedText: cachedTranslation,
      sourceLanguage: from,
      targetLanguage: to,
      success: true,
    }
  }

  const client = getGroqClient()

  if (!client) {
    console.warn('[Translation] Groq non configuré - traduction désactivée')
    return {
      originalText: text,
      translatedText: text,
      sourceLanguage: from,
      targetLanguage: to,
      success: false,
      error: 'Service de traduction non disponible',
    }
  }

  const promptKey = `${from}_to_${to}` as keyof typeof TRANSLATION_PROMPTS
  const systemPrompt = TRANSLATION_PROMPTS[promptKey]

  if (!systemPrompt) {
    return {
      originalText: text,
      translatedText: text,
      sourceLanguage: from,
      targetLanguage: to,
      success: false,
      error: `Direction de traduction non supportée: ${from} → ${to}`,
    }
  }

  try {
    const response = await client.chat.completions.create({
      model: TRANSLATION_MODEL,
      max_tokens: 500,
      temperature: 0.1, // Basse température pour traduction précise
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    })

    const translatedText = response.choices[0]?.message?.content?.trim() || ''

    if (!translatedText) {
      throw new Error('Réponse vide du modèle')
    }

    console.log(`[Translation] ${from}→${to}: "${text.substring(0, 50)}..." → "${translatedText.substring(0, 50)}..."`)

    // Mettre en cache la traduction
    await setCachedTranslation(text, translatedText, from, to, 'groq')

    return {
      originalText: text,
      translatedText,
      sourceLanguage: from,
      targetLanguage: to,
      success: true,
    }
  } catch (error) {
    console.error('[Translation] Erreur:', error instanceof Error ? error.message : error)

    return {
      originalText: text,
      translatedText: text, // Fallback: retourner le texte original
      sourceLanguage: from,
      targetLanguage: to,
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de traduction',
    }
  }
}

/**
 * Vérifie si le service de traduction est disponible
 */
export function isTranslationAvailable(): boolean {
  return !!aiConfig.groq.apiKey
}

/**
 * Traduit un batch de textes
 */
export async function translateBatch(
  texts: string[],
  from: 'ar' | 'fr',
  to: 'ar' | 'fr'
): Promise<TranslationResult[]> {
  // Traiter en parallèle avec limite de concurrence
  const batchSize = 5
  const results: TranslationResult[] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((text) => translateQuery(text, from, to))
    )
    results.push(...batchResults)
  }

  return results
}
