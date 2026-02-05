'use client'

import { useState, useEffect } from 'react'
import { UseFormRegister, UseFormWatch, FieldErrors, UseFormSetValue } from 'react-hook-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Plus, Trash2, AlertCircle, Calculator, Users } from 'lucide-react'
import {
  TypeDivorce,
  GardeEnfants,
  calculerDureeMariage,
  calculerPensionCompensatoire,
  suggererPensionAlimentaire,
  calculerAge,
  estMineur,
  formaterMontantTND,
} from '@/lib/utils/calculs-divorce'

interface Enfant {
  id: string
  prenom: string
  date_naissance: string
  sexe: 'M' | 'F'
  age?: number
  est_mineur?: boolean
}

interface DossierDivorceFormProps {
  register: UseFormRegister<any>
  watch: UseFormWatch<any>
  errors: FieldErrors
  setValue: UseFormSetValue<any>
}

export default function DossierDivorceForm({
  register,
  watch,
  errors,
  setValue,
}: DossierDivorceFormProps) {
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [pensionSuggestion, setPensionSuggestion] = useState<any>(null)
  const [moutaaCalculee, setMoutaaCalculee] = useState<number>(0)
  const [dureeMariageCalculee, setDureeMariageCalculee] = useState<number>(0)

  // Watch form values
  const typeDivorce = watch('type_divorce')
  const dateMariage = watch('date_mariage')
  const revenusEpoux = watch('revenus_epoux')
  const revenusPere = watch('revenus_pere')
  const coefficientMoutaa = watch('coefficient_moutaa') || 2

  // Descriptions des types de divorce
  const typesDivorceInfo: Record<string, { label: string; description: string; article: string }> = {
    [TypeDivorce.CONSENTEMENT_MUTUEL]: {
      label: 'Consentement mutuel',
      description: 'Accord des deux époux sur le principe et les conséquences du divorce',
      article: 'CSP Article 31',
    },
    [TypeDivorce.PREJUDICE]: {
      label: 'Préjudice (Darar)',
      description: 'Divorce pour préjudice subi par l\'un des époux',
      article: 'CSP Article 31',
    },
    [TypeDivorce.UNILATERAL_EPOUX]: {
      label: 'Unilatéral époux',
      description: 'Volonté unilatérale du mari (talaq)',
      article: 'CSP Article 31',
    },
    [TypeDivorce.UNILATERAL_EPOUSE]: {
      label: 'Unilatéral épouse (Khol\')',
      description: 'Rachat par l\'épouse moyennant contrepartie',
      article: 'CSP Article 31',
    },
  }

  // Calculer durée mariage et Moutaa
  useEffect(() => {
    if (dateMariage && revenusEpoux && revenusEpoux > 0) {
      try {
        const duree = calculerDureeMariage(new Date(dateMariage))
        setDureeMariageCalculee(duree)
        setValue('duree_mariage_annees', duree)

        const moutaa = calculerPensionCompensatoire(duree, parseFloat(revenusEpoux), coefficientMoutaa)
        setMoutaaCalculee(moutaa)
        setValue('pension_compensatoire_moutaa', moutaa)
      } catch (error) {
        console.error('Erreur calcul Moutaa:', error)
      }
    }
  }, [dateMariage, revenusEpoux, coefficientMoutaa, setValue])

  // Suggérer pension alimentaire
  useEffect(() => {
    if (revenusPere && revenusPere > 0 && enfants.length > 0) {
      const enfantsMineurs = enfants.filter((e) => e.est_mineur).length
      if (enfantsMineurs > 0) {
        const suggestion = suggererPensionAlimentaire(parseFloat(revenusPere), enfantsMineurs)
        setPensionSuggestion(suggestion)
        setValue('pension_alimentaire_par_enfant', suggestion.parEnfant)
        setValue('pension_alimentaire_total', suggestion.total)
      }
    }
  }, [revenusPere, enfants, setValue])

  // Ajouter un enfant
  const ajouterEnfant = () => {
    const nouvelEnfant: Enfant = {
      id: `enfant-${Date.now()}`,
      prenom: '',
      date_naissance: '',
      sexe: 'M',
    }
    setEnfants([...enfants, nouvelEnfant])
  }

  // Supprimer un enfant
  const supprimerEnfant = (id: string) => {
    setEnfants(enfants.filter((e) => e.id !== id))
  }

  // Mettre à jour un enfant
  const mettreAJourEnfant = (id: string, champ: keyof Enfant, valeur: any) => {
    setEnfants(
      enfants.map((e) => {
        if (e.id === id) {
          const enfantModifie = { ...e, [champ]: valeur }

          // Calculer âge et statut mineur si date de naissance
          if (champ === 'date_naissance' && valeur) {
            try {
              const dateNaissance = new Date(valeur)
              enfantModifie.age = calculerAge(dateNaissance)
              enfantModifie.est_mineur = estMineur(dateNaissance)
            } catch (error) {
              console.error('Erreur calcul âge:', error)
            }
          }

          return enfantModifie
        }
        return e
      })
    )
  }

  const nbEnfantsMineurs = enfants.filter((e) => e.est_mineur).length

  return (
    <div className="space-y-6">
      {/* Alerte procédure CSP */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Procédure divorce Code Statut Personnel :</strong>
          <ul className="mt-2 space-y-1 text-sm">
            <li>• 3 tentatives de conciliation OBLIGATOIRES</li>
            <li>• Délai de réflexion minimum : 2 mois</li>
            <li>• Transcription sur acte de mariage OBLIGATOIRE</li>
            <li>• Expertise sociale si enfants mineurs</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Type de divorce */}
      <Card>
        <CardHeader>
          <CardTitle>Type de divorce</CardTitle>
          <CardDescription>Sélectionnez le type de divorce selon le CSP Article 31</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type_divorce">Type de divorce *</Label>
            <Select
              value={typeDivorce}
              onValueChange={(value) => setValue('type_divorce', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le type de divorce..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typesDivorceInfo).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <div className="font-medium">{info.label}</div>
                      <div className="text-xs text-muted-foreground">{info.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type_divorce && (
              <p className="text-sm text-destructive">{errors.type_divorce.message?.toString()}</p>
            )}
          </div>

          {typeDivorce && typesDivorceInfo[typeDivorce] && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <Badge variant="secondary">{typesDivorceInfo[typeDivorce].article}</Badge>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{typesDivorceInfo[typeDivorce].label}</p>
                  <p className="text-muted-foreground">{typesDivorceInfo[typeDivorce].description}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations mariage */}
      <Card>
        <CardHeader>
          <CardTitle>Informations du mariage</CardTitle>
          <CardDescription>Détails de l'acte de mariage et régime matrimonial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date_mariage">Date du mariage *</Label>
              <Input
                id="date_mariage"
                type="date"
                {...register('date_mariage')}
              />
              {errors.date_mariage && (
                <p className="text-sm text-destructive">{errors.date_mariage.message?.toString()}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lieu_mariage">Lieu du mariage</Label>
              <Input
                id="lieu_mariage"
                {...register('lieu_mariage')}
                placeholder="Tunis, Ariana, Sfax..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acte_mariage_numero">Numéro acte de mariage</Label>
              <Input
                id="acte_mariage_numero"
                {...register('acte_mariage_numero')}
                placeholder="Ex: 123/2015"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acte_mariage_date">Date acte de mariage</Label>
              <Input
                id="acte_mariage_date"
                type="date"
                {...register('acte_mariage_date')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="regime_matrimonial">Régime matrimonial</Label>
            <Select
              value={watch('regime_matrimonial')}
              onValueChange={(value) => setValue('regime_matrimonial', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le régime..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="communaute">Communauté de biens</SelectItem>
                <SelectItem value="separation">Séparation de biens</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dureeMariageCalculee > 0 && (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 p-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium">
                  Durée du mariage : {dureeMariageCalculee.toFixed(1)} ans
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenus et pensions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Revenus et pensions
          </CardTitle>
          <CardDescription>
            Calcul automatique pension compensatoire (Moutaa) et pension alimentaire
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Revenus */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="revenus_epoux">Revenus époux (TND/mois)</Label>
              <Input
                id="revenus_epoux"
                type="number"
                step="0.001"
                {...register('revenus_epoux')}
                placeholder="1500.000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenus_epouse">Revenus épouse (TND/mois)</Label>
              <Input
                id="revenus_epouse"
                type="number"
                step="0.001"
                {...register('revenus_epouse')}
                placeholder="1000.000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenus_pere">Revenus père (TND/mois)</Label>
              <Input
                id="revenus_pere"
                type="number"
                step="0.001"
                {...register('revenus_pere')}
                placeholder="Pour calcul pension enfants"
              />
            </div>
          </div>

          {/* Pension compensatoire (Moutaa) */}
          {moutaaCalculee > 0 && (
            <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
              <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-3">
                Pension compensatoire (Moutaa)
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Formule CSP :</span>
                  <span className="font-mono">
                    {dureeMariageCalculee.toFixed(1)} ans × {coefficientMoutaa} × {revenusEpoux} TND
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-semibold">Montant Moutaa :</span>
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    {formaterMontantTND(moutaaCalculee)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Formule : 1 an de mariage = 2 mois de revenus de l'époux (coefficient modifiable)
              </p>
            </div>
          )}

          {/* Pension alimentaire enfants */}
          {pensionSuggestion && nbEnfantsMineurs > 0 && (
            <div className="rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
              <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
                Pension alimentaire (suggérée)
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenus père :</span>
                  <span className="font-mono">{formaterMontantTND(parseFloat(revenusPere))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enfants mineurs :</span>
                  <span>{nbEnfantsMineurs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base calcul :</span>
                  <span>25% des revenus</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-semibold">Par enfant :</span>
                  <span className="text-lg font-bold text-green-700 dark:text-green-300">
                    {formaterMontantTND(pensionSuggestion.parEnfant)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total :</span>
                  <span className="text-xl font-bold text-green-700 dark:text-green-300">
                    {formaterMontantTND(pensionSuggestion.total)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>Fourchette basse (20%) : {formaterMontantTND(pensionSuggestion.fourchetteBasse)}</span>
                <span>Fourchette haute (30%) : {formaterMontantTND(pensionSuggestion.fourchetteHaute)}</span>
              </div>
            </div>
          )}

          {/* Garde des enfants */}
          <div className="space-y-2">
            <Label htmlFor="garde_enfants">Garde des enfants</Label>
            <Select
              value={watch('garde_enfants')}
              onValueChange={(value) => setValue('garde_enfants', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le gardien..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GardeEnfants.MERE}>Mère</SelectItem>
                <SelectItem value={GardeEnfants.PERE}>Père</SelectItem>
                <SelectItem value={GardeEnfants.PARTAGEE}>Garde partagée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="droit_visite">Modalités droit de visite</Label>
            <Textarea
              id="droit_visite"
              {...register('droit_visite')}
              placeholder="Ex: Un week-end sur deux, la moitié des vacances scolaires..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Enfants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Enfants ({enfants.length})
          </CardTitle>
          <CardDescription>
            Liste des enfants concernés par le divorce
            {nbEnfantsMineurs > 0 && (
              <Badge variant="secondary" className="ml-2">
                {nbEnfantsMineurs} mineur(s)
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enfants.map((enfant, index) => (
            <div key={enfant.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Enfant {index + 1}</h4>
                <div className="flex items-center gap-2">
                  {enfant.est_mineur !== undefined && (
                    <Badge variant={enfant.est_mineur ? 'default' : 'secondary'}>
                      {enfant.age} ans {enfant.est_mineur ? '(mineur)' : '(majeur)'}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => supprimerEnfant(enfant.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Prénom *</Label>
                  <Input
                    value={enfant.prenom}
                    onChange={(e) => mettreAJourEnfant(enfant.id, 'prenom', e.target.value)}
                    placeholder="Prénom de l'enfant"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date de naissance *</Label>
                  <Input
                    type="date"
                    value={enfant.date_naissance}
                    onChange={(e) => mettreAJourEnfant(enfant.id, 'date_naissance', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sexe</Label>
                  <Select
                    value={enfant.sexe}
                    onValueChange={(value) => mettreAJourEnfant(enfant.id, 'sexe', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculin</SelectItem>
                      <SelectItem value="F">Féminin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={ajouterEnfant}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un enfant
          </Button>
        </CardContent>
      </Card>

      {/* Conciliation et délais */}
      <Card>
        <CardHeader>
          <CardTitle>Procédure de conciliation</CardTitle>
          <CardDescription>3 tentatives obligatoires selon le CSP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tentative_conciliation_1">1ère tentative</Label>
              <Input
                id="tentative_conciliation_1"
                type="date"
                {...register('tentative_conciliation_1')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tentative_conciliation_2">2ème tentative</Label>
              <Input
                id="tentative_conciliation_2"
                type="date"
                {...register('tentative_conciliation_2')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tentative_conciliation_3">3ème tentative</Label>
              <Input
                id="tentative_conciliation_3"
                type="date"
                {...register('tentative_conciliation_3')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="echec_conciliation_date">Date échec conciliation (PV)</Label>
            <Input
              id="echec_conciliation_date"
              type="date"
              {...register('echec_conciliation_date')}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delai_reflexion_debut">Début délai réflexion (2 mois min.)</Label>
              <Input
                id="delai_reflexion_debut"
                type="date"
                {...register('delai_reflexion_debut')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delai_reflexion_fin">Fin délai réflexion</Label>
              <Input
                id="delai_reflexion_fin"
                type="date"
                {...register('delai_reflexion_fin')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_transcription">Date transcription sur acte mariage</Label>
            <Input
              id="date_transcription"
              type="date"
              {...register('date_transcription')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Biens communs */}
      <Card>
        <CardHeader>
          <CardTitle>Biens communs</CardTitle>
          <CardDescription>Partage des biens matrimoniaux</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="biens_communs">Liste des biens communs</Label>
            <Textarea
              id="biens_communs"
              {...register('biens_communs')}
              placeholder="Ex: Appartement Tunis, véhicule, meubles, comptes bancaires..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valeur_biens_communs">Valeur totale estimée (TND)</Label>
            <Input
              id="valeur_biens_communs"
              type="number"
              step="0.001"
              {...register('valeur_biens_communs')}
              placeholder="150000.000"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stockage des enfants en JSON dans un champ caché */}
      <input
        type="hidden"
        {...register('enfants_json')}
        value={JSON.stringify(enfants)}
      />
    </div>
  )
}
