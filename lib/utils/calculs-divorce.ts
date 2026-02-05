/**
 * Utilitaires de calculs pour divorces tunisiens (Code Statut Personnel)
 */

/**
 * Types de divorce selon CSP Article 31
 */
export enum TypeDivorce {
  CONSENTEMENT_MUTUEL = 'consentement_mutuel',
  PREJUDICE = 'prejudice', // Darar
  UNILATERAL_EPOUX = 'unilateral_epoux',
  UNILATERAL_EPOUSE = 'unilateral_epouse', // Khol'
}

/**
 * Garde des enfants
 */
export enum GardeEnfants {
  MERE = 'mere',
  PERE = 'pere',
  PARTAGEE = 'partagee',
}

/**
 * Calculer la durée du mariage en années
 */
export function calculerDureeMariage(dateMariage: Date, dateCalcul: Date = new Date()): number {
  const diff = dateCalcul.getTime() - dateMariage.getTime()
  const annees = diff / (1000 * 60 * 60 * 24 * 365.25)
  return Math.floor(annees * 10) / 10 // Arrondi 1 décimale
}

/**
 * Calculer pension compensatoire (Moutaa) selon formule tunisienne
 *
 * Formule CSP: 1 an de mariage = 2 mois de revenus de l'époux
 *
 * @param dureeMariageAnnees Durée mariage en années
 * @param revenusEpoux Revenus mensuels époux en TND
 * @param coefficient Coefficient multiplicateur (défaut: 2)
 * @returns Montant Moutaa en TND
 */
export function calculerPensionCompensatoire(
  dureeMariageAnnees: number,
  revenusEpoux: number,
  coefficient: number = 2
): number {
  if (dureeMariageAnnees <= 0 || revenusEpoux <= 0) return 0

  // Formule: Durée (années) × Coefficient (mois) × Revenus mensuels
  const moutaa = dureeMariageAnnees * coefficient * revenusEpoux

  return Math.round(moutaa * 100) / 100 // Arrondi 2 décimales
}

/**
 * Suggérer pension alimentaire par enfant
 *
 * Basé sur revenus père et nombre d'enfants
 * Fourchette: 20-30% revenus père ÷ nb enfants
 *
 * @param revenusPere Revenus mensuels père en TND
 * @param nbEnfants Nombre d'enfants mineurs
 * @param pourcentage Pourcentage revenus (défaut: 25%)
 * @returns Pension suggérée par enfant en TND
 */
export function suggererPensionAlimentaire(
  revenusPere: number,
  nbEnfants: number,
  pourcentage: number = 25
): {
  parEnfant: number
  total: number
  fourchetteBasse: number
  fourchetteHaute: number
} {
  if (revenusPere <= 0 || nbEnfants <= 0) {
    return { parEnfant: 0, total: 0, fourchetteBasse: 0, fourchetteHaute: 0 }
  }

  // Calcul central (25%)
  const totalCentral = (revenusPere * pourcentage) / 100
  const parEnfantCentral = totalCentral / nbEnfants

  // Fourchette (20-30%)
  const totalBas = (revenusPere * 20) / 100
  const totalHaut = (revenusPere * 30) / 100

  return {
    parEnfant: Math.round(parEnfantCentral * 100) / 100,
    total: Math.round(totalCentral * 100) / 100,
    fourchetteBasse: Math.round((totalBas / nbEnfants) * 100) / 100,
    fourchetteHaute: Math.round((totalHaut / nbEnfants) * 100) / 100,
  }
}

/**
 * Calculer âge d'un enfant
 */
export function calculerAge(dateNaissance: Date, dateCalcul: Date = new Date()): number {
  const diff = dateCalcul.getTime() - dateNaissance.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

/**
 * Vérifier si enfant est mineur (< 18 ans en Tunisie)
 */
export function estMineur(dateNaissance: Date, dateCalcul: Date = new Date()): boolean {
  return calculerAge(dateNaissance, dateCalcul) < 18
}

/**
 * Formater montant en TND
 */
export function formaterMontantTND(montant: number): string {
  return `${montant.toFixed(2)} TND`
}

/**
 * Récapitulatif calculs divorce
 */
export interface RecapitulatifDivorce {
  dureeMariageAnnees: number
  pensionCompensatoire: number
  pensionAlimentaireParEnfant: number
  pensionAlimentaireTotal: number
  nbEnfantsMineurs: number
}

/**
 * Générer récapitulatif complet divorce
 */
export function genererRecapitulatifDivorce(data: {
  dateMariage: Date
  revenusEpoux: number
  revenusPere: number
  enfants: Array<{ dateNaissance: Date }>
}): RecapitulatifDivorce {
  const dureeMariage = calculerDureeMariage(data.dateMariage)
  const pensionCompensatoire = calculerPensionCompensatoire(dureeMariage, data.revenusEpoux)

  // Compter enfants mineurs
  const enfantsMineurs = data.enfants.filter((e) => estMineur(e.dateNaissance))
  const nbEnfantsMineurs = enfantsMineurs.length

  // Pension alimentaire
  let pensionParEnfant = 0
  let pensionTotal = 0

  if (nbEnfantsMineurs > 0) {
    const pension = suggererPensionAlimentaire(data.revenusPere, nbEnfantsMineurs)
    pensionParEnfant = pension.parEnfant
    pensionTotal = pension.total
  }

  return {
    dureeMariageAnnees: dureeMariage,
    pensionCompensatoire,
    pensionAlimentaireParEnfant: pensionParEnfant,
    pensionAlimentaireTotal: pensionTotal,
    nbEnfantsMineurs,
  }
}
