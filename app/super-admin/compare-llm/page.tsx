import { Metadata } from 'next'
import { CompareLLMClient } from './CompareLLMClient'

export const metadata: Metadata = {
  title: 'Comparaison LLM | Super Admin',
  description: 'Tester la même question sur Gemini, OpenAI et Ollama en parallèle',
}

export const dynamic = 'force-dynamic'

export default function CompareLLMPage() {
  return <CompareLLMClient />
}
