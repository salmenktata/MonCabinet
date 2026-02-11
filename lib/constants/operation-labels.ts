export const OPERATION_LABELS: Record<string, { fr: string; ar: string; icon: string }> = {
  embedding: {
    fr: 'Indexation',
    ar: 'الفهرسة',
    icon: 'database'
  },
  chat: {
    fr: 'Réponse Client',
    ar: 'رد العميل',
    icon: 'messageSquare'
  },
  generation: {
    fr: 'Génération Documents',
    ar: 'توليد الوثائق',
    icon: 'fileText'
  },
  classification: {
    fr: 'Classification',
    ar: 'التصنيف',
    icon: 'tag'
  },
  extraction: {
    fr: 'Extraction Métadonnées',
    ar: 'استخراج البيانات الوصفية',
    icon: 'filter'
  }
}

export const PROVIDER_LABELS: Record<string, { name: string; color: string }> = {
  gemini: { name: 'Gemini', color: 'bg-blue-500' },
  deepseek: { name: 'DeepSeek', color: 'bg-purple-500' },
  groq: { name: 'Groq', color: 'bg-orange-500' },
  anthropic: { name: 'Anthropic', color: 'bg-red-500' },
  openai: { name: 'OpenAI', color: 'bg-cyan-500' },
  ollama: { name: 'Ollama', color: 'bg-green-500' }
}
