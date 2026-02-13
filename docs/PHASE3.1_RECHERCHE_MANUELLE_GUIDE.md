# Phase 3.1 - Guide Recherche Manuelle Abrogations Fiscales

## 🎯 Objectif
Extraire 20-30 abrogations fiscales vérifiées pour atteindre 100+ abrogations totales.

**État actuel** : 10 abrogations
**Objectif** : 100+ abrogations
**Gap** : ~90 abrogations

## 📚 Sources Prioritaires

### 1. Lois de Finances (2020-2025)

**Sources** :
- https://legislation.tn (section Lois de Finances)
- https://9anoun.tn/kb/codes/loi-finances-*

**Documents à consulter** :
- Loi de Finances 2025
- Loi de Finances 2024
- Loi de Finances 2023
- Loi de Finances 2022
- Loi de Finances 2021
- Loi de Finances 2020
- Lois de Finances Complémentaires (LFC)

**Sections clés** :
- Dispositions finales
- Articles "Sont abrogées..."
- Articles modificatifs de codes fiscaux
- Annexes fiscales

**Pattern recherche** :
```
- "sont abrogées"
- "est abrogée"
- "abroge les dispositions"
- "ملغاة"
- "ألغيت"
```

### 2. Code Général des Impôts (CGI)

**Source** : https://9anoun.tn/kb/codes/code-general-des-impots

**Sections clés** :
- Dispositions transitoires et finales
- Articles modificatifs
- Notes en bas de page mentionnant les abrogations

**Méthode** :
1. Télécharger le PDF/HTML complet
2. Recherche CTRL+F : "abroge", "abrogée", "ملغى"
3. Identifier les lois abrogées et les lois abrogatrices

### 3. Textes JORT Fiscaux

**Source** : http://www.legislation.tn/fr/jort

**Période** : 2020-2026

**Recherche** :
- Décrets fiscaux
- Arrêtés fiscaux modifiant ou abrogeant
- Décrets-lois période transitoire (2011-2014)

**Mots-clés** :
- "régime fiscal"
- "code des impôts"
- "fiscalité"
- "taxe"
- "TVA"
- "impôt"

### 4. Code des Changes 2024

**Source** : https://9anoun.tn/kb/codes/projet-code-des-changes-2024

**Document clé** : Article 53 - Dispositions finales

**Contenu** :
```
"Sont abrogées, toutes dispositions antérieures contraires ou faisant
double emploi avec celles dudit code et notamment les textes suivants :

- Loi n°76-18 du 21 janvier 1976
- Décret n°77-608 du 27 juillet 1977
- Article 54 de la loi n°2014-54 du 19 août 2014
- Décret gouvernemental n°2017-1366 du 5 décembre 2017
- Décret gouvernemental n°2018-593 du 11 juillet 2018"
```

**✅ Déjà extrait** : 5 abrogations (voir phase3.1-extraction-manuelle.csv)

## 📋 Template CSV pour Extraction

**Fichier** : `data/abrogations/phase3.1-recherche-manuelle-[source].csv`

**Colonnes** :
```csv
abrogated_reference,abrogated_reference_ar,abrogating_reference,abrogating_reference_ar,abrogation_date,scope,affected_articles,jort_url,source_url,notes,domain,verified
```

**Exemple** :
```csv
"Loi n°2020-45","القانون عدد 2020-45","Loi n°2021-54","القانون عدد 2021-54",2021-12-30,total,,,https://legislation.tn/...,Ancien régime fiscal simplifié,fiscal,true
```

### Valeurs `scope`
- `total` : Abrogation complète
- `partial` : Abrogation partielle (préciser articles dans `affected_articles`)
- `implicit` : Abrogation implicite (incompatibilité)

### Valeurs `domain`
- `fiscal` : Fiscalité, impôts, taxes
- `codes` : Codes généraux (CGI, Code des Changes)
- `legislation` : Lois générales
- `presse` : Code de la Presse

### Valeurs `verified`
- `true` : Vérification croisée (JORT + source officielle)
- `false` : À vérifier

## 🔍 Méthodologie de Recherche

### Étape 1 : Scan Initial (30 min)
1. Ouvrir https://legislation.tn
2. Naviguer vers "Lois de Finances" → dernières 5 années
3. Pour chaque loi, chercher section "Dispositions finales"
4. Noter tous les articles mentionnant des abrogations

### Étape 2 : Extraction Détaillée (1-2h)
1. Pour chaque abrogation identifiée :
   - Référence texte abrogé (FR + AR)
   - Référence texte abrogateur (FR + AR)
   - Date d'abrogation (date JORT ou date effet)
   - Portée (totale/partielle)
   - Articles concernés si partiel
   - URL JORT si disponible
   - Notes explicatives

### Étape 3 : Vérification Croisée (30 min)
1. Pour chaque abrogation, vérifier sur au moins 2 sources :
   - legislation.tn
   - JORT officiel
   - 9anoun.tn

### Étape 4 : Import (10 min)
```bash
npx tsx scripts/import-abrogations-phase3.1.ts --production phase3.1-recherche-manuelle-[source].csv
```

## 📊 Suivi des Extractions

### Session 1 - Code des Changes 2024 ✅
- **Date** : 2026-02-13
- **Source** : 9anoun.tn Article 53
- **Résultat** : 5 abrogations
- **Fichier** : `phase3.1-extraction-manuelle.csv`
- **Importé** : ✅ Production

### Session 2 - Lois de Finances 2020-2025 🔄
- **Date** : À planifier
- **Source** : legislation.tn
- **Estimation** : 15-25 abrogations
- **Fichier** : `phase3.1-lois-finances.csv`

### Session 3 - Code Général Impôts 🔄
- **Date** : À planifier
- **Source** : 9anoun.tn CGI
- **Estimation** : 10-15 abrogations
- **Fichier** : `phase3.1-cgi.csv`

### Session 4 - Textes JORT Fiscaux 🔄
- **Date** : À planifier
- **Source** : legislation.tn JORT
- **Estimation** : 10-15 abrogations
- **Fichier** : `phase3.1-jort-fiscal.csv`

## 🎯 Prochaines Actions

**Immédiat** :
1. ✅ Créer guide recherche manuelle (ce document)
2. 🔄 Session 2 : Extraire Lois de Finances 2020-2025
3. ⏸️ Session 3 : Extraire CGI
4. ⏸️ Session 4 : Extraire JORT fiscal

**Timeline estimée** :
- Session 2 : 2-3h
- Session 3 : 1-2h
- Session 4 : 1-2h
- **Total** : 4-7h pour atteindre 50-60 abrogations
- **Itérations supplémentaires** : Selon besoin pour atteindre 100+

## 🔗 Liens Utiles

- **Legislation.tn** : http://www.legislation.tn/fr
- **9anoun.tn** : https://9anoun.tn
- **JORT Officiel** : http://www.iort.gov.tn
- **Table abrogations prod** : `/api/admin/legal-abrogations`

## ✅ Checklist Qualité

Pour chaque abrogation extraite :
- [ ] Référence abrogée complète (numéro + année)
- [ ] Référence abrogatrice complète
- [ ] Date d'abrogation (YYYY-MM-DD)
- [ ] Portée clairement définie (total/partial/implicit)
- [ ] Si partiel : liste articles concernés
- [ ] Traduction arabe cohérente
- [ ] URL source vérifiable
- [ ] Notes explicatives claires
- [ ] Vérification croisée 2+ sources
- [ ] Domain correct (fiscal/codes/legislation/presse)

---

**Auteur** : Phase 3.1 Équipe
**Dernière mise à jour** : 2026-02-13
**Version** : 1.0
