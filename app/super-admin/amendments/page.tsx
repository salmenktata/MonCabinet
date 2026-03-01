/**
 * Dashboard Admin — Amendements JORT
 *
 * Affiche l'état du suivi des modifications législatives :
 * - Statistiques globales
 * - Couverture par code
 * - Liste des amendements détectés
 * - Outils de déclenchement batch
 */

import type { Metadata } from 'next'
import { AmendmentsDashboardClient } from './page-client'

export const metadata: Metadata = {
  title: 'Amendements JORT — Qadhya Admin',
  description: 'Suivi des modifications législatives publiées au Journal Officiel',
}

export default function AmendmentsPage() {
  return <AmendmentsDashboardClient />
}
