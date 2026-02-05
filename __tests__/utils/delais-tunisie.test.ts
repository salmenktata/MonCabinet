/**
 * Tests pour les utilitaires de calcul des délais juridiques tunisiens
 *
 * Couvre:
 * - Jours fériés (fixes et variables)
 * - Week-ends
 * - Vacances judiciaires (1er août - 15 septembre)
 * - Calcul échéances (calendaires, ouvrables, francs)
 * - Urgences et rappels
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isJourFerie,
  isWeekend,
  isVacancesJudiciaires,
  isJourOuvrable,
  calculerEcheance,
  joursRestants,
  niveauUrgence,
  datesRappel,
  formatterDelai,
} from '@/lib/utils/delais-tunisie'

describe('Délais Juridiques Tunisiens', () => {
  describe('isJourFerie', () => {
    it('devrait détecter le Jour de l\'an (01-01)', () => {
      const date = new Date('2025-01-01')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Révolution et Jeunesse (14-01)', () => {
      const date = new Date('2025-01-14')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Fête de l\'indépendance (20-03)', () => {
      const date = new Date('2025-03-20')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Journée des martyrs (09-04)', () => {
      const date = new Date('2025-04-09')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Fête du travail (01-05)', () => {
      const date = new Date('2025-05-01')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Fête de la République (25-07)', () => {
      const date = new Date('2025-07-25')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter la Fête de la femme (13-08)', () => {
      const date = new Date('2025-08-13')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter Aid el-Fitr 2025 (30-31 mars)', () => {
      expect(isJourFerie(new Date('2025-03-30'))).toBe(true)
      expect(isJourFerie(new Date('2025-03-31'))).toBe(true)
    })

    it('devrait détecter Aid el-Idha 2025 (06-08 juin)', () => {
      expect(isJourFerie(new Date('2025-06-06'))).toBe(true)
      expect(isJourFerie(new Date('2025-06-07'))).toBe(true)
      expect(isJourFerie(new Date('2025-06-08'))).toBe(true)
    })

    it('devrait détecter Nouvel an hégirien 2025 (27-06)', () => {
      const date = new Date('2025-06-27')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter Mouled 2025 (05-09)', () => {
      const date = new Date('2025-09-05')
      expect(isJourFerie(date)).toBe(true)
    })

    it('devrait détecter Aid el-Fitr 2026 (20-21 mars)', () => {
      expect(isJourFerie(new Date('2026-03-20'))).toBe(true)
      expect(isJourFerie(new Date('2026-03-21'))).toBe(true)
    })

    it('devrait détecter Aid el-Idha 2026 (27-29 mai)', () => {
      expect(isJourFerie(new Date('2026-05-27'))).toBe(true)
      expect(isJourFerie(new Date('2026-05-28'))).toBe(true)
      expect(isJourFerie(new Date('2026-05-29'))).toBe(true)
    })

    it('devrait retourner false pour un jour normal', () => {
      const date = new Date('2025-02-05') // Mercredi normal
      expect(isJourFerie(date)).toBe(false)
    })

    it('devrait gérer les années sans jours fériés variables', () => {
      const date = new Date('2027-04-15') // Année non configurée
      // Devrait quand même détecter les fériés fixes
      const jourTravail = new Date('2027-05-01')
      expect(isJourFerie(jourTravail)).toBe(true)
    })
  })

  describe('isWeekend', () => {
    it('devrait détecter un samedi', () => {
      const samedi = new Date('2025-02-01') // Samedi
      expect(isWeekend(samedi)).toBe(true)
    })

    it('devrait détecter un dimanche', () => {
      const dimanche = new Date('2025-02-02') // Dimanche
      expect(isWeekend(dimanche)).toBe(true)
    })

    it('devrait retourner false pour un jour de semaine', () => {
      const lundi = new Date('2025-02-03') // Lundi
      expect(isWeekend(lundi)).toBe(false)
    })

    it('devrait retourner false pour un mercredi', () => {
      const mercredi = new Date('2025-02-05') // Mercredi
      expect(isWeekend(mercredi)).toBe(false)
    })
  })

  describe('isVacancesJudiciaires', () => {
    it('devrait détecter le 1er août (début vacances)', () => {
      const date = new Date('2025-08-01')
      expect(isVacancesJudiciaires(date)).toBe(true)
    })

    it('devrait détecter le 15 août (milieu vacances)', () => {
      const date = new Date('2025-08-15')
      expect(isVacancesJudiciaires(date)).toBe(true)
    })

    it('devrait détecter le 31 août (fin août)', () => {
      const date = new Date('2025-08-31')
      expect(isVacancesJudiciaires(date)).toBe(true)
    })

    it('devrait détecter le 1er septembre', () => {
      const date = new Date('2025-09-01')
      expect(isVacancesJudiciaires(date)).toBe(true)
    })

    it('devrait détecter le 15 septembre (fin vacances)', () => {
      const date = new Date('2025-09-15')
      expect(isVacancesJudiciaires(date)).toBe(true)
    })

    it('devrait retourner false le 16 septembre (après vacances)', () => {
      const date = new Date('2025-09-16')
      expect(isVacancesJudiciaires(date)).toBe(false)
    })

    it('devrait retourner false le 31 juillet (avant vacances)', () => {
      const date = new Date('2025-07-31')
      expect(isVacancesJudiciaires(date)).toBe(false)
    })

    it('devrait retourner false en février', () => {
      const date = new Date('2025-02-15')
      expect(isVacancesJudiciaires(date)).toBe(false)
    })
  })

  describe('isJourOuvrable', () => {
    it('devrait retourner true pour un lundi normal', () => {
      const lundi = new Date('2025-02-03') // Lundi
      expect(isJourOuvrable(lundi)).toBe(true)
    })

    it('devrait retourner false pour un samedi', () => {
      const samedi = new Date('2025-02-01')
      expect(isJourOuvrable(samedi)).toBe(false)
    })

    it('devrait retourner false pour un dimanche', () => {
      const dimanche = new Date('2025-02-02')
      expect(isJourOuvrable(dimanche)).toBe(false)
    })

    it('devrait retourner false pour un jour férié', () => {
      const jourAn = new Date('2025-01-01')
      expect(isJourOuvrable(jourAn)).toBe(false)
    })

    it('devrait retourner false pendant vacances judiciaires (par défaut)', () => {
      const vacances = new Date('2025-08-15')
      expect(isJourOuvrable(vacances)).toBe(false)
    })

    it('devrait retourner true pendant vacances judiciaires si exclureVacancesJudiciaires=false', () => {
      // Le 15 août 2025 est un vendredi pendant les vacances judiciaires (mais pas férié)
      const vacances = new Date('2025-08-15')
      expect(isJourOuvrable(vacances, true)).toBe(false) // Exclu car vacances judiciaires
      expect(isJourOuvrable(vacances, false)).toBe(true) // Ouvrable si on ignore vacances (vendredi normal)

      // Tester avec un jour non férié en août
      const deuxAout = new Date('2025-08-02') // Samedi
      expect(isJourOuvrable(deuxAout, false)).toBe(false) // Weekend

      // Lundi 4 août
      const quatreAout = new Date('2025-08-04')
      expect(isJourOuvrable(quatreAout, false)).toBe(true) // Ouvrable si on ignore vacances judiciaires
    })
  })

  describe('calculerEcheance', () => {
    describe('jours_calendaires', () => {
      it('devrait ajouter 10 jours calendaires simples', () => {
        const depart = new Date('2025-02-05') // Mercredi
        const echeance = calculerEcheance(depart, 10, 'jours_calendaires')

        // 10 jours = 15 février, mais c'est un samedi, donc reporter au lundi 17
        expect(echeance.getDate()).toBe(17)
        expect(echeance.getMonth()).toBe(1) // Février (0-indexed)
      })

      it('devrait gérer un délai tombant sur un weekend', () => {
        const depart = new Date('2025-02-03') // Lundi
        const echeance = calculerEcheance(depart, 5, 'jours_calendaires')

        // 5 jours = samedi 8 février, reporter au lundi 10
        expect(echeance.getDate()).toBe(10)
        expect(echeance.getMonth()).toBe(1)
      })
    })

    describe('jours_ouvrables', () => {
      it('devrait ajouter 5 jours ouvrables (1 semaine)', () => {
        const depart = new Date('2025-02-03') // Lundi
        const echeance = calculerEcheance(depart, 5, 'jours_ouvrables')

        // Lun, Mar, Mer, Jeu, Ven = 5 jours ouvrables
        // Échéance = Lundi 10 février (après weekend)
        expect(echeance.getDate()).toBe(10)
        expect(echeance.getMonth()).toBe(1)
      })

      it('devrait exclure les weekends', () => {
        const depart = new Date('2025-02-07') // Vendredi
        const echeance = calculerEcheance(depart, 3, 'jours_ouvrables')

        // Ven → Lun, Mar, Mer = 3 jours ouvrables
        // Échéance = Mercredi 12 février
        expect(echeance.getDate()).toBe(12)
        expect(echeance.getMonth()).toBe(1)
      })

      it('devrait exclure les jours fériés', () => {
        const depart = new Date('2025-04-07') // Lundi avant journée martyrs (09-04)
        const echeance = calculerEcheance(depart, 3, 'jours_ouvrables')

        // Lun 7 → Mar 8, (Mer 9 férié skip), Jeu 10, Ven 11 = 3 jours ouvrables
        expect(echeance.getDate()).toBe(11)
        expect(echeance.getMonth()).toBe(3) // Avril
      })

      it('devrait exclure les vacances judiciaires par défaut', () => {
        const depart = new Date('2025-07-31') // Jeudi avant vacances
        const echeance = calculerEcheance(depart, 5, 'jours_ouvrables')

        // Tout août est exclu, donc reprendre en septembre
        // Ven 1 août (skip), ... tout août exclu, lun 15 sept (dernier jour vacances skip)
        // Reprendre mar 16 sept
        expect(echeance.getMonth()).toBe(8) // Septembre
        expect(echeance.getDate()).toBeGreaterThanOrEqual(16)
      })

      it('ne devrait pas exclure vacances judiciaires si exclureVacancesJudiciaires=false', () => {
        const depart = new Date('2025-08-04') // Lundi début août
        const echeance = calculerEcheance(depart, 5, 'jours_ouvrables', false)

        // Lun 4, Mar 5, Mer 6, Jeu 7, Ven 8 août (mais 13 août férié)
        expect(echeance.getMonth()).toBe(7) // Août
        expect(echeance.getDate()).toBeGreaterThanOrEqual(8)
        expect(echeance.getDate()).toBeLessThanOrEqual(15)
      })
    })

    describe('jours_francs', () => {
      it('devrait exclure le jour de départ', () => {
        const depart = new Date('2025-02-03') // Lundi
        const echeance = calculerEcheance(depart, 5, 'jours_francs')

        // Délai commence mardi 4 (exclut lundi)
        // Mar 4, Mer 5, Jeu 6, Ven 7, Lun 10 = 5 jours francs
        // Échéance expire fin lundi 10, donc mardi 11
        expect(echeance.getDate()).toBe(11)
        expect(echeance.getMonth()).toBe(1)
      })

      it('devrait gérer les weekends en jours francs', () => {
        const depart = new Date('2025-02-06') // Jeudi
        const echeance = calculerEcheance(depart, 3, 'jours_francs')

        // Délai commence ven 7, lun 10, mar 11 = 3 jours francs
        // Échéance expire fin mar 11, donc mer 12
        expect(echeance.getDate()).toBe(12)
        expect(echeance.getMonth()).toBe(1)
      })
    })

    it('devrait gérer un délai de 0 jours', () => {
      const depart = new Date('2025-02-05') // Mercredi
      const echeance = calculerEcheance(depart, 0, 'jours_calendaires')

      // 0 jours = même jour si ouvrable
      expect(echeance.getDate()).toBe(5)
      expect(echeance.getMonth()).toBe(1)
    })
  })

  describe('joursRestants', () => {
    beforeEach(() => {
      // Mock date du jour = 5 février 2025
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-02-05T10:30:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('devrait retourner jours positifs pour échéance future', () => {
      const echeance = new Date('2025-02-15') // Dans 10 jours
      expect(joursRestants(echeance)).toBe(10)
    })

    it('devrait retourner 0 pour échéance aujourd\'hui', () => {
      const echeance = new Date('2025-02-05')
      expect(joursRestants(echeance)).toBe(0)
    })

    it('devrait retourner jours négatifs pour échéance passée', () => {
      const echeance = new Date('2025-01-30') // Il y a 6 jours
      expect(joursRestants(echeance)).toBe(-6)
    })

    it('devrait retourner 1 pour échéance demain', () => {
      const echeance = new Date('2025-02-06')
      expect(joursRestants(echeance)).toBe(1)
    })

    it('devrait retourner -1 pour échéance hier', () => {
      const echeance = new Date('2025-02-04')
      expect(joursRestants(echeance)).toBe(-1)
    })
  })

  describe('niveauUrgence', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-02-05T10:30:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('devrait retourner "depasse" pour échéance passée', () => {
      const echeance = new Date('2025-02-03')
      expect(niveauUrgence(echeance)).toBe('depasse')
    })

    it('devrait retourner "critique" pour échéance aujourd\'hui', () => {
      const echeance = new Date('2025-02-05')
      expect(niveauUrgence(echeance)).toBe('critique')
    })

    it('devrait retourner "critique" pour échéance dans 1 jour', () => {
      const echeance = new Date('2025-02-06')
      expect(niveauUrgence(echeance)).toBe('critique')
    })

    it('devrait retourner "critique" pour échéance dans 3 jours', () => {
      const echeance = new Date('2025-02-08')
      expect(niveauUrgence(echeance)).toBe('critique')
    })

    it('devrait retourner "urgent" pour échéance dans 5 jours', () => {
      const echeance = new Date('2025-02-10')
      expect(niveauUrgence(echeance)).toBe('urgent')
    })

    it('devrait retourner "urgent" pour échéance dans 7 jours', () => {
      const echeance = new Date('2025-02-12')
      expect(niveauUrgence(echeance)).toBe('urgent')
    })

    it('devrait retourner "proche" pour échéance dans 10 jours', () => {
      const echeance = new Date('2025-02-15')
      expect(niveauUrgence(echeance)).toBe('proche')
    })

    it('devrait retourner "proche" pour échéance dans 15 jours', () => {
      const echeance = new Date('2025-02-20')
      expect(niveauUrgence(echeance)).toBe('proche')
    })

    it('devrait retourner "normal" pour échéance dans 20 jours', () => {
      const echeance = new Date('2025-02-25')
      expect(niveauUrgence(echeance)).toBe('normal')
    })

    it('devrait retourner "normal" pour échéance dans 30 jours', () => {
      const echeance = new Date('2025-03-07')
      expect(niveauUrgence(echeance)).toBe('normal')
    })
  })

  describe('datesRappel', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-02-05T10:30:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('devrait retourner toutes les dates de rappel pour échéance lointaine', () => {
      const echeance = new Date('2025-03-05') // Dans 28 jours
      const rappels = datesRappel(echeance)

      expect(rappels.j15).not.toBeNull()
      expect(rappels.j7).not.toBeNull()
      expect(rappels.j3).not.toBeNull()
      expect(rappels.j1).not.toBeNull()

      // Vérifier les dates
      expect(rappels.j15?.getDate()).toBe(18) // 18 février
      expect(rappels.j7?.getDate()).toBe(26) // 26 février
      expect(rappels.j3?.getDate()).toBe(2) // 2 mars
      expect(rappels.j1?.getDate()).toBe(4) // 4 mars
    })

    it('devrait retourner null pour rappels déjà passés', () => {
      const echeance = new Date('2025-02-10') // Dans 5 jours
      const rappels = datesRappel(echeance)

      // J-15 et J-7 sont passés
      expect(rappels.j15).toBeNull()
      expect(rappels.j7).toBeNull()

      // J-3 et J-1 sont futurs
      expect(rappels.j3).not.toBeNull()
      expect(rappels.j1).not.toBeNull()
    })

    it('devrait retourner null pour rappels passés si échéance proche', () => {
      const echeance = new Date('2025-02-06') // Demain
      const rappels = datesRappel(echeance)

      expect(rappels.j15).toBeNull() // 22 janvier (passé)
      expect(rappels.j7).toBeNull() // 30 janvier (passé)
      expect(rappels.j3).toBeNull() // 3 février (passé)
      // J-1 = 5 février (aujourd'hui), pas null mais égal à aujourd'hui
      expect(rappels.j1).not.toBeNull()
      if (rappels.j1) {
        expect(rappels.j1.getDate()).toBe(5)
      }
    })

    it('devrait gérer une échéance dans 10 jours', () => {
      const echeance = new Date('2025-02-15')
      const rappels = datesRappel(echeance)

      expect(rappels.j15).toBeNull() // 31 janvier (passé)
      expect(rappels.j7).not.toBeNull() // 8 février (futur)
      expect(rappels.j3).not.toBeNull() // 12 février (futur)
      expect(rappels.j1).not.toBeNull() // 14 février (futur)
    })
  })

  describe('formatterDelai', () => {
    it('devrait formater "Aujourd\'hui" pour 0 jours', () => {
      expect(formatterDelai(0)).toBe("Aujourd'hui")
    })

    it('devrait formater "1 jour" pour 1 jour', () => {
      expect(formatterDelai(1)).toBe('1 jour')
    })

    it('devrait formater "X jours" pour plusieurs jours', () => {
      expect(formatterDelai(5)).toBe('5 jours')
      expect(formatterDelai(15)).toBe('15 jours')
      expect(formatterDelai(30)).toBe('30 jours')
    })

    it('devrait formater "Dépassé de 1 jour" pour -1', () => {
      expect(formatterDelai(-1)).toBe('Dépassé de 1 jour')
    })

    it('devrait formater "Dépassé de X jours" pour retards', () => {
      expect(formatterDelai(-5)).toBe('Dépassé de 5 jours')
      expect(formatterDelai(-15)).toBe('Dépassé de 15 jours')
      expect(formatterDelai(-30)).toBe('Dépassé de 30 jours')
    })

    it('devrait gérer de grands nombres', () => {
      expect(formatterDelai(365)).toBe('365 jours')
      expect(formatterDelai(-365)).toBe('Dépassé de 365 jours')
    })
  })

  describe('Edge Cases', () => {
    it('devrait gérer le changement de mois', () => {
      const depart = new Date('2025-01-28') // Mardi
      const echeance = calculerEcheance(depart, 10, 'jours_calendaires')

      // 10 jours = 7 février
      expect(echeance.getMonth()).toBe(1) // Février
      expect(echeance.getDate()).toBeGreaterThanOrEqual(7)
    })

    it('devrait gérer le changement d\'année', () => {
      const depart = new Date('2025-12-25') // Jeudi
      const echeance = calculerEcheance(depart, 10, 'jours_calendaires')

      // 10 jours = 4 janvier 2026
      expect(echeance.getFullYear()).toBe(2026)
      expect(echeance.getMonth()).toBe(0) // Janvier
    })

    it('devrait gérer année bissextile (2024)', () => {
      const depart = new Date('2024-02-27') // Mardi
      const echeance = calculerEcheance(depart, 5, 'jours_calendaires')

      // 2024 est bissextile, 29 février existe
      // 27 + 5 = 3 mars, mais c'est dimanche, donc lundi 4
      expect(echeance.getMonth()).toBe(2) // Mars
      expect(echeance.getDate()).toBeGreaterThanOrEqual(4)
    })

    it('devrait gérer année non bissextile (2025)', () => {
      const depart = new Date('2025-02-27') // Jeudi
      const echeance = calculerEcheance(depart, 3, 'jours_calendaires')

      // 27 + 3 = 2 mars (29 février n'existe pas en 2025)
      expect(echeance.getMonth()).toBe(2) // Mars
      expect(echeance.getDate()).toBeGreaterThanOrEqual(2)
    })

    it('devrait gérer cumul weekend + férié', () => {
      const depart = new Date('2025-04-25') // Vendredi avant 1er mai
      const echeance = calculerEcheance(depart, 5, 'jours_ouvrables')

      // Ven 25 → Lun 28, Mar 29, Mer 30, (Jeu 1er mai férié skip), Ven 2, Lun 5
      expect(echeance.getMonth()).toBe(4) // Mai
      expect(echeance.getDate()).toBeGreaterThanOrEqual(5)
    })

    it('devrait gérer cumul vacances judiciaires + jours fériés', () => {
      // 13 août = Fête de la femme + vacances judiciaires
      const date = new Date('2025-08-13')

      expect(isJourFerie(date)).toBe(true)
      expect(isVacancesJudiciaires(date)).toBe(true)
      expect(isJourOuvrable(date)).toBe(false)
      expect(isJourOuvrable(date, false)).toBe(false) // Même sans vacances, c'est férié
    })
  })
})
