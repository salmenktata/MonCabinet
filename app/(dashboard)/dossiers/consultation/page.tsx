import { Metadata } from 'next'
import { ConsultationPage } from './ConsultationPage'

export const metadata: Metadata = {
  title: 'Consultation Juridique | Qadhya',
  description: 'Obtenez un conseil juridique rapide basé sur vos documents et la jurisprudence tunisienne',
}

export default function Page() {
  return <ConsultationPage />
}
