'use server'

import { getSession } from '@/lib/auth/session'
import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'
import { detectLanguage } from '@/lib/ai/language-utils'
import type { ClarifyingQuestion } from '@/lib/stores/assistant-store'

const PROMPT_FR = `Tu es un assistant juridique tunisien expert. Analyse le récit suivant et identifie 3 à 5 informations manquantes importantes pour structurer correctement le dossier.

Pour chaque information manquante, génère une question précise à poser.

Catégories d'informations à vérifier :
- Identité complète des parties (noms, qualités, adresses)
- Dates clés (faits, notifications, assignations)
- Montants et chiffres (créances, dommages, loyers)
- Juridiction compétente et procédure envisagée
- Pièces justificatives disponibles
- Résultat souhaité par le client

Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) :
[
  {
    "id": "q1",
    "question": "Question précise ici",
    "hint": "Pourquoi cette info est importante",
    "required": true
  }
]`

const PROMPT_AR = `أنت مساعد قانوني تونسي خبير. حلّل الرواية التالية وحدّد 3 إلى 5 معلومات ناقصة مهمة لهيكلة الملف بشكل صحيح.

لكل معلومة ناقصة، أنشئ سؤالاً دقيقاً.

فئات المعلومات للتحقق:
- الهوية الكاملة للأطراف (الأسماء، الصفات، العناوين)
- التواريخ الرئيسية (الوقائع، التبليغات، الاستدعاءات)
- المبالغ والأرقام (الديون، التعويضات، الكراء)
- المحكمة المختصة والإجراء المتوقع
- الوثائق المتوفرة
- النتيجة المرجوة من الحريف

أرجع فقط JSON صالح (بدون markdown، بدون backticks):
[
  {
    "id": "q1",
    "question": "السؤال الدقيق هنا",
    "hint": "لماذا هذه المعلومة مهمة",
    "required": true
  }
]`

export async function generateClarifyingQuestions(
  narratif: string
): Promise<{ success: boolean; data?: ClarifyingQuestion[]; error?: string }> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { success: false, error: 'Non autorisé' }
    }

    const lang = detectLanguage(narratif)
    const prompt = lang === 'ar' ? PROMPT_AR : PROMPT_FR

    const response = await callLLMWithFallback(
      [
        {
          role: 'user',
          content: `${prompt}\n\nRécit :\n${narratif}`,
        },
      ],
      {
        temperature: 0.3,
        maxTokens: 1500,
        operationName: 'dossiers-assistant',
      }
    )

    const text = response.answer.trim()

    // Extraire le JSON du texte (peut être entouré de ```json...```)
    let jsonStr = text
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const questions: ClarifyingQuestion[] = JSON.parse(jsonStr)

    // Valider la structure
    const validated = questions
      .filter((q) => q.question && q.id)
      .slice(0, 5)
      .map((q, i) => ({
        id: q.id || `q${i + 1}`,
        question: q.question,
        hint: q.hint || '',
        required: q.required ?? false,
      }))

    if (validated.length === 0) {
      return { success: false, error: 'Aucune question générée' }
    }

    return { success: true, data: validated }
  } catch (error) {
    console.error('[ClarifyingQuestions] Erreur:', error)
    return { success: false, error: 'Erreur génération questions' }
  }
}

export async function enrichNarrativeWithAnswers(
  narratif: string,
  answers: Record<string, string>,
  questions: ClarifyingQuestion[]
): Promise<string> {
  // Construire un narratif enrichi en ajoutant les réponses
  const answeredParts = questions
    .filter((q) => answers[q.id]?.trim())
    .map((q) => `${q.question}\n${answers[q.id].trim()}`)

  if (answeredParts.length === 0) return narratif

  return `${narratif}\n\nInformations complémentaires :\n${answeredParts.join('\n\n')}`
}
