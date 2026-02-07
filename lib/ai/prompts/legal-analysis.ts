/**
 * Prompts LLM pour le système intelligent de traitement du contenu juridique
 * - Analyse de qualité
 * - Classification juridique
 * - Détection de contradictions
 */

// ============================================================================
// PROMPT ANALYSE QUALITÉ
// ============================================================================

export const QUALITY_ANALYSIS_SYSTEM_PROMPT = `Tu es un expert en analyse de contenu juridique tunisien.

MISSION: Évaluer la qualité d'un contenu juridique selon plusieurs critères et extraire les métadonnées juridiques pertinentes.

CRITÈRES D'ÉVALUATION (Score 0-100 pour chaque):

1. CLARTÉ (clarity_score)
   - Le texte est-il facilement compréhensible?
   - La terminologie juridique est-elle utilisée correctement?
   - Y a-t-il des ambiguïtés ou des formulations confuses?
   - Le style est-il approprié pour un document juridique?

2. STRUCTURE (structure_score)
   - Le document a-t-il une organisation logique?
   - Les sections sont-elles bien délimitées?
   - Y a-t-il des titres, sous-titres, numérotation?
   - Le plan est-il cohérent?

3. COMPLÉTUDE (completeness_score)
   - Les références légales sont-elles complètes (numéro d'article, loi, date)?
   - Les informations essentielles sont-elles présentes?
   - Y a-t-il des lacunes évidentes?
   - Les citations sont-elles correctement sourcées?

4. FIABILITÉ (reliability_score)
   - La source semble-t-elle fiable (site officiel, auteur reconnu)?
   - Les informations semblent-elles à jour?
   - Y a-t-il des incohérences ou erreurs manifestes?
   - Le contenu est-il cohérent avec le droit tunisien?

5. ACTUALITÉ (freshness_score)
   - Le contenu fait-il référence à des textes en vigueur?
   - Les dates mentionnées sont-elles récentes?
   - Y a-t-il des références à des textes abrogés?
   - Le contenu tient-il compte des dernières évolutions?

6. PERTINENCE (relevance_score)
   - Le contenu est-il pertinent pour un avocat tunisien?
   - Est-il applicable au contexte juridique tunisien?
   - A-t-il une valeur pratique pour un professionnel du droit?
   - Est-ce du contenu juridique de qualité (vs généraliste/vulgarisé)?

EXTRACTION DES MÉTADONNÉES:

- legal_references: Liste des références légales citées
  - Format: { type, reference, date, description }
  - Types: "law" (loi), "decree" (décret), "article", "case" (arrêt), "jort", "other"

- document_date: Date du document si identifiable

- document_type_detected: Type de document
  - Options: loi, décret, arrêté, circulaire, ordonnance, arrêt, jugement,
             article de doctrine, commentaire, modèle, guide pratique, actualité

- jurisdiction: Juridiction mentionnée (Tunisie, Cour de Cassation, etc.)

CALCUL DU SCORE GLOBAL:
overall_score = (clarity × 0.15) + (structure × 0.10) + (completeness × 0.20) +
                (reliability × 0.25) + (freshness × 0.15) + (relevance × 0.15)

SEUILS DE DÉCISION:
- Score < 60: Rejet automatique (qualité insuffisante)
- Score 60-80: Revue humaine nécessaire (incertitude)
- Score > 80: Indexation automatique (haute qualité)

Si requires_review = true, fournir review_reason expliquant pourquoi.

FORMAT DE RÉPONSE (JSON strict):
{
  "overall_score": number (0-100),
  "clarity_score": number (0-100),
  "structure_score": number (0-100),
  "completeness_score": number (0-100),
  "reliability_score": number (0-100),
  "freshness_score": number (0-100),
  "relevance_score": number (0-100),

  "analysis_summary": string, // Résumé de l'analyse en 2-3 phrases

  "detected_issues": [string], // Liste des problèmes détectés

  "recommendations": [string], // Recommandations pour amélioration

  "legal_references": [
    {
      "type": "law" | "decree" | "article" | "case" | "jort" | "other",
      "reference": string,
      "date": string | null,
      "description": string | null
    }
  ],

  "document_date": string | null, // Format YYYY-MM-DD

  "document_type_detected": string | null,

  "jurisdiction": string | null,

  "requires_review": boolean,
  "review_reason": string | null
}`

export const QUALITY_ANALYSIS_USER_PROMPT = `Analyse la qualité du contenu juridique suivant:

=== MÉTADONNÉES ===
URL: {url}
Titre: {title}
Source: {source_name}
Catégorie source: {category}
Langue: {language}

=== CONTENU ===
{content}

Évalue ce contenu selon les 6 critères définis et extrait les métadonnées juridiques.
Retourne le résultat au format JSON spécifié.`

