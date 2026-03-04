import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Accès Anticipé — Qadhya | Réservez votre place gratuite',
  description: 'Soyez parmi les premiers avocats à utiliser Qadhya. Accès gratuit complet, 30 requêtes IA juridique offertes, +6 800 documents de droit tunisien. Sans carte bancaire.',
  openGraph: {
    title: 'Accès Anticipé — Qadhya',
    description: 'Réservez votre place gratuite parmi les premiers avocats à utiliser Qadhya. 30 requêtes IA juridique offertes, sans carte bancaire.',
    url: 'https://qadhya.tn/acces-anticipe',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Accès Anticipé Qadhya' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Accès Anticipé — Qadhya',
    description: 'Réservez votre place gratuite. 30 requêtes IA juridique offertes, sans carte bancaire.',
    images: ['/opengraph-image'],
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
