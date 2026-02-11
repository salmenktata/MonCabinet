/**
 * Re-Analysis - Operations batch et historique
 * Composant minimal pour l'instant
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export function ReAnalysis() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ré-analyse Batch</CardTitle>
        <CardDescription>
          Opérations de ré-analyse en masse et historique des traitements
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3 text-muted-foreground">
        <AlertCircle className="w-5 h-5" />
        <p>
          Fonctionnalités de ré-analyse batch à implémenter.
          Pour l'instant, utilisez l'onglet "Health Dashboard".
        </p>
      </CardContent>
    </Card>
  )
}
