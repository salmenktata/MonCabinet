'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { History } from 'lucide-react'
import { ConsultationInput } from '@/components/dossiers/consultation/ConsultationInput'
import { ConsultationResult } from '@/components/dossiers/consultation/ConsultationResult'
import ConsultationHistory from '@/components/qadhya-ia/consult/ConsultationHistory'
import {
  useConsultationHistory,
  useConsultation,
  useInvalidateConsultationHistory,
} from '@/lib/hooks/useConsultationHistory'
import type { ConsultationResponse } from '@/app/actions/consultation'

export function ConsultPage() {
  const t = useTranslations('consultation')
  const searchParams = useSearchParams()

  const [result, setResult] = useState<ConsultationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [initialQuestion, setInitialQuestion] = useState('')
  const [initialContext, setInitialContext] = useState('')
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: historyItems = [], isLoading: historyLoading } = useConsultationHistory()
  const { data: loadedConsultation } = useConsultation(selectedConsultationId)
  const invalidateHistory = useInvalidateConsultationHistory()

  // Charger consultation depuis l'historique
  useEffect(() => {
    if (loadedConsultation) {
      setResult(loadedConsultation)
      setSheetOpen(false)
    }
  }, [loadedConsultation])

  // Pré-remplir depuis query params
  useEffect(() => {
    const question = searchParams.get('question')
    const context = searchParams.get('context')
    const from = searchParams.get('from')

    if (question) setInitialQuestion(question)
    if (context) setInitialContext(context)
    if (from === 'assistant' && question) {
      toast.info(t('fromAssistant'))
    }
  }, [searchParams, t])

  const handleConsultationComplete = (response: ConsultationResponse) => {
    setResult(response)
    setIsLoading(false)
    invalidateHistory()
  }

  const handleNewConsultation = () => {
    setResult(null)
    setSelectedConsultationId(null)
    setInitialQuestion('')
    setInitialContext('')
  }

  const handleHistorySelect = (id: string) => {
    setSelectedConsultationId(id)
  }

  // Sidebar historique (partagée entre desktop et mobile)
  const historyPanel = (
    <ConsultationHistory
      items={historyItems}
      isLoading={historyLoading}
      selectedId={selectedConsultationId}
      onSelect={handleHistorySelect}
      onNewConsultation={handleNewConsultation}
    />
  )

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex lg:w-80 lg:shrink-0 lg:flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('history.title')}</h2>
        </div>
        {historyPanel}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4 max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icons.messageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{t('title')}</h1>
                  <p className="text-muted-foreground">{t('subtitle')}</p>
                </div>
              </div>

              {/* Mobile history button */}
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <History className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <SheetHeader className="px-4 py-3 border-b">
                    <SheetTitle className="flex items-center gap-2 text-sm">
                      <History className="h-4 w-4" />
                      {t('history.title')}
                    </SheetTitle>
                  </SheetHeader>
                  {historyPanel}
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Contenu principal */}
          {!result ? (
            <>
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
                    initialQuestion={initialQuestion}
                    initialContext={initialContext}
                  />
                </CardContent>
              </Card>

              {/* Tips */}
              {!isLoading && (
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
            </>
          ) : (
            <ConsultationResult
              result={result}
              onNewConsultation={handleNewConsultation}
            />
          )}
        </div>
      </div>
    </div>
  )
}
