# Phase 3.1 - Sources Rapides & Accessibles

## 🎯 Stratégie
Extraire 10-15 abrogations en 1-2h depuis des sources HTML accessibles (pas de PDF bloqué).

---

## 📚 Sources Prioritaires

### 1. JurisiteTunisie.com - Codes HTML ⭐⭐⭐
**Avantage** : Codes complets en HTML, notes historiques visibles
**Temps** : 30-45 min pour 5-8 abrogations

#### Codes Disponibles
- Code du Travail : https://www.jurisitetunisie.com/tunisie/codes/ct/menu.html
- Code des Sociétés Commerciales : https://www.jurisitetunisie.com/tunisie/codes/csc/menu.html
- Code des Obligations et Contrats : https://www.jurisitetunisie.com/tunisie/codes/coc/menu.html
- Code de Commerce : https://www.jurisitetunisie.com/tunisie/codes/ccom/menu.html

#### Méthode
1. Naviguer vers "Dispositions transitoires" (fin de chaque code)
2. Chercher articles avec notes "abrogé par"
3. Clic droit → Copier texte
4. Extraction directe dans CSV

#### Abrogations Probables
- **Code du Travail** : Lois sociales des années 1960-1980 abrogées
- **Code Sociétés** : Anciennes formes juridiques abrogées (SARL ancien régime)
- **COC** : Articles modifiés par code consommation

---

### 2. 9anoun.tn - Articles Individuels ⭐⭐
**Avantage** : Chaque article a sa page, historique modifications visible
**Temps** : 45-60 min pour 5-7 abrogations

#### Exemples URLs
- Code Travail Art 1 : https://9anoun.tn/kb/codes/code-travail/code-travail-article-1
- Code Pénal Art 1 : https://9anoun.tn/kb/codes/code-penal/code-penal-article-1

#### Méthode
1. Chercher codes avec tag "consolidé"
2. Naviguer vers articles finaux (dispositions transitoires)
3. Lire notes : "Abrogé par loi n°..."
4. Extraction dans CSV

---

### 3. Codes avec Dispositions Transitoires Riches ⭐

#### A. Code de la Consommation (2022)
**URL** : https://9anoun.tn/kb/codes/code-consommation
**Pourquoi** : Nouveau code → abroge anciens textes consommation
**Abrogations attendues** : 5-10
**Temps** : 30 min

**Rechercher** :
- Article final "Dispositions abrogées"
- Lois protection consommateur pré-2022
- Décrets anciens sur publicité, garanties

#### B. Code de l'Assurance
**URL** : Chercher sur 9anoun.tn ou jurisitetunisie.com
**Pourquoi** : Secteur réformé multiple fois
**Abrogations attendues** : 3-5
**Temps** : 20 min

---

## 🚀 Plan d'Action Rapide (1-2h)

### Phase 1 : JurisiteTunisie - Code du Travail (30 min)
**Objectif** : 5 abrogations

**Actions** :
1. Ouvrir https://www.jurisitetunisie.com/tunisie/codes/ct/menu.html
2. Aller section "Dispositions transitoires"
3. Chercher CTRL+F : "abrogé", "modifié par"
4. Extraire dans CSV template

**CSV** : `phase3.1-code-travail.csv`

### Phase 2 : 9anoun.tn - Code Consommation (30 min)
**Objectif** : 5-7 abrogations

**Actions** :
1. Ouvrir https://9anoun.tn/kb/codes/code-consommation
2. Naviguer vers derniers articles
3. Chercher "Sont abrogées", "ملغاة"
4. Extraire dans CSV

**CSV** : `phase3.1-code-consommation.csv`

### Phase 3 : Code Sociétés Commerciales (30 min)
**Objectif** : 3-5 abrogations

**Actions** :
1. Chercher sur JurisiteTunisie ou 9anoun.tn
2. Focus : Anciennes formes juridiques (SARL pré-2000)
3. Extraction CSV

**CSV** : `phase3.1-code-societes.csv`

---

## 📋 Template CSV Universel

```csv
abrogated_reference,abrogated_reference_ar,abrogating_reference,abrogating_reference_ar,abrogation_date,scope,affected_articles,jort_url,source_url,notes,domain,verified
```

**Domaines** :
- Code Travail → `domain=legislation`
- Code Consommation → `domain=codes`
- Code Sociétés → `domain=codes`

---

## 🎯 Abrogations Connues à Chercher

### Code du Travail
- **Loi n°1966-27** (ancien code travail) → Abrogée partiellement
- **Ordonnances années 1970** → Remplacées par code actuel

### Code Consommation (2022)
- **Loi n°1992-117** (protection consommateur) → Abrogée totalement
- **Décrets 1990s** sur publicité → Abrogés

### Code Sociétés Commerciales
- **Loi n°1988-47** (SARL ancien régime) → Modifiée/abrogée
- **Décrets années 1960** → Remplacés

---

## ✅ Checklist Exécution

### Avant de commencer
- [ ] CSV template prêt
- [ ] Tunnel SSH prod actif (`npm run tunnel:start`)
- [ ] Script import testé

### Pendant extraction
- [ ] Timer 30 min par code
- [ ] Minimum 3 abrogations par code
- [ ] Vérifier traductions arabes

### Après extraction
- [ ] Comptage : Minimum 10 abrogations totales
- [ ] Import : `npx tsx scripts/import-abrogations-phase3.1.ts --production [fichier.csv]`
- [ ] Vérification : Total abrogations DB

---

## 📊 ROI Estimation

| Source | Temps | Abrogations | Efficacité |
|--------|-------|-------------|------------|
| Code Travail (Jurisite) | 30 min | 5 | 10 abr/h |
| Code Consommation (9anoun) | 30 min | 7 | 14 abr/h |
| Code Sociétés | 30 min | 3 | 6 abr/h |
| **TOTAL** | **1h30** | **15** | **10 abr/h** |

**vs CGI manuel** : 2-3h pour 15-20 abrogations = 5-7 abr/h

**Verdict** : Sources HTML **2x plus rapides** que extraction manuelle PDF

---

## 🚨 Backup Plan

Si sources HTML inaccessibles ou peu productives :

### Plan B : Lois de Finances Antérieures
- LF 2019 : Chercher abrogations fiscales
- LF 2018 : Réformes investissement
- LF 2017 : Nombreuses abrogations avantages fiscaux

**Méthode** : Résumés Web (pas PDFs)
- chaexpert.com
- proservy.com
- paie-tunisie.com

**Temps** : 1h pour 5-8 abrogations

---

**Prêt à exécuter ! 🚀**

Commencer par Phase 1 (Code du Travail - JurisiteTunisie)
