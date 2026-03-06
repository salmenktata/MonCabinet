import { describe, it, expect } from 'vitest'
import {
  cleanText,
  isNavigationBoilerplate,
  isPdfUrl,
  parseArabicDate,
  generateIortUrl,
  generateCodeSectionUrl,
} from '../iort-text-utils'

describe('iort-text-utils', () => {
  describe('cleanText', () => {
    it('supprime les tokens WD_ACTION_', () => {
      const result = cleanText('text WD_ACTION_123 content')
      expect(result).toContain('text')
      expect(result).toContain('content')
      expect(result).not.toContain('WD_ACTION_')
    })

    it('supprime le copyright IORT', () => {
      const result = cleanText('content Copyright 2024 IORT end')
      expect(result).not.toMatch(/Copyright.*IORT/i)
    })

    it('supprime le boilerplate navigation', () => {
      const result = cleanText('content الجمهورية التونسية رئاسة الحكومة end')
      expect(result).not.toContain('الجمهورية التونسية رئاسة الحكومة')
    })

    it('normalise les espaces multiples', () => {
      expect(cleanText('hello   world   test')).toBe('hello world test')
    })

    it('supprime جميع الحقوق محفوظة', () => {
      const result = cleanText('content جميع الحقوق محفوظة end')
      expect(result).not.toContain('جميع الحقوق محفوظة')
    })

    it('supprime المطبعة الرسمية', () => {
      const result = cleanText('content المطبعة الرسمية end')
      expect(result).not.toContain('المطبعة الرسمية')
    })
  })

  describe('isNavigationBoilerplate', () => {
    it('retourne true pour texte < 50 chars', () => {
      expect(isNavigationBoilerplate('court')).toBe(true)
    })

    it('retourne true si commence par header gouvernemental', () => {
      expect(isNavigationBoilerplate('الجمهورية التونسية some navigation text that is long enough')).toBe(true)
    })

    it('retourne false pour du contenu juridique avec articles', () => {
      const legalText = 'الفصل 1 يشمل التراب الديواني التونسي المشار إليه في هذه المجلة بعبارة التراب الديواني الأراضي القارية التونسية ومياهها الداخلية والإقليمية والجزر الطبيعية التونسية وما يحيط بهذه الجزر من مياه داخلية وإقليمية'
      expect(isNavigationBoilerplate(legalText)).toBe(false)
    })

    it('retourne true pour du texte riche en mots structurels sans contenu legal', () => {
      const tocText = 'الباب الأول الكتاب الثاني العنوان الثالث القسم الرابع الفرع الخامس الباب السادس الكتاب السابع العنوان الثامن القسم التاسع اطلاع اطلاع اطلاع'
      expect(isNavigationBoilerplate(tocText)).toBe(true)
    })

    it('retourne true pour navigation IORT sans contenu legal', () => {
      const navText = 'الرائد الرسمي للجمهورية التونسية إصدارات لقرارات ومراسيم وأوامر رئاسة الحكومة'
      expect(isNavigationBoilerplate(navText)).toBe(true)
    })
  })

  describe('isPdfUrl', () => {
    it('detecte les URLs PDF', () => {
      expect(isPdfUrl('https://example.com/file.pdf')).toBe(true)
      expect(isPdfUrl('https://example.com/file.pdf?v=1')).toBe(true)
      expect(isPdfUrl('https://example.com/file.pdf#page=1')).toBe(true)
    })

    it('detecte les URLs blob', () => {
      expect(isPdfUrl('blob:https://example.com/123')).toBe(true)
    })

    it('retourne false pour les URLs non-PDF', () => {
      expect(isPdfUrl('https://example.com/page')).toBe(false)
      expect(isPdfUrl('https://example.com/file.html')).toBe(false)
    })
  })

  describe('parseArabicDate', () => {
    it('parse une date arabe tunisienne', () => {
      expect(parseArabicDate('15 جانفي 2024')).toBe('2024-01-15')
      expect(parseArabicDate('1 فيفري 2023')).toBe('2023-02-01')
      expect(parseArabicDate('25 جويلية 2022')).toBe('2022-07-25')
      expect(parseArabicDate('31 ديسمبر 2025')).toBe('2025-12-31')
    })

    it('parse tous les mois tunisiens', () => {
      expect(parseArabicDate('1 جانفي 2024')).toBe('2024-01-01')
      expect(parseArabicDate('1 فيفري 2024')).toBe('2024-02-01')
      expect(parseArabicDate('1 مارس 2024')).toBe('2024-03-01')
      expect(parseArabicDate('1 أفريل 2024')).toBe('2024-04-01')
      expect(parseArabicDate('1 ماي 2024')).toBe('2024-05-01')
      expect(parseArabicDate('1 جوان 2024')).toBe('2024-06-01')
      expect(parseArabicDate('1 جويلية 2024')).toBe('2024-07-01')
      expect(parseArabicDate('1 أوت 2024')).toBe('2024-08-01')
      expect(parseArabicDate('1 سبتمبر 2024')).toBe('2024-09-01')
      expect(parseArabicDate('1 أكتوبر 2024')).toBe('2024-10-01')
      expect(parseArabicDate('1 نوفمبر 2024')).toBe('2024-11-01')
      expect(parseArabicDate('1 ديسمبر 2024')).toBe('2024-12-01')
    })

    it('retourne null pour null', () => {
      expect(parseArabicDate(null)).toBeNull()
    })

    it('retourne null pour une date invalide', () => {
      expect(parseArabicDate('invalid')).toBeNull()
      expect(parseArabicDate('32 جانفي 2024')).toBeNull()
    })

    it('retourne null pour un mois inconnu', () => {
      expect(parseArabicDate('15 يناير 2024')).toBeNull() // يناير n'est pas tunisien
    })
  })

  describe('generateIortUrl', () => {
    it('genere une URL avec issueNumber', () => {
      const url = generateIortUrl(2024, '45', 'قانون', 'test')
      expect(url).toBe('http://www.iort.gov.tn/jort/2024/قانون/45')
    })

    it('genere une URL avec hash si pas de issueNumber', () => {
      const url = generateIortUrl(2024, null, 'قانون', 'Titre du texte')
      expect(url).toMatch(/^http:\/\/www\.iort\.gov\.tn\/jort\/2024\/قانون\/[a-f0-9]{12}$/)
    })

    it('ajoute /fr/ prefix pour langue francaise', () => {
      const url = generateIortUrl(2024, '45', 'Loi', 'test', 'fr')
      expect(url).toBe('http://www.iort.gov.tn/jort/fr/2024/Loi/45')
    })

    it('pas de prefix /fr/ pour langue arabe', () => {
      const url = generateIortUrl(2024, '45', 'قانون', 'test', 'ar')
      expect(url).not.toContain('/fr/')
    })
  })

  describe('generateCodeSectionUrl', () => {
    it('genere une URL deterministe', () => {
      const url1 = generateCodeSectionUrl('مجلة الديوانة', 'الباب الأول أحكام عامة')
      const url2 = generateCodeSectionUrl('مجلة الديوانة', 'الباب الأول أحكام عامة')
      expect(url1).toBe(url2)
    })

    it('contient le slug du code et de la section', () => {
      const url = generateCodeSectionUrl('مجلة الديوانة', 'الباب الأول')
      expect(url).toContain('/codes/')
      expect(url).toContain('مجلة-الديوانة')
    })

    it('genere des URLs differentes pour des sections differentes', () => {
      const url1 = generateCodeSectionUrl('مجلة الديوانة', 'الباب الأول')
      const url2 = generateCodeSectionUrl('مجلة الديوانة', 'الباب الثاني')
      expect(url1).not.toBe(url2)
    })
  })
})
