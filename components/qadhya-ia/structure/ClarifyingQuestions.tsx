'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, ArrowRight, SkipForward, Loader2 } from 'lucide-react'
import type { ClarifyingQuestion } from '@/lib/stores/assistant-store'

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[]
  answers: Record<string, string>
  onAnswerChange: (questionId: string, answer: string) => void
  onSubmit: () => void
  onSkip: () => void
  onBack: () => void
  isSubmitting?: boolean
}

export default function ClarifyingQuestions({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  onSkip,
  onBack,
  isSubmitting = false,
}: ClarifyingQuestionsProps) {
  const t = useTranslations('assistant.clarifying')

  const requiredAnswered = questions
    .filter((q) => q.required)
    .every((q) => answers[q.id]?.trim())

  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">&#10068;</span>
          {t('title')}
        </CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {questions.map((question, index) => (
          <div key={question.id} className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm" dir="auto">
                    {question.question}
                  </p>
                  {question.required ? (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {t('required')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {t('optional')}
                    </Badge>
                  )}
                </div>
                {question.hint && (
                  <p className="text-xs text-muted-foreground" dir="auto">
                    {question.hint}
                  </p>
                )}
                <Textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => onAnswerChange(question.id, e.target.value)}
                  placeholder={t('answerPlaceholder')}
                  className="min-h-[60px] resize-none text-sm"
                  dir="auto"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t('backToInput')}
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length}
            </span>
            <Button variant="outline" size="sm" onClick={onSkip} disabled={isSubmitting}>
              <SkipForward className="mr-1.5 h-4 w-4" />
              {t('skip')}
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={isSubmitting || !requiredAnswered}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                <>
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                  {t('submit')}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
