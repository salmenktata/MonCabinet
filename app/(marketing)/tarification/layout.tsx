import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tarification — Qadhya | Plans et Prix',
  description: 'Découvrez nos plans tarifaires : Starter gratuit, Pro à 79 DT/mois et Cabinet à 199 DT/mois. Essai gratuit 14 jours.',
  openGraph: {
    title: 'Tarification — Qadhya',
    description: 'Plans flexibles pour chaque cabinet. Commencez gratuitement, évoluez selon vos besoins.',
    url: 'https://qadhya.tn/tarification',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
