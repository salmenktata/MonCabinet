import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tarification — Qadhya | Plans et Prix',
  description: 'Découvrez nos plans tarifaires : Starter gratuit, Pro à 79 DT/mois et Cabinet à 199 DT/mois. Accès gratuit inclus.',
  openGraph: {
    title: 'Tarification — Qadhya',
    description: 'Plans flexibles pour chaque cabinet. Commencez gratuitement, évoluez selon vos besoins.',
    url: 'https://qadhya.tn/tarification',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Tarification Qadhya' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarification — Qadhya',
    description: 'Plans flexibles pour chaque cabinet. Commencez gratuitement, évoluez selon vos besoins.',
    images: ['/opengraph-image'],
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
