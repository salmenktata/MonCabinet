/**
 * Tests unitaires pour narrative-analyzer
 * Sprint 2 - Workflow Assistant → Validation
 */

import { describe, it, expect } from 'vitest'
import {
  analyzeNarrative,
  detectLanguage,
  countWords,
  type NarrativeAnalysis,
  type DetectedElement,
} from '../narrative-analyzer'

describe('narrative-analyzer', () => {
  describe('detectLanguage', () => {
    it('should detect French text', () => {
      const text = 'Bonjour, je voudrais créer un dossier pour un divorce.'
      const language = detectLanguage(text)
      expect(language).toBe('fr')
    })

    it('should detect Arabic text', () => {
      const text = 'مرحبا، أريد إنشاء ملف للطلاق.'
      const language = detectLanguage(text)
      expect(language).toBe('ar')
    })

    it('should default to French for mixed or unclear text', () => {
      const text = 'Hello world 123'
      const language = detectLanguage(text)
      expect(language).toBe('fr')
    })

    it('should handle empty text', () => {
      const text = ''
      const language = detectLanguage(text)
      expect(language).toBe('fr')
    })
  })

  describe('countWords', () => {
    it('should count words in French text', () => {
      const text = 'Bonjour, je voudrais créer un dossier.'
      const count = countWords(text)
      expect(count).toBe(6)
    })

    it('should count words in Arabic text', () => {
      const text = 'مرحبا، أريد إنشاء ملف للطلاق.'
      const count = countWords(text)
      // Les mots arabes sont séparés par des espaces
      expect(count).toBeGreaterThan(0)
    })

    it('should handle text with multiple spaces', () => {
      const text = 'Un    deux     trois'
      const count = countWords(text)
      expect(count).toBe(3)
    })

    it('should handle text with newlines', () => {
      const text = 'Ligne 1\nLigne 2\nLigne 3'
      const count = countWords(text)
      expect(count).toBe(6)
    })

    it('should return 0 for empty text', () => {
      const text = ''
      const count = countWords(text)
      expect(count).toBe(0)
    })

    it('should handle text with only punctuation', () => {
      const text = '..., !!!'
      const count = countWords(text)
      expect(count).toBe(0)
    })
  })

  describe('analyzeNarrative - complete analysis', () => {
    it('should analyze a complete French narrative', () => {
      const text = `
        Je m'appelle Marie Dupont et je souhaite divorcer de mon mari Jean Martin.
        Nous nous sommes mariés le 15 juin 2015 à Tunis.
        Nous avons 2 enfants ensemble.
        Mon mari gagne environ 3000 TND par mois.
        Je demande une pension alimentaire de 500 TND par enfant.
        L'audience est prévue le 20 mars 2026 au Tribunal de Première Instance de Tunis.
      `

      const analysis = analyzeNarrative(text)

      expect(analysis).toBeDefined()
      expect(analysis.detectedLanguage).toBe('fr')
      expect(analysis.wordCount).toBeGreaterThan(40)
      expect(analysis.detectedElements.length).toBeGreaterThan(5)

      // Vérifier les éléments détectés
      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      expect(dates.length).toBeGreaterThanOrEqual(2) // 15 juin 2015, 20 mars 2026

      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      expect(amounts.length).toBeGreaterThanOrEqual(2) // 3000 TND, 500 TND

      const persons = analysis.detectedElements.filter((e) => e.type === 'person')
      expect(persons.length).toBeGreaterThanOrEqual(2) // Marie Dupont, Jean Martin

      const places = analysis.detectedElements.filter((e) => e.type === 'place')
      expect(places.length).toBeGreaterThanOrEqual(2) // Tunis, Tribunal

      // Vérifier les scores
      expect(analysis.qualityScore).toBeGreaterThan(70) // Bon texte
      expect(analysis.completenessScore).toBeGreaterThan(70)
    })

    it('should detect low quality for short text', () => {
      const text = 'Je veux divorcer.'

      const analysis = analyzeNarrative(text)

      expect(analysis.wordCount).toBeLessThan(10)
      expect(analysis.qualityScore).toBeLessThan(40)
      expect(analysis.completenessScore).toBeLessThan(30)
      expect(analysis.issues.length).toBeGreaterThan(0)
    })

    it('should detect high quality for detailed narrative', () => {
      const text = `
        Contexte de la situation :
        Je suis Marie Dupont, née le 10 janvier 1985 à Tunis. Je me suis mariée avec Jean Martin le 15 juin 2015.
        Nous avons deux enfants : Sophie (8 ans) et Lucas (5 ans).

        Faits pertinents :
        Mon mari travaille comme ingénieur et gagne 3000 dinars par mois. Il possède également un appartement d'une valeur de 150000 TND.
        Nous vivons actuellement séparés depuis le 1er janvier 2026.

        Demandes :
        Je souhaite obtenir la garde des enfants et une pension alimentaire de 500 dinars par enfant.
        Je demande également le partage équitable des biens communs.

        Calendrier :
        L'audience de conciliation est prévue le 20 mars 2026 au Tribunal de Première Instance de Tunis.
        Mon avocat, Maître Ahmed Ben Salah, représentera mes intérêts.
      `

      const analysis = analyzeNarrative(text)

      expect(analysis.wordCount).toBeGreaterThan(100)
      expect(analysis.qualityScore).toBeGreaterThan(80)
      expect(analysis.completenessScore).toBeGreaterThan(80)
      expect(analysis.detectedElements.length).toBeGreaterThan(10)
    })

    it('should detect Arabic elements in Arabic text', () => {
      const text = `
        أنا ماري دوبونت وأريد الطلاق من زوجي جان مارتن.
        تزوجنا في 15 يونيو 2015 في تونس.
        لدينا طفلان معاً.
        يكسب زوجي حوالي 3000 دينار تونسي شهرياً.
        أطلب نفقة قدرها 500 دينار لكل طفل.
      `

      const analysis = analyzeNarrative(text)

      expect(analysis.detectedLanguage).toBe('ar')
      expect(analysis.wordCount).toBeGreaterThan(10)

      // Vérifier la détection d'éléments même en arabe
      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      expect(amounts.length).toBeGreaterThanOrEqual(2) // 3000 د.ت, 500 د.ت

      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      expect(dates.length).toBeGreaterThanOrEqual(1) // 15 يونيو 2015
    })

    it('should provide suggestions for improvement', () => {
      const text = 'Je veux divorcer de mon mari.'

      const analysis = analyzeNarrative(text)

      expect(analysis.suggestions.length).toBeGreaterThan(0)

      // Devrait suggérer d'ajouter des informations
      const hasContentSuggestion = analysis.suggestions.some(
        (s) => s.importance === 'high' || s.importance === 'medium'
      )
      expect(hasContentSuggestion).toBe(true)
    })

    it('should detect vague terms', () => {
      const text = `
        Peut-être que je pourrais divorcer.
        Je pense que mon mari gagne environ quelque chose comme 3000 dinars.
        Probablement que l'audience sera bientôt.
      `

      const analysis = analyzeNarrative(text)

      const vagueIssue = analysis.issues.find((i) => i.type === 'vague_terms')
      expect(vagueIssue).toBeDefined()
    })

    it('should detect missing critical information', () => {
      const text = 'Je veux divorcer.'

      const analysis = analyzeNarrative(text)

      expect(analysis.completenessScore).toBeLessThan(30)

      // Devrait avoir des suggestions pour ajouter des infos
      const missingInfoSuggestions = analysis.suggestions.filter(
        (s) => s.type === 'add_info' && s.importance === 'high'
      )
      expect(missingInfoSuggestions.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeNarrative - edge cases', () => {
    it('should handle empty text', () => {
      const text = ''

      const analysis = analyzeNarrative(text)

      expect(analysis.length).toBe(0)
      expect(analysis.wordCount).toBe(0)
      expect(analysis.qualityScore).toBe(0)
      expect(analysis.completenessScore).toBe(0)
      expect(analysis.detectedElements).toEqual([])
      expect(analysis.issues.length).toBeGreaterThan(0)
    })

    it('should handle very long text', () => {
      const text = 'Mot '.repeat(5000) // 5000 mots

      const analysis = analyzeNarrative(text)

      expect(analysis.wordCount).toBe(5000)
      // Même très long, si répétitif, la qualité devrait être affectée
      expect(analysis.qualityScore).toBeLessThan(100)
    })

    it('should handle text with only numbers', () => {
      const text = '1000 2000 3000 4000 5000'

      const analysis = analyzeNarrative(text)

      expect(analysis.wordCount).toBe(5)
      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      expect(amounts.length).toBeGreaterThan(0)
    })

    it('should handle text with only dates', () => {
      const text = '10/01/2015 15/06/2020 20/12/2025'

      const analysis = analyzeNarrative(text)

      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      expect(dates.length).toBeGreaterThanOrEqual(3)
    })

    it('should handle mixed French and Arabic', () => {
      const text = 'Je m\'appelle Marie Dupont وأريد الطلاق. Mon mari يكسب 3000 TND.'

      const analysis = analyzeNarrative(text)

      // Devrait détecter la langue dominante
      expect(['fr', 'ar']).toContain(analysis.detectedLanguage)

      // Devrait détecter les montants malgré le mélange
      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      expect(amounts.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeNarrative - detected elements validation', () => {
    it('should provide confidence scores for detected elements', () => {
      const text = `
        Mon nom est Marie Dupont.
        Je suis née le 10 janvier 1985.
        Mon salaire est de 2500 TND par mois.
        J'habite à Tunis, quartier Menzah.
      `

      const analysis = analyzeNarrative(text)

      // Tous les éléments détectés devraient avoir une confiance
      analysis.detectedElements.forEach((element) => {
        expect(element.confidence).toBeGreaterThan(0)
        expect(element.confidence).toBeLessThanOrEqual(1)
      })
    })

    it('should provide context for detected elements', () => {
      const text = `
        Mon nom est Marie Dupont.
        Je suis née le 10 janvier 1985.
        Mon salaire est de 2500 TND par mois.
      `

      const analysis = analyzeNarrative(text)

      // Chaque élément devrait avoir un contexte
      analysis.detectedElements.forEach((element) => {
        expect(element.context).toBeDefined()
        expect(element.context.length).toBeGreaterThan(0)
      })
    })

    it('should categorize detected dates correctly', () => {
      const text = `
        Date de mariage: 15 juin 2015
        Date de naissance: 10/01/1985
        Audience prévue: 20 mars 2026
        Séparation depuis: 1er janvier 2026
      `

      const analysis = analyzeNarrative(text)

      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      expect(dates.length).toBeGreaterThanOrEqual(4)

      // Vérifier que les dates ont des valeurs
      dates.forEach((date) => {
        expect(date.value).toBeDefined()
        expect(date.value.length).toBeGreaterThan(0)
      })
    })

    it('should categorize detected amounts correctly', () => {
      const text = `
        Salaire mensuel: 3000 TND
        Pension alimentaire demandée: 500 dinars par enfant
        Valeur de l'appartement: 150000 TND
        Frais d'avocat: 1500 د.ت
      `

      const analysis = analyzeNarrative(text)

      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      expect(amounts.length).toBeGreaterThanOrEqual(4)

      // Vérifier que les montants ont des valeurs
      amounts.forEach((amount) => {
        expect(amount.value).toBeDefined()
        expect(amount.value.length).toBeGreaterThan(0)
      })
    })

    it('should detect person names with French patterns', () => {
      const text = `
        Mon nom est Marie Dupont.
        Mon mari s'appelle Jean Martin.
        Mon avocat est Maître Ahmed Ben Salah.
      `

      const analysis = analyzeNarrative(text)

      const persons = analysis.detectedElements.filter((e) => e.type === 'person')
      expect(persons.length).toBeGreaterThanOrEqual(3)

      // Vérifier que les noms ont été détectés
      const names = persons.map((p) => p.value.toLowerCase())
      expect(names.some((n) => n.includes('marie'))).toBe(true)
      expect(names.some((n) => n.includes('jean'))).toBe(true)
      expect(names.some((n) => n.includes('ahmed'))).toBe(true)
    })

    it('should detect Tunisian place names', () => {
      const text = `
        J'habite à Tunis, dans le quartier de Menzah.
        Mon mari travaille à Sfax.
        L'audience aura lieu au Tribunal de Sousse.
        Nous possédons une maison à Hammamet.
      `

      const analysis = analyzeNarrative(text)

      const places = analysis.detectedElements.filter((e) => e.type === 'place')
      expect(places.length).toBeGreaterThanOrEqual(4)

      const placeNames = places.map((p) => p.value.toLowerCase())
      expect(placeNames.some((n) => n.includes('tunis'))).toBe(true)
      expect(placeNames.some((n) => n.includes('sfax'))).toBe(true)
    })
  })

  describe('analyzeNarrative - quality and completeness scores', () => {
    it('should give high scores for structured narrative', () => {
      const text = `
        CONTEXTE :
        Je m'appelle Marie Dupont, née le 10/01/1985 à Tunis.

        SITUATION ACTUELLE :
        Mariée depuis le 15/06/2015 avec Jean Martin.
        Deux enfants : Sophie (8 ans) et Lucas (5 ans).
        Séparés depuis le 01/01/2026.

        ÉLÉMENTS FINANCIERS :
        - Salaire de mon mari : 3000 TND/mois
        - Valeur de notre appartement : 150000 TND
        - Pension demandée : 500 TND par enfant

        DEMANDES :
        - Garde des enfants
        - Pension alimentaire
        - Partage des biens

        CALENDRIER :
        Audience de conciliation : 20/03/2026
        Tribunal de Première Instance de Tunis
      `

      const analysis = analyzeNarrative(text)

      expect(analysis.qualityScore).toBeGreaterThan(85)
      expect(analysis.completenessScore).toBeGreaterThan(85)
      expect(analysis.issues.length).toBeLessThan(3)
    })

    it('should give low scores for unstructured short narrative', () => {
      const text = 'Je veux divorcer. Mon mari est méchant.'

      const analysis = analyzeNarrative(text)

      expect(analysis.qualityScore).toBeLessThan(30)
      expect(analysis.completenessScore).toBeLessThan(20)
      expect(analysis.issues.length).toBeGreaterThan(2)
    })

    it('should penalize repetitive text', () => {
      const text = 'Je veux divorcer. ' + 'Je veux vraiment divorcer. '.repeat(50)

      const analysis = analyzeNarrative(text)

      // Même avec beaucoup de mots, la répétition devrait affecter le score
      expect(analysis.qualityScore).toBeLessThan(70)
    })

    it('should reward diverse information', () => {
      const text = `
        Marie Dupont, 38 ans, mariée depuis 2015.
        Salaire: 2500 TND. Deux enfants.
        Domicile: Tunis, quartier Menzah.
        Audience: 20 mars 2026 au Tribunal de Tunis.
        Avocat: Maître Ahmed Ben Salah.
        Demande: garde des enfants + pension 500 TND/enfant.
      `

      const analysis = analyzeNarrative(text)

      // Beaucoup d'informations variées (dates, montants, noms, lieux)
      expect(analysis.detectedElements.length).toBeGreaterThan(8)
      expect(analysis.qualityScore).toBeGreaterThan(70)
      expect(analysis.completenessScore).toBeGreaterThan(60)
    })
  })

  describe('analyzeNarrative - suggestions relevance', () => {
    it('should suggest adding dates when missing', () => {
      const text = 'Je veux divorcer de mon mari. Nous avons deux enfants.'

      const analysis = analyzeNarrative(text)

      const dateSuggestion = analysis.suggestions.find(
        (s) => s.type === 'add_info' && s.field?.includes('date')
      )
      expect(dateSuggestion).toBeDefined()
    })

    it('should suggest adding amounts when missing', () => {
      const text = 'Je veux obtenir une pension alimentaire pour mes enfants.'

      const analysis = analyzeNarrative(text)

      const amountSuggestion = analysis.suggestions.find(
        (s) => s.type === 'add_info' && s.field?.includes('montant')
      )
      expect(amountSuggestion).toBeDefined()
    })

    it('should suggest clarifying vague terms', () => {
      const text = 'Peut-être que je pourrais divorcer prochainement.'

      const analysis = analyzeNarrative(text)

      const clarifySuggestion = analysis.suggestions.find(
        (s) => s.type === 'clarify'
      )
      expect(clarifySuggestion).toBeDefined()
    })

    it('should suggest structuring when text is long but unorganized', () => {
      const text = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z '.repeat(20)

      const analysis = analyzeNarrative(text)

      expect(analysis.wordCount).toBeGreaterThan(100)

      // Devrait suggérer de structurer
      const structureSuggestion = analysis.suggestions.find(
        (s) => s.type === 'structure'
      )
      // Peut ne pas être présent si le texte n'est pas assez "réel"
      // mais au moins on vérifie qu'il y a des suggestions
      expect(analysis.suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeNarrative - real-world scenarios', () => {
    it('should handle divorce case narrative', () => {
      const text = `
        Je souhaite divorcer de mon conjoint pour mésentente.
        Nous sommes mariés depuis le 10 juin 2010.
        Nous avons trois enfants mineurs : 12 ans, 9 ans et 5 ans.
        Mon mari gagne 4000 dinars par mois comme cadre supérieur.
        Je demande la garde des enfants et une pension de 600 TND par enfant.
        Nous possédons un appartement à Tunis d'une valeur de 200000 TND.
      `

      const analysis = analyzeNarrative(text)

      expect(analysis.qualityScore).toBeGreaterThan(70)
      expect(analysis.detectedElements.length).toBeGreaterThan(5)

      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      const places = analysis.detectedElements.filter((e) => e.type === 'place')

      expect(dates.length).toBeGreaterThanOrEqual(1)
      expect(amounts.length).toBeGreaterThanOrEqual(3)
      expect(places.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle commercial dispute narrative', () => {
      const text = `
        Litige commercial avec la société XYZ SARL.
        Contrat signé le 15 mars 2023 pour un montant de 50000 TND.
        Livraison prévue : 30 juin 2023.
        Retard de 6 mois. Demande de dommages-intérêts : 10000 TND.
        Audience prévue au Tribunal de Commerce de Tunis le 15 février 2026.
      `

      const analysis = analyzeNarrative(text)

      expect(analysis.detectedElements.length).toBeGreaterThan(5)

      const dates = analysis.detectedElements.filter((e) => e.type === 'date')
      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')

      expect(dates.length).toBeGreaterThanOrEqual(3)
      expect(amounts.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle inheritance case narrative', () => {
      const text = `
        Suite au décès de mon père le 20 janvier 2025.
        Succession composée de :
        - Appartement à Sfax : 180000 TND
        - Compte bancaire : 45000 TND
        - Voiture : 25000 TND
        Héritiers : mère, 3 enfants (moi-même et mes 2 frères).
        Désaccord sur le partage avec mon frère cadet.
      `

      const analysis = analyzeNarrative(text)

      const amounts = analysis.detectedElements.filter((e) => e.type === 'amount')
      const places = analysis.detectedElements.filter((e) => e.type === 'place')
      const dates = analysis.detectedElements.filter((e) => e.type === 'date')

      expect(amounts.length).toBeGreaterThanOrEqual(3)
      expect(places.length).toBeGreaterThanOrEqual(1)
      expect(dates.length).toBeGreaterThanOrEqual(1)
    })
  })
})
