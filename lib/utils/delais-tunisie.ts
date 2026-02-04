/**
 * Utilitaire de calcul des délais légaux tunisiens
 * Prend en compte :
 * - Jours fériés tunisiens (fixes et variables)
 * - Vacances judiciaires (1er août - 15 septembre)
 * - Week-ends (samedi-dimanche)
 * - Types de délais (calendaires, ouvrables, francs)
 */

// Jours fériés tunisiens fixes (format MM-DD)
const JOURS_FERIES_FIXES = [
  '01-01', // Jour de l'an
  '01-14', // Révolution et Jeunesse
  '03-20', // Fête de l'indépendance
  '04-09', // Journée des martyrs
  '05-01', // Fête du travail
  '07-25', // Fête de la République
  '08-13', // Fête de la femme
]

// Jours fériés religieux variables (à mettre à jour annuellement)
// Approximations pour 2025-2026
const JOURS_FERIES_VARIABLES_2025_2026: Record<number, string[]> = {
  2025: [
    '2025-03-30', // Aid el-Fitr (1er jour)
    '2025-03-31', // Aid el-Fitr (2e jour)
    '2025-06-06', // Aid el-Idha (1er jour)
    '2025-06-07', // Aid el-Idha (2e jour)
    '2025-06-08', // Aid el-Idha (3e jour)
    '2025-06-27', // Nouvel an hégirien
    '2025-09-05', // Mouled (Mawlid)
  ],
  2026: [
    '2026-03-20', // Aid el-Fitr (1er jour)
    '2026-03-21', // Aid el-Fitr (2e jour)
    '2026-05-27', // Aid el-Idha (1er jour)
    '2026-05-28', // Aid el-Idha (2e jour)
    '2026-05-29', // Aid el-Idha (3e jour)
    '2026-06-17', // Nouvel an hégirien
    '2026-08-26', // Mouled (Mawlid)
  ],
}

/**
 * Vérifie si une date est un jour férié tunisien
 */
export function isJourFerie(date: Date): boolean {
  const year = date.getFullYear()
  const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const fullDate = date.toISOString().split('T')[0]

  // Vérifier jours fériés fixes
  if (JOURS_FERIES_FIXES.includes(monthDay)) {
    return true
  }

  // Vérifier jours fériés variables
  const feriesVariables = JOURS_FERIES_VARIABLES_2025_2026[year] || []
  return feriesVariables.includes(fullDate)
}

/**
 * Vérifie si une date est un week-end (samedi ou dimanche)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // 0 = dimanche, 6 = samedi
}

/**
 * Vérifie si une date tombe pendant les vacances judiciaires
 * Vacances judiciaires en Tunisie : 1er août - 15 septembre
 */
export function isVacancesJudiciaires(date: Date): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

  // Août complet (1-31)
  if (month === 8) {
    return true
  }

  // Septembre jusqu'au 15
  if (month === 9 && day <= 15) {
    return true
  }

  return false
}

/**
 * Vérifie si une date est un jour ouvrable (ni week-end, ni férié)
 */
export function isJourOuvrable(date: Date, exclureVacancesJudiciaires = true): boolean {
  if (isWeekend(date)) return false
  if (isJourFerie(date)) return false
  if (exclureVacancesJudiciaires && isVacancesJudiciaires(date)) return false
  return true
}

/**
 * Ajoute un nombre de jours à une date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Calcule une date d'échéance selon le type de délai
 *
 * @param dateDepart - Date de départ du calcul
 * @param nombreJours - Nombre de jours du délai
 * @param typeDelai - Type de délai (calendaires, ouvrables, francs)
 * @param exclureVacancesJudiciaires - Exclure les vacances judiciaires (défaut: true)
 * @returns Date d'échéance calculée
 */
export function calculerEcheance(
  dateDepart: Date,
  nombreJours: number,
  typeDelai: 'jours_calendaires' | 'jours_ouvrables' | 'jours_francs',
  exclureVacancesJudiciaires = true
): Date {
  let dateCalculee = new Date(dateDepart)

  switch (typeDelai) {
    case 'jours_calendaires':
      // Délai calendaire : compter tous les jours
      dateCalculee = addDays(dateDepart, nombreJours)
      break

    case 'jours_ouvrables':
      // Délai en jours ouvrables : exclure week-ends et jours fériés
      let joursComptes = 0
      let joursCourants = 0

      while (joursComptes < nombreJours) {
        joursCourants++
        const dateTest = addDays(dateDepart, joursCourants)

        if (isJourOuvrable(dateTest, exclureVacancesJudiciaires)) {
          joursComptes++
        }
      }

      dateCalculee = addDays(dateDepart, joursCourants)
      break

    case 'jours_francs':
      // Délai franc : exclure le jour de départ et le jour d'échéance
      // Le délai commence le lendemain de la date de départ
      const dateDebut = addDays(dateDepart, 1)
      let joursFrancsComptes = 0
      let joursFrancsCourants = 0

      while (joursFrancsComptes < nombreJours) {
        const dateTest = addDays(dateDebut, joursFrancsCourants)

        if (isJourOuvrable(dateTest, exclureVacancesJudiciaires)) {
          joursFrancsComptes++
        }

        joursFrancsCourants++
      }

      // Le délai expire à la fin du dernier jour franc
      // Donc on ajoute encore 1 jour
      dateCalculee = addDays(dateDebut, joursFrancsCourants)
      break

    default:
      dateCalculee = addDays(dateDepart, nombreJours)
  }

  // Si la date calculée tombe un jour non ouvrable, reporter au prochain jour ouvrable
  while (!isJourOuvrable(dateCalculee, exclureVacancesJudiciaires)) {
    dateCalculee = addDays(dateCalculee, 1)
  }

  return dateCalculee
}

/**
 * Calcule le nombre de jours restants avant une échéance
 * @returns Nombre de jours (négatif si dépassé)
 */
export function joursRestants(dateEcheance: Date): number {
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)

  const echeance = new Date(dateEcheance)
  echeance.setHours(0, 0, 0, 0)

  const diffTime = echeance.getTime() - aujourdhui.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Détermine le niveau d'urgence d'une échéance
 */
export function niveauUrgence(dateEcheance: Date): 'critique' | 'urgent' | 'proche' | 'normal' | 'depasse' {
  const jours = joursRestants(dateEcheance)

  if (jours < 0) return 'depasse'
  if (jours === 0) return 'critique'
  if (jours <= 3) return 'critique'
  if (jours <= 7) return 'urgent'
  if (jours <= 15) return 'proche'
  return 'normal'
}

/**
 * Calcule les dates de rappel suggérées
 */
export function datesRappel(dateEcheance: Date): {
  j15: Date | null
  j7: Date | null
  j3: Date | null
  j1: Date | null
} {
  const echeance = new Date(dateEcheance)
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)

  const j15 = addDays(echeance, -15)
  const j7 = addDays(echeance, -7)
  const j3 = addDays(echeance, -3)
  const j1 = addDays(echeance, -1)

  return {
    j15: j15 > aujourdhui ? j15 : null,
    j7: j7 > aujourdhui ? j7 : null,
    j3: j3 > aujourdhui ? j3 : null,
    j1: j1 > aujourdhui ? j1 : null,
  }
}

/**
 * Formatte un délai pour affichage
 */
export function formatterDelai(nombreJours: number): string {
  if (nombreJours === 0) return "Aujourd'hui"
  if (nombreJours === 1) return '1 jour'
  if (nombreJours === -1) return 'Dépassé de 1 jour'
  if (nombreJours < 0) return `Dépassé de ${Math.abs(nombreJours)} jours`
  return `${nombreJours} jours`
}
