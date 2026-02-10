'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export function GeneratedRules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Règles Auto-générées</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Composant en développement</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Ce composant affichera les règles de classification auto-générées basées sur les
            corrections humaines, avec leur taux de précision et actions de gestion.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Prévu pour implémentation en Sprint 4
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
