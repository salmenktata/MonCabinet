/**
 * Service helper pour tester les connexions aux différents providers
 */

interface TestResult {
  success: boolean
  message?: string
  error?: string
  modelsList?: string[]
  latency?: number
}

/**
 * Tester la connexion à Gemini
 */
async function testGeminiConnection(apiKey: string): Promise<TestResult> {
  const startTime = Date.now()
  try {
    // Utiliser l'endpoint listModels qui est plus fiable pour tester la connexion
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error?.message || `Erreur HTTP ${response.status}`,
        latency,
      }
    }

    const data = await response.json()
    const modelsList = data.models
      ?.filter((m: any) => m.name.includes('gemini'))
      ?.map((m: any) => m.name.replace('models/', ''))
      ?.slice(0, 5) || []

    return {
      success: true,
      message: 'Connexion Gemini OK',
      modelsList,
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Tester la connexion à DeepSeek (OpenAI-compatible)
 */
async function testDeepSeekConnection(apiKey: string): Promise<TestResult> {
  const startTime = Date.now()
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: 'Réponds juste "OK" pour confirmer la connexion.' },
        ],
        max_tokens: 10,
      }),
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error?.message || `Erreur HTTP ${response.status}`,
        latency,
      }
    }

    const data = await response.json()
    return {
      success: true,
      message: 'Connexion DeepSeek OK',
      modelsList: ['deepseek-chat', 'deepseek-coder'],
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Tester la connexion à Groq
 */
async function testGroqConnection(apiKey: string): Promise<TestResult> {
  const startTime = Date.now()
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: 'Réponds juste "OK" pour confirmer la connexion.' },
        ],
        max_tokens: 10,
      }),
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error?.message || `Erreur HTTP ${response.status}`,
        latency,
      }
    }

    const data = await response.json()
    return {
      success: true,
      message: 'Connexion Groq OK',
      modelsList: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Tester la connexion à OpenAI
 */
async function testOpenAIConnection(apiKey: string): Promise<TestResult> {
  const startTime = Date.now()
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error?.message || `Erreur HTTP ${response.status}`,
        latency,
      }
    }

    const data = await response.json()
    const modelsList = data.data
      ?.filter((m: any) => m.id.includes('gpt'))
      ?.map((m: any) => m.id)
      ?.slice(0, 5) || []

    return {
      success: true,
      message: 'Connexion OpenAI OK',
      modelsList,
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Tester la connexion à Anthropic
 */
async function testAnthropicConnection(apiKey: string): Promise<TestResult> {
  const startTime = Date.now()
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10,
        messages: [
          { role: 'user', content: 'Réponds juste "OK" pour confirmer la connexion.' },
        ],
      }),
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error?.message || `Erreur HTTP ${response.status}`,
        latency,
      }
    }

    const data = await response.json()
    return {
      success: true,
      message: 'Connexion Anthropic OK',
      modelsList: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Tester la connexion à Ollama
 */
async function testOllamaConnection(): Promise<TestResult> {
  const startTime = Date.now()
  try {
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434'

    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      method: 'GET',
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      return {
        success: false,
        error: `Erreur HTTP ${response.status} - Ollama non accessible`,
        latency,
      }
    }

    const data = await response.json()
    const modelsList = data.models?.map((m: any) => m.name) || []

    return {
      success: true,
      message: 'Connexion Ollama OK',
      modelsList,
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur réseau inconnue',
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Router principal pour tester la connexion selon le provider
 */
export async function testProviderConnection(
  provider: string,
  apiKey?: string
): Promise<TestResult> {
  const providerLower = provider.toLowerCase()

  switch (providerLower) {
    case 'gemini':
      if (!apiKey) {
        return { success: false, error: 'Clé API Gemini requise' }
      }
      return testGeminiConnection(apiKey)

    case 'deepseek':
      if (!apiKey) {
        return { success: false, error: 'Clé API DeepSeek requise' }
      }
      return testDeepSeekConnection(apiKey)

    case 'groq':
      if (!apiKey) {
        return { success: false, error: 'Clé API Groq requise' }
      }
      return testGroqConnection(apiKey)

    case 'openai':
      if (!apiKey) {
        return { success: false, error: 'Clé API OpenAI requise' }
      }
      return testOpenAIConnection(apiKey)

    case 'anthropic':
      if (!apiKey) {
        return { success: false, error: 'Clé API Anthropic requise' }
      }
      return testAnthropicConnection(apiKey)

    case 'ollama':
      return testOllamaConnection()

    default:
      return {
        success: false,
        error: `Provider non supporté: ${provider}`,
      }
  }
}