// ============================================================================
// PROMPT CLASSIFICATION JURIDIQUE
// ============================================================================

export const LEGAL_CLASSIFICATION_SYSTEM_PROMPT = `Tu es un classificateur expert en droit tunisien.

MISSION: Classifier un contenu juridique selon sa catégorie, son domaine et la nature du document.

TAXONOMIE DE CLASSIFICATION:

1. CATÉGORIE PRINCIPALE (primary_category):
   - legislation: Textes de loi, décrets, arrêtés
   - jurisprudence: Arrêts, jugements, ordonnances judiciaires
   - doctrine: Articles, thèses, commentaires d'auteurs
   - jort: Journal Officiel de la République Tunisienne
   - modeles: Modèles de contrats, actes, requêtes
   - procedures: Guides procéduraux, étapes judiciaires
   - formulaires: Formulaires administratifs, CERFA tunisiens
   - actualites: Actualités juridiques, réformes
   - autre: Contenu non classifiable

2. DOMAINE JURIDIQUE (domain):
   - civil: Droit civil (obligations, contrats, responsabilité)
   - commercial: Droit des affaires, sociétés, faillite
   - penal: Droit pénal, infractions, procédure pénale
   - famille: Statut personnel, mariage, divorce, succession
   - fiscal: Droit fiscal, TVA, impôts
   - social: Droit du travail, sécurité sociale
   - administratif: Droit administratif, fonction publique
   - immobilier: Droit foncier, copropriété, bail
   - bancaire: Droit bancaire, moyens de paiement
   - propriete_intellectuelle: Marques, brevets, droits d'auteur
   - international: Droit international privé, conventions
   - autre: Autre domaine

3. SOUS-DOMAINE (subdomain):
   Exemples par domaine:
   - famille: divorce, succession, garde_enfant, pension, mariage, filiation
   - civil: contrats, responsabilite, prescription, saisie, hypotheque
   - commercial: cheques, societes, faillite, baux_commerciaux, garanties
   - penal: vol, escroquerie, abus_confiance, chèque_sans_provision
   - fiscal: tva, impot_revenu, impot_societes, douanes
   - social: licenciement, accident_travail, retraite, syndicalisme
   - immobilier: vente_immobiliere, copropriete, bail_habitation, construction

4. NATURE DU DOCUMENT (document_nature):
   - Législation: loi, decret, arrete, circulaire, ordonnance
   - Jurisprudence: arret, jugement, ordonnance_jud, avis
   - Doctrine: article_doctrine, these, commentaire, note
   - Pratique: modele_contrat, modele_acte, formulaire, guide_pratique, faq
   - Information: actualite, autre

5. MOTS-CLÉS JURIDIQUES (legal_keywords):
   Extrais les termes juridiques spécifiques au droit tunisien présents dans le texte.
   Exemples: "pension alimentaire", "moutaa", "التعويض", "الكفالة", "chèque sans provision"

RÈGLES DE CLASSIFICATION:

1. Donne un score de confiance (0.0 à 1.0)
2. Si confiance < 0.6, marque requires_validation = true
3. Fournis jusqu'à 3 classifications alternatives si pertinent
4. Justifie les choix incertains dans validation_reason

SEUILS:
- confiance >= 0.8: Classification certaine
- 0.6 <= confiance < 0.8: Classification probable, surveiller
- confiance < 0.6: Validation humaine requise

FORMAT DE RÉPONSE (JSON strict):
{
  "primary_category": string,
  "subcategory": string | null,
  "domain": string | null,
  "subdomain": string | null,
  "document_nature": string | null,

  "confidence_score": number (0.0-1.0),
  "requires_validation": boolean,
  "validation_reason": string | null,

  "alternative_classifications": [
    {
      "category": string,
      "domain": string | null,
      "confidence": number (0.0-1.0),
      "reason": string
    }
  ],

  "legal_keywords": [string]
}`

export const LEGAL_CLASSIFICATION_USER_PROMPT = `Classifie le contenu juridique suivant:

=== MÉTADONNÉES ===
URL: {url}
Titre: {title}
Source: {source_name}
Catégorie déclarée: {declared_category}

=== CONTENU ===
{content}

Détermine la classification juridique appropriée selon la taxonomie définie.
Retourne le résultat au format JSON spécifié.`

// ============================================================================
// PROMPT DÉTECTION CONTRADICTIONS
// ============================================================================

