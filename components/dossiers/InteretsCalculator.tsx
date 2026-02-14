'use client'

import { useState, useEffect } from 'react'
import {
  calculerCreanceCommerciale,
  formaterMontantTND,
  type CreanceCommerciale,
} from '@/lib/utils/calculs-commerciaux'

interface InteretsCalculatorProps {
  montantPrincipal: number
  dateMiseEnDemeure: string
  tauxInteret?: number
  onChange?: (interets: number, totalDu: number) => void
}

export default function InteretsCalculator({
  montantPrincipal,
  dateMiseEnDemeure,
  tauxInteret = 14.5,
  onChange,
}: InteretsCalculatorProps) {
  const [resultat, setResultat] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!montantPrincipal || montantPrincipal <= 0 || !dateMiseEnDemeure) {
      setResultat(null)
      return
    }

    try {
      const data: CreanceCommerciale = {
        montantPrincipal,
        dateMiseEnDemeure: new Date(dateMiseEnDemeure),
        tauxInteret,
        includeIndemnite: true,
      }

      const calc = calculerCreanceCommerciale(data)
      setResultat(calc)
      setError('')

      if (onChange) {
        onChange(calc.interetsCalcules, calc.totalDu)
      }
    } catch (err: any) {
      setError(err.message)
      setResultat(null)
    }
  }, [montantPrincipal, dateMiseEnDemeure, tauxInteret, onChange])

  if (!resultat) return null

  return (
    <div className="rounded-lg border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-blue-100 p-4">
      <h4 className="mb-3 font-bold text-blue-900">💰 Calcul Intérêts Moratoires</h4>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Jours de retard:</span>
          <span className="font-semibold">{resultat.joursRetard} jours</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Taux appliqué:</span>
          <span className="font-semibold">{resultat.tauxInteret}% (TMM+7)</span>
        </div>

        <div className="flex justify-between border-t border-blue-200 pt-2">
          <span className="text-muted-foreground">Intérêts calculés:</span>
          <span className="font-bold text-blue-600">
            {formaterMontantTND(resultat.interetsCalcules)}
          </span>
        </div>

        {resultat.indemniteForfaitaire > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Indemnité forfaitaire (loi 2017):</span>
            <span className="font-semibold">
              {formaterMontantTND(resultat.indemniteForfaitaire)}
            </span>
          </div>
        )}

        <div className="flex justify-between border-t-2 border-blue-300 pt-2">
          <span className="font-bold text-blue-900">TOTAL DÛ:</span>
          <span className="text-lg font-bold text-blue-600">
            {formaterMontantTND(resultat.totalDu)}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-blue-50 p-2 text-xs text-muted-foreground">
        <strong>Formule:</strong> {montantPrincipal.toFixed(3)} × ({tauxInteret}% / 100) ×
        ({resultat.joursRetard} / 365) = {formaterMontantTND(resultat.interetsCalcules)}
      </div>

      <div className="mt-2 rounded-md bg-yellow-50 p-2 text-xs text-yellow-800">
        ⚠️ <strong>Délai appel:</strong> 10 jours seulement (vs 20j civil) - À actualiser
        régulièrement
      </div>
    </div>
  )
}
