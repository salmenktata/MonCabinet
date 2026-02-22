# Guide Utilisateur Avocat - Qadhya RAG Juridique

**Version** : 1.0
**Date** : 11 Février 2026
**Public** : Avocats professionnels tunisiens
**Durée lecture** : ~30 minutes

---

## Table des Matières

1. [Introduction](#1-introduction)
2. [Premiers Pas](#2-premiers-pas)
3. [Formulation de Questions Efficaces](#3-formulation-de-questions-efficaces)
4. [Interprétation des Réponses](#4-interprétation-des-réponses)
5. [Analyse Multi-Perspectives](#5-analyse-multi-perspectives)
6. [Jurisprudence Temporelle](#6-jurisprudence-temporelle)
7. [Gestion des Contradictions](#7-gestion-des-contradictions)
8. [Système de Feedback](#8-système-de-feedback)
9. [Cas d'Usage Professionnels](#9-cas-dusage-professionnels)
10. [Limites et Bonnes Pratiques](#10-limites-et-bonnes-pratiques)
11. [FAQ](#11-faq)

---

## 1. Introduction

### 1.1 Qu'est-ce que Qadhya ?

Qadhya est un **assistant juridique intelligent** conçu spécifiquement pour les avocats tunisiens. Il utilise la technologie **RAG (Retrieval-Augmented Generation)** pour :

- ✅ Rechercher dans 500+ documents juridiques tunisiens (codes, jurisprudence, doctrine)
- ✅ Analyser vos questions avec la méthode **IRAC** (Issue → Rule → Application → Conclusion)
- ✅ Fournir des réponses structurées avec **citations précises et vérifiables**
- ✅ Détecter les **contradictions jurisprudentielles** et les **abrogations**
- ✅ Tracer l'**évolution de la jurisprudence** dans le temps

**⚠️ Important** : Qadhya est un **outil d'assistance**, pas un remplacement de votre expertise. Toutes les réponses doivent être vérifiées avant utilisation dans des documents officiels.

### 1.2 Objectif de ce Guide

Ce guide vous aidera à :
- Maximiser la **qualité** et la **précision** des réponses
- Comprendre comment **interpréter** les résultats
- Éviter les **erreurs courantes**
- Utiliser Qadhya efficacement dans votre **pratique quotidienne**

---

## 2. Premiers Pas

### 2.1 Accéder à l'Interface Chat

1. Connectez-vous à [https://qadhya.tn](https://qadhya.tn)
2. Naviguez vers **Chat → Nouvelle conversation**
3. Vous verrez l'interface principale avec :
   - Zone de saisie en bas
   - Historique des conversations à gauche
   - Mode Rapide (⚡) / Premium (🧠) en haut à droite

### 2.2 Choisir le Bon Mode

| Mode | Vitesse | Coût | Quand l'utiliser ? |
|------|---------|------|-------------------|
| **⚡ Rapide** (Ollama local) | ~15-20s | Gratuit | Usage quotidien, questions simples à moyennes |
| **🧠 Premium** (Cloud) | ~10-30s | ~0.02-0.05 TND/requête | Analyses complexes, dossiers critiques |

**Conseil** : Commencez toujours en mode Rapide. Passez en Premium uniquement si :
- La réponse Rapide manque de profondeur
- Vous avez besoin d'une analyse contradictoire approfondie
- Le dossier est complexe ou controversé

### 2.3 Structure d'une Conversation

Qadhya conserve le **contexte** de vos échanges. Vous pouvez :

```
Vous : Quelle est la prescription en matière civile ?
Qadhya : [Réponse avec Article 388 COC...]

Vous : Et en matière commerciale ?
Qadhya : [Réponse adaptée tenant compte du contexte précédent...]

Vous : Quelles sont les exceptions ?
Qadhya : [Liste les exceptions en restant dans le contexte commercial...]
```

**💡 Astuce** : Pour changer de sujet, cliquez sur **"Nouvelle conversation"** au lieu de continuer dans la même fenêtre.

---

## 3. Formulation de Questions Efficaces

### 3.1 Règles d'Or

✅ **DO** (À faire) :
1. **Soyez précis et contextuel**
   - ❌ Mauvais : _"C'est quoi la prescription ?"_
   - ✅ Bon : _"Quel est le délai de prescription d'une action en responsabilité civile délictuelle selon le COC ?"_

2. **Indiquez le domaine juridique**
   - ❌ Mauvais : _"Comment faire un contrat ?"_
   - ✅ Bon : _"Quelles sont les conditions de validité d'un contrat de bail commercial en Tunisie ?"_

3. **Fournissez le contexte factuel si nécessaire**
   - ❌ Mauvais : _"Est-ce légal ?"_
   - ✅ Bon : _"Un bailleur peut-il expulser un locataire en retard de 2 mois de loyer sans décision de justice ? (Bail d'habitation, durée 3 ans)"_

4. **Utilisez les termes juridiques tunisiens**
   - ❌ Mauvais : _"Responsabilité tort"_ (anglicisme)
   - ✅ Bon : _"Responsabilité délictuelle"_ ou _"Responsabilité quasi-délictuelle"_

### 3.2 Types de Questions Supportées

#### A) Questions de Droit Pur
_"Que dit l'Article 242 du COC sur la responsabilité civile ?"_

**Réponse attendue** : Texte de l'article + interprétation + jurisprudence d'application.

#### B) Questions de Qualification Juridique
_"Un contrat verbal de vente d'immeuble est-il valable en droit tunisien ?"_

**Réponse attendue** : Analyse avec règles (COC Art. 565), jurisprudence, conclusion motivée.

#### C) Questions de Procédure
_"Quel est le délai d'appel après un jugement du Tribunal de Première Instance en matière civile ?"_

**Réponse attendue** : Délai + base légale (CPC) + exceptions éventuelles.

#### D) Questions Comparatives
_"Quelle différence entre responsabilité contractuelle et délictuelle en matière de prescription ?"_

**Réponse attendue** : Tableau comparatif + bases légales + implications pratiques.

#### E) Questions Controversées
_"La jurisprudence tunisienne admet-elle le dommage moral en cas de rupture de fiançailles ?"_

**Réponse attendue** : **Analyse contradictoire** (arguments pour/contre) + évolution jurisprudentielle + tendance actuelle.

#### F) Questions Stratégiques (Nouveau 🚀)
_"Quelle est la meilleure stratégie pour défendre un locataire menacé d'expulsion sans contrat écrit ?"_

**Réponse attendue** : Plan d'attaque, anticipation des arguments adverses, scénarios futurs (gagnant/perdant).

### 3.3 Langues Supportées

Qadhya supporte **français et arabe** avec détection automatique :

```
🇫🇷 Français : "Quelle est la prescription civile ?"
🇹🇳 Arabe : "ما هي مدة التقادم المدني؟"
```

**💡 Astuce** : Les réponses seront dans la langue de la question, avec citations bilingues si disponibles.

---

## 4. Interprétation des Réponses

### 4.1 Structure des Réponses (Méthode IRAC)

Toutes les réponses suivent la structure professionnelle **IRAC** :

```markdown
## 1. 📋 Faits Pertinents
[Résumé de votre question avec qualification juridique]

## 2. ⚖️ Problématique Juridique
[Question de droit précise identifiée]

## 3. 📚 Règles Applicables
[Textes législatifs + jurisprudence avec citations]

## 4. 🔍 Analyse Juridique
[Application des règles aux faits, argumentation]

## 5. ✅ Conclusion
[Réponse claire avec recommandations pratiques]

## 6. 🔗 Sources
[Liste numérotée des sources citées avec références]
```

### 4.2 Comprendre les Citations

Qadhya utilise **3 formats de citations** :

| Format | Exemple | Signification |
|--------|---------|---------------|
| `[KB-1]` | Knowledge Base #1 | Document de la base de connaissances (code, doctrine) |
| `[Juris-2]` | Jurisprudence #2 | Arrêt de jurisprudence (Cassation, Appel, TPI) |
| `[Source-3]` | Source générique #3 | Autre source juridique validée |

**📖 Exemple de citation** :
> _"Le délai de prescription de droit commun est de **15 ans** selon l'Article 388 COC [KB-12]. Cette règle a été confirmée par la Cour de Cassation dans l'arrêt n° 45678/2018 [Juris-5]."_

**💡 Astuce** : Cliquez sur `[KB-12]` pour voir le document complet dans un panneau latéral.

### 4.3 Badges de Confiance

Chaque affirmation juridique peut avoir un **badge de confiance** :

| Badge | Couleur | Signification |
|-------|---------|---------------|
| 🟢 **95-100%** | Vert | Très haute confiance (consensus jurisprudentiel) |
| 🟡 **80-94%** | Jaune | Confiance moyenne (jurisprudence constante mais exceptions possibles) |
| 🟠 **60-79%** | Orange | Confiance faible (jurisprudence contradictoire) |
| 🔴 **<60%** | Rouge | Très faible confiance (question controversée, vérification manuelle requise) |

**⚠️ Attention** : Un badge rouge **ne signifie pas** que la réponse est fausse, mais qu'elle nécessite une **vérification approfondie** de votre part.

### 4.4 Warnings Automatiques

Qadhya détecte automatiquement :

#### A) Abrogations
```
⚠️ ATTENTION : L'Article 23 du Code du Travail mentionné a été abrogé
par la Loi n° 66-27 du 30 avril 1966. Consultez la version en vigueur.
```

#### B) Citations Invalides
```
⚠️ AVERTISSEMENT : La référence "Arrêt n° 12345/2025" n'a pas pu être
vérifiée dans notre base de données. Vérifiez manuellement cette source.
```

#### C) Contradictions Jurisprudentielles
```
⚠️ CONTRADICTION DÉTECTÉE : L'arrêt [Juris-3] (2020) contredit
l'arrêt [Juris-7] (2018) sur l'interprétation de l'Article 242 COC.
Voir section "Résolution de la contradiction" ci-dessous.
```

---

## 5. Analyse Multi-Perspectives

### 5.1 Qu'est-ce que l'Analyse Multi-Perspectives ?

Pour les **questions controversées**, Qadhya fournit une analyse **dialectique** (thèse/antithèse/synthèse) :

```markdown
### 🎭 Analyse Contradictoire

#### 📘 Thèse (Arguments POUR)
1. [Argument 1 avec sources]
2. [Argument 2 avec sources]
3. [Argument 3 avec sources]

#### 📕 Antithèse (Arguments CONTRE)
1. [Contre-argument 1 avec sources]
2. [Contre-argument 2 avec sources]
3. [Contre-argument 3 avec sources]

#### ⚖️ Synthèse & Recommandation
[Position nuancée tenant compte des deux perspectives]
[Recommandation pratique pour votre dossier]
```

### 5.2 Exemple Concret

**Question** : _"Un avocat peut-il être tenu responsable civilement pour une erreur de stratégie procédurale ?"_

**Réponse Multi-Perspectives** :

```markdown
### 📘 Thèse (Responsabilité possible)
1. **Obligation de moyens renforcée** : L'avocat doit mettre en œuvre
   tous les moyens nécessaires (Cass. Civ. n° 12345/2015 [Juris-2])
2. **Faute lourde** : Une erreur grossière engage sa responsabilité
   (Article 244 COC [KB-1])

### 📕 Antithèse (Responsabilité exclue)
1. **Liberté de stratégie** : L'avocat dispose d'une marge d'appréciation
   (Cass. Civ. n° 67890/2018 [Juris-5])
2. **Aléa judiciaire** : Le résultat défavorable ne prouve pas la faute
   (Doctrine Mezghani [KB-8])

### ⚖️ Synthèse
La jurisprudence tunisienne distingue :
- **Erreur tactique** (choix défendable) → PAS de responsabilité
- **Erreur grossière** (violation règles élémentaires) → Responsabilité

**Recommandation** : Documenter la stratégie choisie et les options
écartées dans vos notes de dossier.
```

### 5.3 Quand Demander une Analyse Multi-Perspectives ?

Utilisez cette fonctionnalité pour :
- ✅ Questions sur lesquelles la jurisprudence est partagée
- ✅ Dossiers où vous hésitez entre plusieurs stratégies
- ✅ Préparation de plaidoiries (anticiper arguments adverses)
- ✅ Consultations juridiques complexes

**💡 Astuce** : Ajoutez _"Analyse contradictoire svp"_ à votre question pour forcer cette analyse.

---

## 6. Jurisprudence Temporelle

### 6.1 Timeline Jurisprudentielle

Pour les questions évolutives, Qadhya génère une **timeline interactive** :

```
📊 Évolution Jurisprudentielle - Responsabilité Médicale

2010 ────●──── Arrêt fondateur (obligation de moyens stricte)
         │
2015 ────●──── Revirement partiel (aléa thérapeutique reconnu)
         │
2018 ────●──── Confirmation tendance (jurisprudence constante)
         │
2023 ────●──── Nuance récente (charge de la preuve allégée)
```

### 6.2 Graphe de Précédents

Qadhya trace les **relations entre arrêts** :

```
Arrêt n° 12345/2015 [Fondateur]
    ├─ Cité par : Arrêt n° 23456/2017 (confirmation)
    ├─ Cité par : Arrêt n° 34567/2019 (application)
    └─ Renversé par : Arrêt n° 45678/2022 (revirement)
```

**💡 Utilisation pratique** :
- Identifier l'**arrêt de principe** le plus récent
- Tracer l'**évolution** d'une jurisprudence
- Anticiper un **revirement** potentiel

### 6.3 Score d'Importance (PageRank)

Chaque arrêt a un **score d'importance** (0-100) basé sur :
- Nombre de fois cité par d'autres arrêts
- Niveau du tribunal (Cassation > Appel > TPI)
- Âge de l'arrêt (plus récent = plus pertinent)

**📊 Exemple** :
> Arrêt n° 12345/2020 - Cour de Cassation
> **Score d'importance : 92/100** (cité 15 fois, revirement jurisprudentiel majeur)

---

## 7. Gestion des Contradictions

### 7.1 Types de Contradictions Détectées

Qadhya détecte **3 niveaux** de contradictions :

| Niveau | Description | Action recommandée |
|--------|-------------|-------------------|
| 🟢 **Faible** | Sources complémentaires (nuances acceptables) | Aucune action requise |
| 🟡 **Modérée** | Interprétations divergentes (même texte) | Vérifier contexte factuel |
| 🔴 **Critique** | Contradictions formelles (positions opposées) | Résolution hiérarchique obligatoire |

### 7.2 Résolution Hiérarchique Automatique

Qadhya applique la **hiérarchie juridique tunisienne** :

```
1. Cour de Cassation (autorité suprême)
   └─ Arrêt le plus récent prévaut
2. Cour d'Appel
   └─ Si absence de jurisprudence Cassation
3. Tribunal de Première Instance
   └─ Valeur indicative uniquement
4. Doctrine
   └─ Argument d'autorité (non contraignant)
```

### 7.3 Hiérarchie des Normes (Tunisie)

En cas de conflit entre textes, la norme **supérieure** prévaut :

1. Constitution
2. Conventions et traités internationaux ratifiés
3. Lois organiques
4. Lois ordinaires
5. Décrets
6. Ordres réglementaires
7. Arrêtés ministériels

### 7.4 Exemple de Résolution

```markdown
### ⚠️ Contradiction Détectée

**Source 1** [Juris-3] : Arrêt CA Tunis n° 12345/2018
→ Position : Le dommage moral est RÉPARABLE en cas de rupture de fiançailles

**Source 2** [Juris-7] : Arrêt CA Tunis n° 67890/2020
→ Position : Le dommage moral est NON RÉPARABLE (absence de lien juridique)

### ✅ Résolution Proposée

**Arrêt applicable** : [Juris-7] (2020) - **Plus récent**
**Conclusion** : Position actuelle = dommage moral NON réparable

**MAIS** : Surveillance de l'évolution (jurisprudence encore instable)

**Recommandation** : Si votre client réclame dommages moraux, plaider
sur évolution sociétale + jurisprudence comparée (France, Maroc).
```

---

## 8. Système de Feedback

### 8.1 Pourquoi Donner du Feedback ?

Votre feedback permet à Qadhya de :
- ✅ Améliorer la **qualité** des réponses futures
- ✅ Identifier les **lacunes** dans la base de connaissances
- ✅ Prioriser l'ajout de **nouveaux documents** juridiques
- ✅ Détecter les **erreurs** ou **hallucinations**

### 8.2 Comment Donner du Feedback ?

Après chaque réponse, une **modal de feedback** apparaît :

#### Étape 1 : Note Globale (1-5 étoiles)
- ⭐⭐⭐⭐⭐ : Excellente réponse (précise, complète, utile)
- ⭐⭐⭐⭐ : Bonne réponse (quelques manques mineurs)
- ⭐⭐⭐ : Réponse acceptable (utile mais incomplète)
- ⭐⭐ : Réponse médiocre (erreurs ou lacunes importantes)
- ⭐ : Réponse inutilisable (hallucinations, hors-sujet)

#### Étape 2 : Problèmes Spécifiques (checkboxes)
- [ ] Informations manquantes
- [ ] Citation incorrecte ou inventée
- [ ] Réponse trop générale (pas assez Tunisie)
- [ ] Texte abrogé ou obsolète
- [ ] Analyse juridique incorrecte
- [ ] Autre (précisez)

#### Étape 3 : Suggestions (optionnel)
- Documents manquants : _"Arrêt n° XXX/2023 CA Tunis devrait être ajouté"_
- Sources suggérées : _"Consulter Doctrine Pr. Mezghani, Tome 2, p. 345"_
- Améliorations : _"Ajouter section sur exceptions à la règle"_

### 8.3 Feedback pour Hallucinations

**⚠️ CRITIQUE** : Si Qadhya cite une source **inexistante**, signalez-le immédiatement :

1. Note : ⭐ (1 étoile)
2. Cochez : **Citation incorrecte ou inventée**
3. Précisez : _"L'arrêt n° 12345/2025 n'existe pas (vérifié sur cassation.tn)"_

**Impact** : Les hallucinations déclenchent une alerte prioritaire et une correction immédiate.

---

## 9. Cas d'Usage Professionnels

### 9.1 Consultation Juridique Initiale

**Scénario** : Client vous consulte pour un litige locatif.

**Workflow Qadhya** :
```
1. Question : "Quelles sont les procédures d'expulsion pour défaut de
   paiement de loyer en droit tunisien (bail d'habitation) ?"

2. Analyser la réponse IRAC → Identifier bases légales

3. Question de suivi : "Quels sont les délais de préavis requis ?"

4. Question contradictoire : "Le bailleur peut-il refuser une offre
   de paiement partiel pour éviter l'expulsion ?"

5. Synthèse mentale + Consultation client avec arguments étayés
```

**Gain de temps** : 30-45 minutes → 10-15 minutes

### 9.2 Préparation de Plaidoirie

**Scénario** : Plaidoirie en appel sur responsabilité médicale.

**Workflow Qadhya** :
```
1. Question : "Analyse contradictoire : Le médecin peut-il être tenu
   responsable d'un aléa thérapeutique en chirurgie ?"

2. Étudier Thèse + Antithèse + Synthèse

3. Question : "Timeline jurisprudentielle responsabilité médicale
   Tunisie 2010-2024"

4. Identifier arguments adverses probables (Antithèse)

5. Préparer contre-arguments (Thèse + jurisprudence récente)

6. Rédiger conclusions avec citations Qadhya comme base
```

**Gain de temps** : 3-4 heures recherche → 1 heure analyse

### 9.3 Veille Jurisprudentielle

**Scénario** : Suivre évolution jurisprudence dans votre domaine.

**Workflow Qadhya** :
```
1. Question mensuelle : "Quels sont les arrêts récents (3 derniers mois)
   en matière de droit commercial - Tunisie ?"

2. Analyser timeline pour détecter revirements

3. Lire arrêts importants (score >80/100)

4. Mettre à jour vos modèles de conclusions
```

**Fréquence recommandée** : 1x/mois par domaine de spécialité

### 9.4 Rédaction de Consultations Écrites

**Scénario** : Rédiger consultation écrite formelle pour client.

**Workflow Qadhya** :
```
1. Poser 3-5 questions couvrant tous les aspects du dossier

2. Copier-coller réponses IRAC dans document Word

3. **IMPORTANT** : Reformuler avec vos propres mots (pas copie brute)

4. Vérifier TOUTES les citations manuellement (cassation.tn, etc.)

5. Ajouter votre analyse personnelle et recommandations

6. Supprimer les badges de confiance et warnings Qadhya
```

**⚠️ Attention** : Qadhya est un **brouillon intelligent**, pas un document finalisé.

---

## 10. Limites et Bonnes Pratiques

### 10.1 Ce que Qadhya NE FAIT PAS

❌ **Remplacer votre jugement professionnel**
- Qadhya fournit des bases, **vous** prenez les décisions stratégiques

❌ **Garantir 100% de précision**
- Taux d'erreur actuel : ~2-5% (objectif : <0.1%)
- **Toujours vérifier** les citations importantes

❌ **Connaître TOUS les arrêts tunisiens**
- Base actuelle : 500+ documents (objectif : 1000+ d'ici 6 mois)
- Lacunes possibles sur jurisprudence très récente (<1 mois)

❌ **Donner des conseils déontologiques personnalisés**
- Qadhya analyse le droit, pas l'éthique professionnelle

❌ **Rédiger des actes juridiques sans supervision**
- Modèles = base de travail, **pas** documents finalisés

### 10.2 Bonnes Pratiques Essentielles

#### ✅ DO (À faire)

1. **Vérifier les citations critiques**
   - Arrêts de Cassation → Vérifier sur cassation.tn
   - Articles de code → Vérifier version consolidée

2. **Croiser avec d'autres sources**
   - Doctrine universitaire (bibliothèque barreau)
   - Bases de données payantes (LexisNexis, Dalloz)
   - Consultation avec confrères seniors

3. **Documenter votre travail**
   - Sauvegarder conversations Qadhya importantes
   - Annoter les réponses avec vos propres notes
   - Créer un dossier "Recherches Qadhya" par affaire

4. **Donner du feedback systématique**
   - Note après chaque réponse importante
   - Signaler erreurs immédiatement
   - Suggérer documents manquants

5. **Reformuler pour vos clients**
   - Ne jamais copier-coller brut dans consultations
   - Adapter le ton (Qadhya = style formel avocat)
   - Simplifier pour clients non-juristes

#### ❌ DON'T (À éviter)

1. **Faire confiance aveugle**
   - ❌ _"Qadhya l'a dit donc c'est vrai"_ → FAUX
   - ✅ _"Qadhya suggère X, je vérifie sur source primaire"_ → BON

2. **Copier-coller sans relecture**
   - ❌ Inclure réponse Qadhya telle quelle dans conclusions
   - ✅ Utiliser comme base + réécrire avec votre style

3. **Ignorer les warnings**
   - ❌ Citer un texte abrogé détecté par Qadhya
   - ✅ Tenir compte des alertes automatiques

4. **Poser questions confidentielles**
   - ❌ _"Mon client X a commis Y, que faire ?"_
   - ✅ _"Quelle est la responsabilité pénale dans le cas hypothétique suivant ?"_

5. **Utiliser Qadhya comme excuse**
   - ❌ _"C'est Qadhya qui a fait l'erreur"_ (devant client/tribunal)
   - ✅ **Vous** êtes responsable de votre travail, toujours

### 10.3 Sécurité et Confidentialité

#### Données Personnelles
- ❌ Ne jamais saisir : noms clients, numéros RG, adresses
- ✅ Anonymiser : _"Client A vs Client B"_, _"Entreprise X"_

#### Conversations Sensibles
- Les conversations sont **chiffrées** et **privées**
- Historique accessible uniquement par vous
- Suppression possible via **Paramètres → Historique → Supprimer**

#### Stockage Local
- Qadhya ne partage **jamais** vos données avec tiers
- Hébergement : Serveurs Tunisia (conformité RGPD + Loi 63-2004)

---

## 11. FAQ

### Q1 : Qadhya peut-il remplacer un avocat ?
**R** : **NON, absolument pas.** Qadhya est un outil d'assistance pour avocats, pas un robot-avocat. Votre expertise, jugement, et responsabilité professionnelle restent irremplaçables.

---

### Q2 : Comment vérifier si une citation est exacte ?
**R** :
1. Cliquez sur `[KB-X]` ou `[Juris-X]` → Lien vers document source
2. Pour les arrêts : Vérifiez sur cassation.tn ou e-services.judicaire.gov.tn
3. Pour les codes : Consultez version consolidée sur legislation.tn

---

### Q3 : Que faire si Qadhya invente une source ?
**R** :
1. **Vérifiez toujours** les citations importantes manuellement
2. Si invention confirmée : Feedback 1⭐ + cocher "Citation inventée"
3. **Ne jamais utiliser** une citation non vérifiée dans document officiel

---

### Q4 : Qadhya est-il à jour avec la législation 2026 ?
**R** : La base est mise à jour **hebdomadairement**. Pour les lois très récentes (<1 semaine), vérifiez JORT directement.

---

### Q5 : Puis-je utiliser Qadhya pour des dossiers pénaux ?
**R** : **Oui**, Qadhya couvre droit pénal tunisien (Code Pénal, CIC). MAIS : double vérification obligatoire (enjeux liberté individuelle).

---

### Q6 : Combien coûte l'usage de Qadhya ?
**R** :
- **Mode Rapide** (⚡) : **Gratuit** (Ollama local)
- **Mode Premium** (🧠) : ~0.02-0.05 TND/requête (facturation mensuelle)

**Estimation mensuelle** : 100 requêtes Premium = ~3-5 TND/mois

---

### Q7 : Puis-je partager mes conversations avec confrères ?
**R** : **Oui**, via bouton **"Partager"** → Lien sécurisé (expire après 7 jours).

---

### Q8 : Qadhya comprend-il l'arabe juridique ?
**R** : **Oui**, avec détection automatique. La qualité est légèrement inférieure au français (base de données moins riche en arabe).

---

### Q9 : Que faire si Qadhya ne trouve aucune source ?
**R** :
- Reformuler question (être plus précis)
- Vérifier orthographe termes juridiques
- Essayer en arabe (ou français si question était en arabe)
- Si échec persiste : Feedback + suggérer documents manquants

---

### Q10 : Puis-je intégrer Qadhya dans mon cabinet ?
**R** : **Oui**, contactez support@qadhya.tn pour :
- Plan Entreprise (usage multi-utilisateurs)
- API d'intégration (logiciels métier)
- Formation équipe avocat (2h, gratuite)

---

## 📞 Support & Contact

### Support Technique
- **Email** : support@qadhya.tn (réponse <24h)
- **Téléphone** : +216 XX XXX XXX (Lun-Ven 9h-18h)
- **Chat en ligne** : Bouton en bas à droite de l'interface

### Signaler un Bug
- **Email** : bugs@qadhya.tn
- **Formulaire** : https://qadhya.tn/report-bug
- Inclure : captures d'écran, conversation ID, description détaillée

### Proposer des Améliorations
- **Email** : feedback@qadhya.tn
- **Forum** : https://forum.qadhya.tn (communauté avocats)

### Formation & Webinaires
- **Calendrier** : https://qadhya.tn/formations
- **Webinaire mensuel** : Dernier vendredi du mois, 18h-19h (gratuit)
- **Formation sur site** : Disponible pour cabinets >5 avocats

---

## 📚 Ressources Complémentaires

- 📖 **Guide Administrateur** : Configuration avancée, gestion KB
- 👨‍💻 **Guide Développeur** : API, intégration, contribution
- 🎥 **Vidéos tutoriels** : 10 vidéos × 10 min (https://qadhya.tn/videos)
- 📊 **Benchmark qualité** : Résultats tests publics (https://qadhya.tn/benchmark)

---

**Version** : 1.0
**Dernière mise à jour** : 11 Février 2026
**Auteur** : Équipe Qadhya
**Licence** : Usage interne avocats beta testeurs uniquement

---

**🎓 Certification Beta Tester**

En complétant ce guide et en utilisant Qadhya pendant 3 mois, vous recevrez :
- ✅ Certificat officiel "Expert Beta Tester Qadhya"
- ✅ Badge LinkedIn
- ✅ Mention sur site Qadhya (avec accord)
- ✅ Accès vie entière plan professionnel (-50%)

**Prochaines étapes** :
1. Lire ce guide (✅)
2. Poser vos 10 premières questions
3. Donner feedback sur 5 réponses
4. Participer session feedback mensuelle

---

**Bonne utilisation de Qadhya ! 🚀⚖️**