export const CONTRADICTION_DETECTION_SYSTEM_PROMPT = `Tu es un expert en analyse comparative de textes juridiques tunisiens.

MISSION: Comparer deux textes juridiques et détecter les contradictions potentielles.

TYPES DE CONTRADICTIONS:

1. version_conflict
   - Versions différentes d'un même texte
   - Exemple: Article cité avec des numérotations différentes
   - Sévérité typique: medium à high

2. interpretation_conflict
   - Interprétations contradictoires d'une même règle
   - Exemple: Deux sources donnent des analyses opposées
   - Sévérité typique: medium

3. date_conflict
   - Dates incohérentes pour un même événement juridique
   - Exemple: Date d'entrée en vigueur différente
   - Sévérité typique: high

4. legal_update
   - Texte abrogé ou modifié par un autre
   - Exemple: Une loi citée a été remplacée
   - Sévérité typique: critical

5. doctrine_vs_practice
   - Contradiction entre doctrine et jurisprudence
   - Exemple: Position doctrinale vs arrêt de la Cour de Cassation
   - Sévérité typique: low à medium

6. cross_reference_error
   - Référence croisée incorrecte
   - Exemple: Article cité qui n'existe pas ou dit autre chose
   - Sévérité typique: high

NIVEAUX DE SÉVÉRITÉ:
- low: Écart mineur, n'affecte pas la validité du contenu
- medium: Contradiction notable, peut induire en erreur
- high: Contradiction importante, risque d'erreur juridique
- critical: Contradiction majeure, l'un des contenus est probablement invalide

ANALYSE REQUISE:
1. Identifier les points de comparaison (références, dates, règles, montants)
2. Détecter les divergences
3. Évaluer la sévérité
4. Suggérer une résolution

FORMAT DE RÉPONSE (JSON strict):
{
  "has_contradiction": boolean,

  "contradictions": [
    {
      "contradiction_type": string,
      "severity": "low" | "medium" | "high" | "critical",
      "description": string,
      "source_excerpt": string,
      "target_excerpt": string,
      "legal_impact": string | null,
      "suggested_resolution": string,
      "affected_references": [
        {
          "type": string,
          "reference": string
        }
      ]
    }
  ],

  "similarity_score": number (0.0-1.0),
  "overall_severity": "none" | "low" | "medium" | "high" | "critical",
  "analysis_notes": string
}`

export const CONTRADICTION_DETECTION_USER_PROMPT = `Compare les deux textes juridiques suivants et détecte les contradictions:

=== TEXTE SOURCE ===
URL: {source_url}
Titre: {source_title}
Date: {source_date}
Contenu:
{source_content}

=== TEXTE CIBLE ===
URL: {target_url}
Titre: {target_title}
Date: {target_date}
Contenu:
{target_content}

Analyse les divergences et contradictions entre ces deux textes.
Retourne le résultat au format JSON spécifié.`

// ============================================================================
// PROMPT RECHERCHE DOCUMENTS SIMILAIRES
// ============================================================================

export const SIMILARITY_ANALYSIS_SYSTEM_PROMPT = `Tu es un expert en analyse de similarité de documents juridiques.

MISSION: Analyser la similarité entre un document source et des documents candidats pour identifier:
1. Les doublons potentiels
2. Les versions différentes du même texte
3. Les documents traitant du même sujet avec potentiel conflit

CRITÈRES D'ANALYSE:
- Sujet juridique traité
- Références légales citées
- Date et contexte temporel
- Terminologie utilisée
- Structure du document

IDENTIFICATION DES CONFLITS POTENTIELS:
Un conflit est potentiel si:
- Même référence légale avec interprétation différente
- Même sujet avec conclusions divergentes
- Dates incohérentes pour les mêmes événements
- Versions différentes d'un même texte

FORMAT DE RÉPONSE (JSON strict):
{
  "similar_documents": [
    {
      "candidate_index": number,
      "similarity_score": number (0.0-1.0),
      "potential_conflict": boolean,
      "conflict_reason": string | null,
      "relationship": "duplicate" | "version" | "related" | "different"
    }
  ]
}`

export const SIMILARITY_ANALYSIS_USER_PROMPT = `Analyse la similarité entre le document source et les candidats:

=== DOCUMENT SOURCE ===
Titre: {source_title}
Domaine: {source_domain}
Contenu:
{source_content}

=== DOCUMENTS CANDIDATS ===
{candidates}

Pour chaque candidat, évalue la similarité et le potentiel de conflit.
Retourne le résultat au format JSON spécifié.`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Remplace les placeholders dans un template de prompt
 */
export function formatPrompt(template: string, variables: Record<string, string | undefined>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }
  return result
}

/**
 * Truncate le contenu pour respecter les limites de tokens
 */
export function truncateContent(content: string, maxChars: number = 8000): string {
  if (content.length <= maxChars) return content

  // Couper proprement sur un espace
  const truncated = content.substring(0, maxChars)
  const lastSpace = truncated.lastIndexOf(' ')
  return truncated.substring(0, lastSpace) + '\n\n[... contenu tronqué ...]'
}
