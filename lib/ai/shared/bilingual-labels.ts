/**
 * Labels bilingues AR/FR pour les interfaces IA
 *
 * Centralise les labels pour éviter duplication entre
 * Consultation et Structuration IA.
 */

import { type DetectedLanguage } from '@/lib/ai/language-utils'

/**
 * Type strict pour les clés de langue (ar ou fr)
 */
export type LangKey = 'ar' | 'fr'

/**
 * Détermine la clé de langue pour les labels (ar ou fr)
 * Mixed devient 'ar' par défaut (plus de contenu juridique en arabe)
 */
export function getLangKey(lang: DetectedLanguage): LangKey {
  return lang === 'fr' ? 'fr' : 'ar'
}

/**
 * Labels pour le contexte dossier
 */
export const DOSSIER_LABELS = {
  fr: {
    header: 'DOSSIER LIÉ:',
    titre: 'Titre',
    numero: 'Numéro',
    typeAffaire: "Type d'affaire",
    description: 'Description',
    faits: 'Faits',
  },
  ar: {
    header: 'الملف المرتبط:',
    titre: 'العنوان',
    numero: 'الرقم',
    typeAffaire: 'نوع القضية',
    description: 'الوصف',
    faits: 'الوقائع',
  },
} as const

/**
 * Labels pour les prompts système
 */
export const PROMPT_LABELS = {
  fr: {
    sourcesHeader: 'SOURCES DISPONIBLES:',
    noSources: 'Aucune source trouvée dans la base de connaissances.',
    questionHeader: "QUESTION DE L'UTILISATEUR:",
    contextHeader: 'CONTEXTE ADDITIONNEL:',
    narrativeHeader: 'RÉCIT DU CLIENT:',
  },
  ar: {
    sourcesHeader: 'المصادر المتوفرة:',
    noSources: 'لم يتم العثور على مصادر في قاعدة المعرفة.',
    questionHeader: 'سؤال المستخدم:',
    contextHeader: 'سياق إضافي:',
    narrativeHeader: 'رواية العميل:',
  },
} as const

/**
 * Formate le contexte d'un dossier en texte bilingue
 *
 * @param dossier - Données du dossier
 * @param langKey - Langue des labels ('ar' ou 'fr')
 * @returns Contexte formaté avec labels bilingues
 */
export function formatDossierContext(
  dossier: {
    titre: string
    numero: string
    type_affaire: string
    description?: string | null
    faits?: string | null
  },
  langKey: LangKey
): string {
  const labels = DOSSIER_LABELS[langKey]

  return `
${labels.header}
- ${labels.titre}: ${dossier.titre}
- ${labels.numero}: ${dossier.numero}
- ${labels.typeAffaire}: ${dossier.type_affaire}
- ${labels.description}: ${dossier.description || 'N/A'}
- ${labels.faits}: ${dossier.faits || 'N/A'}
`
}
