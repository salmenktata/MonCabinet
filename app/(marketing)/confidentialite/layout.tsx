import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Qadhya',
  description: 'Politique de confidentialité de Qadhya. Vos données sont hébergées en Tunisie et protégées.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
