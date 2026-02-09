/**
 * Service de streaming pour les réponses IA
 * Support multi-providers: Anthropic, Groq, Ollama
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { aiConfig } from './config'

export type StreamProvider = 'anthropic' | 'groq' | 'ollama' | 'openai'

export interface StreamMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamOptions {
  provider: StreamProvider
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

/**
 * Crée un stream de réponse depuis un provider IA
 */
export async function createAIStream(
  messages: StreamMessage[],
  options: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const { provider, model, temperature = 0.7, maxTokens = 2000, systemPrompt } = options

  switch (provider) {
    case 'anthropic':
      return createAnthropicStream(messages, { model, temperature, maxTokens, systemPrompt })
    case 'groq':
      return createGroqStream(messages, { model, temperature, maxTokens, systemPrompt })
    case 'ollama':
      return createOllamaStream(messages, { model, temperature, maxTokens, systemPrompt })
    case 'openai':
      return createOpenAIStream(messages, { model, temperature, maxTokens, systemPrompt })
    default:
      throw new Error(`Provider non supporté: ${provider}`)
  }
}

/**
 * Stream Anthropic (Claude)
 */
async function createAnthropicStream(
  messages: StreamMessage[],
  options: Partial<StreamOptions>
): Promise<ReadableStream<Uint8Array>> {
  if (!aiConfig.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY non configuré')
  }

  const client = new Anthropic({ apiKey: aiConfig.anthropic.apiKey })
  const model = options.model || aiConfig.anthropic.model

  // Séparer le message système des autres
  const systemMessage = messages.find((m) => m.role === 'system')?.content || options.systemPrompt || ''
  const conversationMessages = messages.filter((m) => m.role !== 'system')

  const stream = await client.messages.create({
    model,
    max_tokens: options.maxTokens || 2000,
    temperature: options.temperature || 0.7,
    system: systemMessage,
    messages: conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    stream: true,
  })

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/**
 * Stream Groq (Llama, Mixtral)
 */
async function createGroqStream(
  messages: StreamMessage[],
  options: Partial<StreamOptions>
): Promise<ReadableStream<Uint8Array>> {
  if (!aiConfig.groq.apiKey) {
    throw new Error('GROQ_API_KEY non configuré')
  }

  const client = new OpenAI({
    apiKey: aiConfig.groq.apiKey,
    baseURL: aiConfig.groq.baseUrl,
  })
  const model = options.model || aiConfig.groq.model

  // Groq utilise l'API OpenAI compatible
  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 2000,
    stream: true,
  })

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(new TextEncoder().encode(content))
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/**
 * Stream OpenAI (GPT-4, GPT-3.5)
 */
async function createOpenAIStream(
  messages: StreamMessage[],
  options: Partial<StreamOptions>
): Promise<ReadableStream<Uint8Array>> {
  if (!aiConfig.openai.apiKey) {
    throw new Error('OPENAI_API_KEY non configuré')
  }

  const client = new OpenAI({ apiKey: aiConfig.openai.apiKey })
  const model = options.model || aiConfig.openai.chatModel

  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 2000,
    stream: true,
  })

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(new TextEncoder().encode(content))
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/**
 * Stream Ollama (modèles locaux)
 */
async function createOllamaStream(
  messages: StreamMessage[],
  options: Partial<StreamOptions>
): Promise<ReadableStream<Uint8Array>> {
  if (!aiConfig.ollama.enabled) {
    throw new Error('Ollama non configuré')
  }

  const model = options.model || aiConfig.ollama.chatModelDefault
  const baseUrl = aiConfig.ollama.baseUrl

  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
            options: {
              temperature: options.temperature || 0.7,
              num_predict: options.maxTokens || 2000,
            },
          }),
        })

        if (!response.ok) {
          throw new Error(`Ollama error: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              const data = JSON.parse(line)
              if (data.message?.content) {
                controller.enqueue(new TextEncoder().encode(data.message.content))
              }
            } catch (e) {
              // Ignorer les lignes mal formées
            }
          }
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/**
 * Convertit un ReadableStream en string (utile pour tests)
 */
export async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result
}
