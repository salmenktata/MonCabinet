import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'À propos — Qadhya | Notre Mission',
  description: 'Qadhya simplifie la pratique juridique en Tunisie. Découvrez notre mission, notre histoire et nos valeurs.',
  openGraph: {
    title: 'À propos — Qadhya',
    description: 'Simplifier la pratique juridique en Tunisie avec des outils modernes.',
    url: 'https://qadhya.tn/a-propos',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
