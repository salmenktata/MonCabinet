'use client'

import InteretsCalculator from './InteretsCalculator'
import { TYPE_LITIGE_LABELS, TypeLitigeCommercial } from '@/lib/utils/calculs-commerciaux'

interface DossierCommercialFormProps {
  register: any
  watch: any
  errors: any
  setValue: any
}

export default function DossierCommercialForm({
  register,
  watch,
  errors,
  setValue,
}: DossierCommercialFormProps) {
  const typeLitige = watch('type_litige_commercial')
  const montantPrincipal = watch('montant_principal') || 0
  const dateMiseEnDemeure = watch('date_mise_en_demeure')
  const tauxInteret = watch('taux_interet') || 14.5

  const handleInteretsChange = (interets: number, totalDu: number) => {
    setValue('interets_calcules', interets)
  }

  return (
    <div className="space-y-6">
      {/* Alert délai appel */}
      <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
        <h3 className="font-bold text-red-900">⚠️ ATTENTION: Procédure Commerciale</h3>
        <p className="mt-1 text-sm text-red-800">
          Délai d&apos;appel RÉDUIT: <strong>10 jours seulement</strong> (au lieu de 20
          jours en civil)
        </p>
      </div>

      {/* Type de litige */}
      <div>
        <label className="block text-sm font-medium">
          Type de litige commercial <span className="text-red-500">*</span>
        </label>
        <select
          {...register('type_litige_commercial')}
          className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="">Sélectionner un type</option>
          {Object.entries(TYPE_LITIGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.type_litige_commercial && (
          <p className="mt-1 text-sm text-red-600">
            {errors.type_litige_commercial.message}
          </p>
        )}
      </div>

      {/* Registres commerce */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Registre Commerce Demandeur</label>
          <input
            {...register('registre_commerce_demandeur')}
            placeholder="B123456789"
            className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Registre Commerce Défendeur</label>
          <input
            {...register('registre_commerce_defendeur')}
            placeholder="B987654321"
            className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Section Créance */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h3 className="mb-3 font-semibold text-purple-900">💵 Créance et Intérêts</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">
              Montant principal (TND) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              {...register('montant_principal', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="Créance initiale"
            />
            {errors.montant_principal && (
              <p className="mt-1 text-sm text-red-600">{errors.montant_principal.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">
              Date mise en demeure <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              {...register('date_mise_en_demeure')}
              className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">Point départ intérêts</p>
            {errors.date_mise_en_demeure && (
              <p className="mt-1 text-sm text-red-600">
                {errors.date_mise_en_demeure.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">
              Taux intérêt (%) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('taux_interet', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="14.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">Défaut: TMM + 7 points = 14.5%</p>
          </div>

          <div>
            <label className="block text-sm font-medium">
              Indemnité forfaitaire (TND)
            </label>
            <input
              type="number"
              step="0.001"
              {...register('indemnite_forfaitaire', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="40"
            />
            <p className="mt-1 text-xs text-muted-foreground">Loi 2017: 40 TND fixe</p>
          </div>
        </div>

        {/* Calculateur */}
        {montantPrincipal > 0 && dateMiseEnDemeure && (
          <div className="mt-4">
            <InteretsCalculator
              montantPrincipal={montantPrincipal}
              dateMiseEnDemeure={dateMiseEnDemeure}
              tauxInteret={tauxInteret}
              onChange={handleInteretsChange}
            />
          </div>
        )}
      </div>

      {/* Section Chèque (conditionnel) */}
      {typeLitige === TypeLitigeCommercial.CHEQUE_SANS_PROVISION && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="mb-3 font-semibold text-yellow-900">📝 Détails Chèque</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Date du chèque</label>
              <input
                type="date"
                {...register('date_cheque')}
                className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Montant du chèque (TND)</label>
              <input
                type="number"
                step="0.001"
                {...register('montant_cheque', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Numéro du chèque</label>
              <input
                {...register('numero_cheque')}
                className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="CH12345678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Banque tirée</label>
              <input
                {...register('banque_tiree')}
                className="mt-1 block w-full rounded-md border px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Ex: STB, BNA, BIAT..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Référé */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register('est_refere')}
          className="h-4 w-4 rounded border-border text-blue-600"
        />
        <label className="text-sm font-medium">
          Procédure en référé commercial (mesures urgentes)
        </label>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <h4 className="mb-1 font-semibold text-blue-900">ℹ️ Rappels Procédure Commerciale</h4>
        <ul className="space-y-1 text-xs text-blue-800">
          <li>• Tribunal compétent: Tribunal de Commerce</li>
          <li>• Délai appel: <strong>10 jours</strong> (très court !)</li>
          <li>• Intérêts: TMM + 7 points (actualisable BCT)</li>
          <li>• Indemnité forfaitaire: 40 TND (loi 2017)</li>
          <li>• Expertise comptable fréquente si nécessaire</li>
        </ul>
      </div>
    </div>
  )
}
