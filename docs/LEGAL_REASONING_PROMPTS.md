# Prompts Juridiques Structurés - Méthode IRAC

## Vue d'ensemble

Le système RAG de Qadhya utilise désormais des prompts juridiques structurés basés sur la **méthode IRAC** (Issue, Rule, Application, Conclusion), transformant l'assistant IA en avocat chevronné tunisien.

## Méthode IRAC

### Structure du Raisonnement Juridique

1. **I - Issue (Problématique)**
   - Reformulation des faits pertinents
   - Identification de la question juridique
   - Précision du domaine du droit concerné

2. **R - Rule (Règle)**
   - Citation des textes légaux applicables
   - Référence à la jurisprudence pertinente
   - Mention des principes doctrinaux

3. **A - Application (Analyse)**
   - Application des règles aux faits du cas
   - Explication du syllogisme juridique
   - Discussion des nuances et exceptions

4. **C - Conclusion**
   - Synthèse de la position juridique
   - Réponse directe à la question
   - Recommandations et points de vigilance

## Fichiers Concernés

### 1. `lib/ai/legal-reasoning-prompts.ts`

Définit trois prompts système :

```typescript
// Prompt de base avec méthode IRAC
export const LEGAL_REASONING_SYSTEM_PROMPT

// Prompt pour consultations juridiques formelles
export const CONSULTATION_SYSTEM_PROMPT

// Prompt pour chat conversationnel
export const CHAT_SYSTEM_PROMPT

// Prompt pour stratégie contentieuse (Offensif/Défensif)
export const STRATEGY_SYSTEM_PROMPT

// Fonction de sélection
export function getSystemPromptForContext(
  contextType: 'chat' | 'consultation' | 'structuration',
  language: 'ar' | 'fr'
): string
```

### 2. `lib/ai/rag-chat-service.ts`

Intégration des prompts structurés :

```typescript
// Dans answerQuestion()
const contextType: PromptContextType =
  options.contextType || (options.conversationId ? 'chat' : 'consultation')

const supportedLang: SupportedLanguage = questionLang === 'ar' ? 'ar' : 'fr'
const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang)
```

### 3. `lib/ai/config.ts`

Configuration par contexte :

```typescript
export const PROMPT_CONFIG = {
  chat: {
    maxTokens: 2000,
    temperature: 0.3,  // Plus créatif
    preferConcise: true,
  },
  consultation: {
    maxTokens: 4000,
    temperature: 0.1,  // Très précis
    preferConcise: false,
  },
  strategy: {
    maxTokens: 6000,
    temperature: 0.4,  // Créativité stratégique contrôlée
    preferConcise: false,
  }
}
```

## Utilisation

### Dans le Code

#### 1. Chat Conversationnel (`/assistant-ia`)

```typescript
import { answerQuestion } from '@/lib/ai/rag-chat-service'

const response = await answerQuestion(question, userId, {
  conversationId: conversationId,
  contextType: 'chat',  // Optionnel (par défaut si conversationId existe)
})
```

#### 2. Consultation Juridique (`/dossiers/consultation`)

```typescript
const response = await answerQuestion(question, userId, {
  dossierId: dossierId,
  contextType: 'consultation',  // Optionnel (par défaut si pas de conversationId)
})
```

#### 3. Structuration de Dossier (`/dossiers/assistant`)

```typescript
const response = await answerQuestion(narrative, userId, {
  contextType: 'structuration',
})
```

### Détection Automatique

Si `contextType` n'est pas spécifié :
- **conversationId présent** → `contextType = 'chat'`
- **pas de conversationId** → `contextType = 'consultation'`

## Caractéristiques des Prompts

### Prompt Consultation (Formel)

- **Ton** : Professionnel, exhaustif, formel
- **Structure** : 6 sections complètes (I à VI)
- **Température** : 0.1 (très précis)
- **Max tokens** : 4000 (réponses détaillées)
- **Format** :
  ```
  📋 I. EXPOSÉ DES FAITS
  ⚖️ II. PROBLÉMATIQUE JURIDIQUE
  📚 III. RÈGLES DE DROIT APPLICABLES
  🔍 IV. ANALYSE JURIDIQUE
  ✅ V. CONCLUSION
  🔗 VI. SOURCES
  ```

### Prompt Chat (Conversationnel)

- **Ton** : Professionnel mais conversationnel
- **Structure** : IRAC complet mais concis
- **Température** : 0.3 (équilibré)
- **Max tokens** : 2000 (réponses plus courtes)
- **Interactivité** : Propose des questions de suivi
- **Contexte** : Garde la mémoire conversationnelle

### Prompt Structuration (Extraction)

- **Ton** : Objectif et factuel
- **Structure** : Extraction structurée
- **Température** : 0.1 (très précis)
- **Format** : JSON structuré
- **Sections** : Client, faits, parties, problématique, enjeux, preuves

