import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'À propos — Qadhya | Notre Mission',
  description: 'Qadhya simplifie la pratique juridique en Tunisie. Découvrez notre mission, notre histoire et nos valeurs.',
  openGraph: {
    title: 'À propos — Qadhya',
    description: 'Simplifier la pratique juridique en Tunisie avec des outils modernes.',
    url: 'https://qadhya.tn/a-propos',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'À propos de Qadhya' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'À propos — Qadhya',
    description: 'Simplifier la pratique juridique en Tunisie avec des outils modernes.',
    images: ['/opengraph-image'],
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
