import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact — Qadhya',
  description: 'Contactez l\'équipe Qadhya. Nous sommes là pour vous aider avec votre gestion de cabinet juridique.',
  openGraph: {
    title: 'Contact — Qadhya',
    description: 'Une question ? Notre équipe vous répond rapidement.',
    url: 'https://qadhya.tn/contact',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
