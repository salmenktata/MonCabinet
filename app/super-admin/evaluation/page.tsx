import { Metadata } from 'next'
import { EvaluationClient } from './EvaluationClient'

export const metadata: Metadata = {
  title: 'Évaluation RAG | Super Admin',
  description: 'Dashboard scorecard d\'évaluation du pipeline RAG',
}

export const dynamic = 'force-dynamic'

export default function EvaluationPage() {
  return <EvaluationClient />
}
