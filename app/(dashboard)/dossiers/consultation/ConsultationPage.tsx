'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Icons } from '@/lib/icons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConsultationInput } from '@/components/dossiers/consultation/ConsultationInput'
import { ConsultationResult } from '@/components/dossiers/consultation/ConsultationResult'
import type { ConsultationResponse } from '@/app/actions/consultation'

export function ConsultationPage() {
  const t = useTranslations('consultation')
  const [result, setResult] = useState<ConsultationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleConsultationComplete = (response: ConsultationResponse) => {
    setResult(response)
    setIsLoading(false)
  }

  const handleNewConsultation = () => {
    setResult(null)
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icons.messageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.zap className="h-5 w-5 text-primary" />
              {t('inputTitle')}
            </CardTitle>
            <CardDescription>{t('inputDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConsultationInput
              onComplete={handleConsultationComplete}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          </CardContent>
        </Card>
      ) : (
        <ConsultationResult
          result={result}
          onNewConsultation={handleNewConsultation}
        />
      )}

      {/* Aide contextuelle */}
      {!result && !isLoading && (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <Icons.lightbulb className="h-8 w-8 text-amber-500 mb-3" />
              <h3 className="font-semibold mb-2">{t('tipTitle1')}</h3>
              <p className="text-sm text-muted-foreground">{t('tipDescription1')}</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <Icons.scale className="h-8 w-8 text-blue-500 mb-3" />
              <h3 className="font-semibold mb-2">{t('tipTitle2')}</h3>
              <p className="text-sm text-muted-foreground">{t('tipDescription2')}</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <Icons.fileText className="h-8 w-8 text-green-500 mb-3" />
              <h3 className="font-semibold mb-2">{t('tipTitle3')}</h3>
              <p className="text-sm text-muted-foreground">{t('tipDescription3')}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
