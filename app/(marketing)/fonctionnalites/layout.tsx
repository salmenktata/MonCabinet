import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Fonctionnalités — Qadhya | Gestion de Cabinet Juridique',
  description: 'Découvrez toutes les fonctionnalités de Qadhya : gestion des dossiers, calcul des délais légaux, facturation, IA juridique et plus.',
  openGraph: {
    title: 'Fonctionnalités — Qadhya',
    description: 'La plateforme complète pour les avocats tunisiens. Dossiers, délais, facturation et IA juridique.',
    url: 'https://qadhya.tn/fonctionnalites',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
