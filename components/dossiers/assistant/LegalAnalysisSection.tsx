'use client'

import { useTranslations } from 'next-intl'
import type { StructuredDossier, LegalAnalysis } from '@/lib/ai/dossier-structuring-service'

interface LegalAnalysisSectionProps {
  result: StructuredDossier
}

export default function LegalAnalysisSection({
  result,
}: LegalAnalysisSectionProps) {
  const t = useTranslations('assistant')

  // Utiliser l'analyse de l'IA si disponible, sinon générer localement
  const analysis = result.analyseJuridique

  return (
    <div className="space-y-6">
      {/* Syllogisme Juridique (si disponible) */}
      {analysis?.syllogisme && (
        <div className="rounded-lg border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">&#128161;</span>
            <h3 className="text-lg font-semibold text-indigo-900">
              Syllogisme Juridique
            </h3>
            <span className="text-sm text-indigo-600" dir="rtl">
              (القياس القانوني)
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg bg-white/60 p-4 border-l-4 border-indigo-500">
              <span className="text-xs font-semibold text-indigo-600 uppercase">Majeure (La règle de droit)</span>
              <p className="mt-1 text-indigo-900">{analysis.syllogisme.majeure}</p>
            </div>
            <div className="rounded-lg bg-white/60 p-4 border-l-4 border-purple-500">
              <span className="text-xs font-semibold text-purple-600 uppercase">Mineure (Les faits qualifiés)</span>
              <p className="mt-1 text-purple-900">{analysis.syllogisme.mineure}</p>
            </div>
            <div className="rounded-lg bg-white/60 p-4 border-l-4 border-blue-500">
              <span className="text-xs font-semibold text-blue-600 uppercase">Conclusion (La demande)</span>
              <p className="mt-1 text-blue-900 font-medium">{analysis.syllogisme.conclusion}</p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Qualification Juridique */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#9878;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('legalAnalysis.qualification.title')}
          </h3>
          <span className="text-sm text-muted-foreground" dir="rtl">
            (التكييف القانوني)
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Type d'action */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <h4 className="font-medium text-blue-900 mb-2">
              {t('legalAnalysis.qualification.actionType')}
            </h4>
            <p className="text-blue-800">
              {analysis?.qualification?.natureAction || getActionType(result)}
            </p>
          </div>

          {/* Code applicable */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
            <h4 className="font-medium text-emerald-900 mb-2">
              {t('legalAnalysis.qualification.applicableCode')}
            </h4>
            <p className="text-emerald-800">
              {analysis?.qualification?.codeApplicable || getApplicableCode(result)}
            </p>
            {analysis?.qualification?.articlesVises && analysis.qualification.articlesVises.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {analysis.qualification.articlesVises.map((art, i) => (
                  <span key={i} className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs text-emerald-800">
                    {art}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Fondement juridique */}
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 md:col-span-2">
            <h4 className="font-medium text-purple-900 mb-2">
              {t('legalAnalysis.qualification.legalBasis')}
            </h4>
            <p className="text-purple-800">
              {analysis?.qualification?.fondementJuridique || getLegalBasis(result)}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Analyse de Recevabilité */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#128270;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('legalAnalysis.admissibility.title')}
          </h3>
        </div>

        <div className="space-y-4">
          {/* Utiliser les données de l'IA si disponibles */}
          {analysis?.recevabilite ? (
            <>
              {/* Prescription */}
              <div
                className={`flex items-start gap-3 rounded-lg p-4 ${
                  analysis.recevabilite.prescription.estPrescrit
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-green-50 border border-green-200'
                }`}
              >
                <span className="text-xl">
                  {analysis.recevabilite.prescription.estPrescrit ? '\u274C' : '\u2705'}
                </span>
                <div>
                  <h4 className={`font-medium ${
                    analysis.recevabilite.prescription.estPrescrit ? 'text-red-900' : 'text-green-900'
                  }`}>
                    Prescription (التقادم)
                  </h4>
                  <p className={`text-sm mt-1 ${
                    analysis.recevabilite.prescription.estPrescrit ? 'text-red-800' : 'text-green-800'
                  }`}>
                    {analysis.recevabilite.prescription.analyse}
                  </p>
                  <span className="text-xs mt-1 opacity-75">
                    Délai applicable: {analysis.recevabilite.prescription.delaiApplicable}
                  </span>
                </div>
              </div>

              {/* Qualité pour agir */}
              <div
                className={`flex items-start gap-3 rounded-lg p-4 ${
                  analysis.recevabilite.qualitePourAgir.estVerifiee
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-amber-50 border border-amber-200'
                }`}
              >
                <span className="text-xl">
                  {analysis.recevabilite.qualitePourAgir.estVerifiee ? '\u2705' : '\u26A0\uFE0F'}
                </span>
                <div>
                  <h4 className={`font-medium ${
                    analysis.recevabilite.qualitePourAgir.estVerifiee ? 'text-green-900' : 'text-amber-900'
                  }`}>
                    Qualité pour agir (الصفة)
                  </h4>
                  <p className={`text-sm mt-1 ${
                    analysis.recevabilite.qualitePourAgir.estVerifiee ? 'text-green-800' : 'text-amber-800'
                  }`}>
                    {analysis.recevabilite.qualitePourAgir.analyse}
                  </p>
                  {analysis.recevabilite.qualitePourAgir.documentsRequis.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs font-medium">Documents requis:</span>
                      <ul className="list-disc list-inside text-xs mt-1">
                        {analysis.recevabilite.qualitePourAgir.documentsRequis.map((doc, i) => (
                          <li key={i}>{doc}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Intérêt à agir */}
              <div
                className={`flex items-start gap-3 rounded-lg p-4 ${
                  analysis.recevabilite.interetAAgir.estCaracterise
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-amber-50 border border-amber-200'
                }`}
              >
                <span className="text-xl">
                  {analysis.recevabilite.interetAAgir.estCaracterise ? '\u2705' : '\u26A0\uFE0F'}
                </span>
                <div>
                  <h4 className={`font-medium ${
                    analysis.recevabilite.interetAAgir.estCaracterise ? 'text-green-900' : 'text-amber-900'
                  }`}>
                    Intérêt à agir (المصلحة)
                  </h4>
                  <p className={`text-sm mt-1 ${
                    analysis.recevabilite.interetAAgir.estCaracterise ? 'text-green-800' : 'text-amber-800'
                  }`}>
                    {analysis.recevabilite.interetAAgir.analyse}
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Fallback: générer localement */
            getAdmissibilityChecks(result).map((check, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 rounded-lg p-4 ${
                check.status === 'ok'
                  ? 'bg-green-50 border border-green-200'
                  : check.status === 'warning'
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-red-50 border border-red-200'
              }`}
            >
              <span className="text-xl">
                {check.status === 'ok'
                  ? '\u2705'
                  : check.status === 'warning'
                    ? '\u26A0\uFE0F'
                    : '\u274C'}
              </span>
              <div>
                <h4
                  className={`font-medium ${
                    check.status === 'ok'
                      ? 'text-green-900'
                      : check.status === 'warning'
                        ? 'text-amber-900'
                        : 'text-red-900'
                  }`}
                >
                  {check.title}
                  {check.titleAr && (
                    <span className="ml-2 text-sm opacity-75" dir="rtl">
                      ({check.titleAr})
                    </span>
                  )}
                </h4>
                <p
                  className={`text-sm mt-1 ${
                    check.status === 'ok'
                      ? 'text-green-800'
                      : check.status === 'warning'
                        ? 'text-amber-800'
                        : 'text-red-800'
                  }`}
                >
                  {check.description}
                </p>
              </div>
            </div>
          ))
          )}
        </div>
      </div>

      {/* 3. Juridiction Compétente */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#127963;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('legalAnalysis.jurisdiction.title')}
          </h3>
          <span className="text-sm text-muted-foreground" dir="rtl">
            (الاختصاص)
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              {t('legalAnalysis.jurisdiction.territorial')}
            </h4>
            <p className="font-medium text-foreground">
              {analysis?.competence?.territoriale ||
                result.donneesSpecifiques.tribunal ||
                getTerritorialJurisdiction(result)}
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              {t('legalAnalysis.jurisdiction.material')}
            </h4>
            <p className="font-medium text-foreground">
              {analysis?.competence?.materielle || getMaterialJurisdiction(result)}
            </p>
          </div>
        </div>

        {analysis?.competence?.justification && (
          <p className="mt-3 text-sm text-muted-foreground">
            {analysis.competence.justification}
          </p>
        )}
      </div>

      {/* 4. Stratégie de Preuve */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#128206;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('legalAnalysis.evidence.title')}
          </h3>
        </div>

        {analysis?.strategiePreuve ? (
          <div className="space-y-4">
            {/* Charge de la preuve */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <h4 className="font-medium text-blue-900 mb-1">Charge de la preuve</h4>
              <p className="text-sm text-blue-800">{analysis.strategiePreuve.chargeDeLaPreuve}</p>
            </div>

            {/* Preuves disponibles */}
            {analysis.strategiePreuve.preuvesDisponibles.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-green-700 mb-2">
                  &#9989; Preuves identifiées dans le récit
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.strategiePreuve.preuvesDisponibles.map((p, i) => (
                    <span key={i} className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Preuves manquantes */}
            {analysis.strategiePreuve.preuvesManquantes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-700 mb-2">
                  &#9888; Preuves à collecter
                </h4>
                <div className="space-y-2">
                  {analysis.strategiePreuve.preuvesManquantes.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <span className="text-amber-600">&#128196;</span>
                      <span className="text-sm text-amber-800">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mode de preuve */}
            <div className="text-sm text-muted-foreground">
              <strong>Mode de preuve privilégié:</strong> {analysis.strategiePreuve.modeDePreuve}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {t('legalAnalysis.evidence.description')}
            </p>
            <div className="space-y-3">
              {getEvidenceStrategy(result).map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <span
                    className={`flex-shrink-0 rounded-full p-1.5 ${
                      item.priority === 'essential'
                        ? 'bg-red-100 text-red-700'
                        : item.priority === 'important'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    <span className="text-sm" dangerouslySetInnerHTML={{ __html: item.icon }} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{item.document}</span>
                      {item.priority === 'essential' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {t('legalAnalysis.evidence.essential')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 5. Évaluation des Risques */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">&#9888;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('legalAnalysis.risks.title')}
          </h3>
        </div>

        <div className="grid gap-3">
          {(analysis?.risques || getRisks(result)).map((risk, index) => {
            const level = 'niveau' in risk ? risk.niveau : risk.level
            const levelLabel = level === 'eleve' || level === 'high'
              ? t('legalAnalysis.risks.high')
              : level === 'moyen' || level === 'medium'
                ? t('legalAnalysis.risks.medium')
                : t('legalAnalysis.risks.low')
            const isHigh = level === 'eleve' || level === 'high'
            const isMedium = level === 'moyen' || level === 'medium'

            return (
            <div
              key={index}
              className={`rounded-lg border p-4 ${
                isHigh
                  ? 'border-red-200 bg-red-50'
                  : isMedium
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-blue-200 bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <h4
                  className={`font-medium ${
                    isHigh
                      ? 'text-red-900'
                      : isMedium
                        ? 'text-amber-900'
                        : 'text-blue-900'
                  }`}
                >
                  {'nature' in risk ? risk.nature : risk.title}
                </h4>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    isHigh
                      ? 'bg-red-200 text-red-800'
                      : isMedium
                        ? 'bg-amber-200 text-amber-800'
                        : 'bg-blue-200 text-blue-800'
                  }`}
                >
                  {levelLabel}
                </span>
              </div>
              <p
                className={`text-sm mt-1 ${
                  isHigh
                    ? 'text-red-800'
                    : isMedium
                      ? 'text-amber-800'
                      : 'text-blue-800'
                }`}
              >
                {risk.description}
              </p>
              {risk.mitigation && (
                <p className="text-sm mt-2 font-medium">
                  &#128161; {risk.mitigation}
                </p>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {/* 6. Recommandation Stratégique */}
      <div className="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">&#128161;</span>
          <h3 className="text-lg font-semibold text-blue-900">
            {t('legalAnalysis.recommendation.title')}
          </h3>
        </div>

        <div className="space-y-4">
          <p className="text-blue-900">
            {analysis?.recommandationStrategique || getStrategicRecommendation(result)}
          </p>

          {/* Prochaines étapes recommandées */}
          <div className="rounded-lg bg-white/60 p-4">
            <h4 className="font-medium text-blue-900 mb-2">
              {t('legalAnalysis.recommendation.nextSteps')}
            </h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              {(analysis?.prochainesEtapes || getNextSteps(result)).map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

// === Fonctions utilitaires pour générer l'analyse ===

function getActionType(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return 'Action en divorce judiciaire (دعوى الطلاق)'
    case 'commercial':
      if (result.donneesSpecifiques.montantPrincipal) {
        return 'Action en recouvrement de créance commerciale (دعوى استخلاص ديون تجارية)'
      }
      return 'Action commerciale'
    case 'civil_premiere_instance':
      return 'Action civile en première instance (دعوى مدنية)'
    case 'refere':
      return 'Procédure de référé - mesure urgente (القضاء الاستعجالي)'
    default:
      return 'Action à qualifier'
  }
}

function getApplicableCode(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return 'Code du Statut Personnel (CSP) - مجلة الأحوال الشخصية'
    case 'commercial':
      return 'Code de Commerce + Code des Obligations et Contrats (COC) - المجلة التجارية'
    case 'civil_premiere_instance':
      return 'Code des Obligations et Contrats (COC) - مجلة الالتزامات والعقود'
    case 'refere':
      return 'Code de Procédure Civile et Commerciale - مجلة المرافعات المدنية والتجارية'
    default:
      return 'À déterminer selon les faits'
  }
}

function getLegalBasis(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return `Articles 30 et suivants du CSP: Divorce judiciaire sur demande de l'un des époux.
              Art. 31: Pension Moutaa (compensatoire). Art. 46: Pension alimentaire des enfants.
              Art. 67 et suivants: Garde des enfants (الحضانة).`
    case 'commercial':
      return `Art. 278 et suivants COC: Responsabilité contractuelle et intérêts moratoires.
              Art. 410bis Code de Commerce: Indemnité forfaitaire pour chèque impayé.
              Taux d'intérêt légal: TMM + 7 points = 14.5% (BCT).`
    case 'civil_premiere_instance':
      return `Art. 82 et suivants COC: Responsabilité civile.
              Art. 242 et suivants COC: Exécution des obligations.`
    case 'refere':
      return `Art. 201 et suivants CPC: Conditions du référé - urgence et absence de contestation sérieuse.`
    default:
      return 'Fondement à préciser après analyse approfondie.'
  }
}

function getAdmissibilityChecks(
  result: StructuredDossier
): Array<{
  title: string
  titleAr?: string
  description: string
  status: 'ok' | 'warning' | 'error'
}> {
  const checks = []

  // Prescription
  checks.push({
    title: 'Prescription',
    titleAr: 'التقادم',
    description: getPrescriptionAnalysis(result),
    status: 'ok' as const,
  })

  // Qualité pour agir
  checks.push({
    title: 'Qualité pour agir',
    titleAr: 'الصفة',
    description:
      result.client.nom
        ? 'Le client est identifié. Vérifier les documents établissant sa qualité (titre de propriété, contrat, extrait RNE).'
        : 'Client non identifié - impossible de vérifier la qualité pour agir.',
    status: result.client.nom ? ('warning' as const) : ('error' as const),
  })

  // Intérêt à agir
  checks.push({
    title: 'Intérêt à agir',
    titleAr: 'المصلحة',
    description: 'L\'intérêt doit être né, actuel, personnel et légitime. À confirmer selon les pièces.',
    status: 'warning' as const,
  })

  // Forme de l'acte
  if (result.typeProcedure !== 'refere') {
    checks.push({
      title: 'Vices de forme',
      titleAr: 'العيوب الشكلية',
      description:
        'Vérifier les mentions obligatoires de l\'assignation (identité complète, tribunal compétent, objet précis, moyen de droit).',
      status: 'warning' as const,
    })
  }

  return checks
}

function getPrescriptionAnalysis(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return 'Pas de prescription pour l\'action en divorce. Les demandes de pension sont imprescriptibles.'
    case 'commercial':
      return 'Prescription commerciale de 1 an ou 3 ans selon la nature. Vérifier la date de la créance.'
    default:
      return 'Prescription civile de droit commun: 15 ans. À vérifier selon le type d\'action.'
  }
}

function getTerritorialJurisdiction(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return 'Tribunal de la Famille du domicile conjugal ou du dernier domicile commun'
    case 'commercial':
      return 'Tribunal de Première Instance à compétence commerciale du siège du défendeur'
    default:
      return 'Tribunal du domicile du défendeur (Art. 27 CPC)'
  }
}

function getMaterialJurisdiction(result: StructuredDossier): string {
  const montant = result.donneesSpecifiques.montantPrincipal || 0

  if (result.typeProcedure === 'divorce') {
    return 'Tribunal de la Famille (chambres de statut personnel)'
  }

  if (result.typeProcedure === 'refere') {
    return 'Président du Tribunal de Première Instance (juge des référés)'
  }

  if (montant <= 7000) {
    return 'Juge Cantonal (قاضي الناحية) - jusqu\'à 7 000 TND'
  } else {
    return 'Tribunal de Première Instance (المحكمة الابتدائية) - au-delà de 7 000 TND'
  }
}

function getEvidenceStrategy(
  result: StructuredDossier
): Array<{
  icon: string
  document: string
  purpose: string
  priority: 'essential' | 'important' | 'useful'
}> {
  const evidence = []

  // Documents communs à toutes les procédures
  evidence.push({
    icon: '&#128196;',
    document: 'Copie CIN du client',
    purpose: 'Preuve d\'identité et de capacité juridique',
    priority: 'essential' as const,
  })

  // Documents spécifiques selon le type
  if (result.typeProcedure === 'divorce') {
    evidence.push({
      icon: '&#128141;',
      document: 'Acte de mariage original',
      purpose: 'Preuve du lien matrimonial (عقد الزواج)',
      priority: 'essential' as const,
    })
    if (result.enfants && result.enfants.length > 0) {
      evidence.push({
        icon: '&#128118;',
        document: 'Extraits de naissance des enfants',
        purpose: 'Preuve de la filiation pour la garde',
        priority: 'essential' as const,
      })
    }
    evidence.push({
      icon: '&#128176;',
      document: 'Fiches de paie (3 derniers mois)',
      purpose: 'Base de calcul des pensions',
      priority: 'important' as const,
    })
    if (
      result.donneesSpecifiques.biensCommuns &&
      result.donneesSpecifiques.biensCommuns.length > 0
    ) {
      evidence.push({
        icon: '&#127968;',
        document: 'Titre de propriété / estimation bien immobilier',
        purpose: 'Évaluation du patrimoine commun',
        priority: 'important' as const,
      })
    }
  }

  if (result.typeProcedure === 'commercial') {
    evidence.push({
      icon: '&#128203;',
      document: 'Contrat ou bon de commande',
      purpose: 'Preuve de l\'obligation contractuelle',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128181;',
      document: 'Factures impayées',
      purpose: 'Preuve de la créance et de son montant',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128231;',
      document: 'Mise en demeure + AR',
      purpose: 'Preuve de la tentative de recouvrement amiable',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#127970;',
      document: 'Extrait RNE du créancier et débiteur',
      purpose: 'Preuve de la qualité commerciale',
      priority: 'important' as const,
    })
  }

  if (result.typeProcedure === 'civil_premiere_instance') {
    evidence.push({
      icon: '&#128203;',
      document: 'Tout contrat ou convention écrite',
      purpose: 'La preuve écrite est primordiale en droit civil tunisien',
      priority: 'essential' as const,
    })
    evidence.push({
      icon: '&#128247;',
      document: 'Constat d\'huissier (si nécessaire)',
      purpose: 'Preuve matérielle des faits (محضر معاينة)',
      priority: 'important' as const,
    })
  }

  return evidence
}

function getRisks(
  result: StructuredDossier
): Array<{
  title: string
  description: string
  level: 'high' | 'medium' | 'low'
  mitigation?: string
}> {
  const risks = []

  // Risque de forme
  risks.push({
    title: 'Fin de non-recevoir pour vice de forme',
    description:
      'Le juge tunisien peut rejeter la demande pour irrégularité de procédure (عدم سماع الدعوى شكلاً) avant même d\'examiner le fond.',
    level: 'high' as const,
    mitigation:
      'Vérifier minutieusement toutes les mentions obligatoires et les délais de signification.',
  })

  // Risques spécifiques
  if (result.typeProcedure === 'divorce') {
    risks.push({
      title: 'Échec des conciliations',
      description:
        'Les 3 tentatives de conciliation sont obligatoires. Si le client ne se présente pas, l\'action peut être rejetée.',
      level: 'medium' as const,
      mitigation: 'Préparer le client aux séances de conciliation et s\'assurer de sa présence.',
    })
  }

  if (result.typeProcedure === 'commercial') {
    if (!result.donneesSpecifiques.dateCreance) {
      risks.push({
        title: 'Risque de prescription',
        description:
          'Sans date de créance précise, impossible de vérifier si l\'action n\'est pas prescrite (1 an ou 3 ans en commercial).',
        level: 'high' as const,
        mitigation: 'Obtenir les documents datés établissant la créance.',
      })
    }
  }

  // Risque de preuve
  risks.push({
    title: 'Insuffisance de preuves',
    description:
      'En droit tunisien, "la preuve est la reine des batailles". Une demande mal documentée sera rejetée.',
    level: 'medium' as const,
    mitigation: 'Constituer un bordereau de pièces complet avant l\'introduction de l\'instance.',
  })

  return risks
}

function getStrategicRecommendation(result: StructuredDossier): string {
  switch (result.typeProcedure) {
    case 'divorce':
      return `Compte tenu des éléments extraits, il est recommandé d'engager une procédure de divorce judiciaire
              devant le Tribunal de la Famille. Avec ${result.enfants?.length || 0} enfant(s) mineur(s),
              les questions de garde (حضانة) et de pension alimentaire seront centrales.
              La Moutaa estimée et les pensions alimentaires constituent une base de négociation solide.`
    case 'commercial':
      return `Avant toute action judiciaire, envoyer une mise en demeure formelle par lettre recommandée avec AR.
              Cela fait courir les intérêts moratoires (14.5%) et démontre au juge la bonne foi du créancier.
              Si le montant le justifie, envisager une requête en injonction de payer pour accélérer la procédure.`
    case 'refere':
      return `La procédure de référé est appropriée si l'urgence est caractérisée et qu'il n'y a pas
              de contestation sérieuse du droit. Préparer une requête démontrant clairement ces deux conditions.`
    default:
      return `Après analyse des faits, constituer un dossier de pièces solide et vérifier la recevabilité
              de l'action avant d'engager la procédure. Une consultation approfondie est recommandée.`
  }
}

function getNextSteps(result: StructuredDossier): string[] {
  const steps = []

  steps.push('Collecter toutes les pièces essentielles identifiées')
  steps.push('Rédiger et faire signer la Convention d\'Honoraires')

  if (result.typeProcedure === 'commercial') {
    steps.push('Envoyer la mise en demeure par lettre recommandée avec AR')
    steps.push('Attendre 15 jours le délai de réponse')
  }

  if (result.typeProcedure === 'divorce') {
    steps.push('Préparer le client aux séances de conciliation obligatoires')
  }

  steps.push('Rédiger la Note d\'Analyse Juridique interne')
  steps.push('Constituer le bordereau de pièces numéroté')
  steps.push('Rédiger l\'acte introductif d\'instance')

  return steps
}
