import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Conditions d\'utilisation — Qadhya',
  description: 'Conditions générales d\'utilisation de la plateforme Qadhya, service SaaS de gestion de cabinet juridique.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
