'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, ArrowRight, SkipForward, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
        {questions.map((question, index) => {
          const currentAnswer = answers[question.id] || ''
          const hasOptions = question.options && question.options.length > 0
          const isOptionSelected = hasOptions
            ? question.options!.includes(currentAnswer)
            : false

          return (
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

                  {hasOptions ? (
                    <div className="space-y-1.5">
                      {question.options!.map((option, optIdx) => {
                        const isSelected = currentAnswer === option
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => onAnswerChange(question.id, option)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5 text-foreground',
                              isSubmitting && 'cursor-not-allowed opacity-50'
                            )}
                            dir="auto"
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {optIdx + 1}
                            </span>
                            {option}
                          </button>
                        )
                      })}
                      <Input
                        value={isOptionSelected ? '' : currentAnswer}
                        onChange={(e) => onAnswerChange(question.id, e.target.value)}
                        placeholder={t('otherAnswer')}
                        className="mt-2 text-sm h-8"
                        dir="auto"
                        disabled={isSubmitting}
                      />
                    </div>
                  ) : (
                    <Textarea
                      value={currentAnswer}
                      onChange={(e) => onAnswerChange(question.id, e.target.value)}
                      placeholder={t('answerPlaceholder')}
                      className="min-h-[60px] resize-none text-sm"
                      dir="auto"
                      disabled={isSubmitting}
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isSubmitting} className="w-full sm:w-auto">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">{t('backToInput')}</span>
            <span className="sm:hidden">{t('backToInput')}</span>
          </Button>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length}
            </span>
            <Button variant="outline" size="sm" onClick={onSkip} disabled={isSubmitting}>
              <SkipForward className="mr-1.5 h-4 w-4" />
              <span className="hidden xs:inline">{t('skip')}</span>
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={isSubmitting || !requiredAnswered}
              className="flex-1 sm:flex-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  <span className="hidden xs:inline">{t('submitting')}</span>
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