## Style et Ton

### Caractéristiques Communes

1. **Identité Professionnelle**
   - Avocat tunisien chevronné (20 ans d'expérience)
   - Spécialiste du droit tunisien
   - Expertise reconnue

2. **Méthode de Raisonnement**
   - Structure IRAC systématique
   - Syllogisme juridique explicite
   - Arguments pour et contre

3. **Citations et Sources**
   - Format uniforme : `[Source-N]`, `[KB-N]`, `[Juris-N]`
   - Citation après chaque affirmation juridique
   - **JAMAIS** d'invention de sources

4. **Langage Bilingue**
   - Répond dans la langue de la question (AR/FR)
   - Terminologie juridique tunisienne officielle
   - Traductions bilingues pour références clés

5. **Prudence Juridique**
   - Utilise "il semble que", "selon la jurisprudence"
   - Mentionne les limites et incertitudes
   - Indique quand une expertise spécialisée est nécessaire

6. **Hiérarchie des Normes (Tunisie)**
   - Constitution
   - Conventions internationales ratifiées
   - Lois organiques
   - Lois ordinaires
   - Décrets
   - Ordres réglementaires
   - Arrêtés ministériels

## Format de Citations

### Articles de Loi

```
Article 123 du Code des Obligations et Contrats
(الفصل 123 من مجلة الالتزامات والعقود)
```

### Jurisprudence

```
Cour de Cassation (محكمة التعقيب),
Chambre Civile,
Arrêt n° 12345 du 15/01/2024
```

### Sources Documents

```
[Source-1] : Contrat de travail (Nom fichier)
[KB-2] : Article juridique sur le préavis
[Juris-3] : Arrêt Cassation n° 67890
```

## Métriques de Qualité

### Critères d'Évaluation

1. **Structure IRAC** : 100% des réponses doivent suivre la structure
2. **Citations sources** : 100% des affirmations juridiques sourcées
3. **Ton professionnel** : Évaluation qualitative (avocat chevronné)
4. **Précision juridique** : >95% de réponses correctes

### Tests Prévus (Phase 1)

- 20 questions juridiques variées (civil, commercial, pénal, famille)
- Tests bilingues (10 AR, 10 FR)
- Tests comparatifs (ancien vs nouveau prompt)
- Évaluation aveugle par avocats

## Migration depuis Anciens Prompts

### Changements Majeurs

1. **Avant** : Prompt générique "Qadhya assistant"
   - Pas de structure imposée
   - Ton IA générique
   - Réponses courtes sans méthodologie

2. **Après** : Prompts juridiques structurés
   - Méthode IRAC systématique
   - Ton avocat chevronné
   - Raisonnement juridique explicite
   - Adaptation selon contexte (chat vs consultation)

### Compatibilité

- ✅ **Conservée** : Format citations `[Source-N]`
- ✅ **Conservée** : Support bilingue AR/FR
- ✅ **Conservée** : Interface `answerQuestion()`
- ✅ **Ajoutée** : Option `contextType` dans `ChatOptions`

### Rollback

En cas de problème, restaurer :
```typescript
// Dans rag-chat-service.ts, remplacer:
const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang)

// Par:
const baseSystemPrompt = SYSTEM_PROMPTS.qadhya
```

## Logs et Monitoring

### Logs Ajoutés

```typescript
console.log(`[RAG] Utilisation du prompt structuré: contextType=${contextType}, langue=${supportedLang}`)
```

### Métriques à Surveiller

- Distribution `contextType` : chat vs consultation vs structuration
- Distribution langue : ar vs fr
- Temps de réponse par contexte
- Taux de satisfaction utilisateurs

## Prochaines Étapes

1. **Phase 1 : Tests Qualité** (Tâche #3)
   - 20 questions test
   - Évaluation structure IRAC
   - Validation citations sources

2. **Phase 2 : Métadonnées Structurées** (Tâches #4-5)
   - Extraction métadonnées juridiques
   - Enrichissement contexte RAG

3. **Phase 3 : RAG Enrichi** (Tâches #6-7)
   - Filtres juridiques (tribunal, domaine, date)
   - Navigation graphe juridique

## Références

- **Méthode IRAC** : [Legal Writing - IRAC Method](https://en.wikipedia.org/wiki/IRAC)
- **Raisonnement Juridique** : Structure syllogistique du droit
- **Droit Tunisien** : COC, CSP, CPC, Code Commerce, Code Travail

## Support

Pour questions ou problèmes :
- Consulter logs : `console.log` dans `rag-chat-service.ts`
- Vérifier configuration : `PROMPT_CONFIG` dans `config.ts`
- Tester prompts : `getSystemPromptForContext()` dans `legal-reasoning-prompts.ts`
