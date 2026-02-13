# Phase 3.1 - Guide Extraction Manuelle CGI

## 🎯 Objectif
Extraire 15-20 abrogations du Code Général des Impôts (CGI) tunisien consolidé 2024.

**Temps estimé** : 2-3 heures
**Résultat attendu** : CSV avec 15-20 abrogations vérifiées

---

## 📥 Étape 1 : Téléchargement Sources (10 min)

### Source Principale : Code IRPP/IS 2024
**URL** : https://alliance-tunisie.com/wp-content/uploads/2024/06/CODE-IRPP-IS-2024.pdf

**Alternative** : https://jibaya.tn/wp-content/uploads/2024/07/Code-des-droits-et-procedures-fiscaux-2024.pdf

### Actions
1. Télécharger le PDF sur votre machine
2. Ouvrir avec Adobe Reader ou autre lecteur PDF
3. Vérifier que le PDF est searchable (CTRL+F fonctionne)

---

## 🔍 Étape 2 : Recherche Abrogations (1-2h)

### Mots-clés à rechercher (CTRL+F)

#### Français
- `abroge`
- `abrogée`
- `abrogé par`
- `sont abrogées`
- `modifié par` (souvent lié à abrogations partielles)
- `remplacé par`

#### Arabe
- `ملغى`
- `ألغيت`
- `تم إلغاؤه`

### Sections Prioritaires

#### 1. Notes de bas de page
Les notes en bas de page mentionnent souvent les abrogations historiques.

**Exemple** :
```
Article 40 - Déductions
[...]
(1) Modifié par loi n°2009-71 du 21/12/2009
(2) Article 16 abrogé par loi n°1997-11 du 03/02/1997
```

**Action** : Pour chaque note mentionnant une abrogation :
- Noter la référence du texte abrogé
- Noter la loi/décret qui abroge
- Noter la date
- Noter si partiel (quels articles) ou total

#### 2. Dispositions Transitoires
Chercher les sections "Dispositions transitoires" ou "Dispositions finales" (souvent en fin de code).

**Exemple** :
```
Article 150 - Dispositions transitoires
Sont abrogées les dispositions suivantes :
- Loi n°1975-101 du 29 décembre 1975
- Décret n°1980-456 du 15 avril 1980
- Articles 12 à 15 de la loi n°1985-109
```

#### 3. Articles "Abrogation"
Certains codes ont des articles dédiés aux abrogations.

**Chercher** :
- "Article X - Abrogation"
- "Article Y - Dispositions abrogées"

---

## 📝 Étape 3 : Extraction Données (30 min)

### Template Excel/Google Sheets

Créer un tableau avec les colonnes suivantes :

| Colonne | Exemple | Notes |
|---------|---------|-------|
| `abrogated_reference` | Loi n°1989-114 (Article 16) | Référence complète texte abrogé |
| `abrogated_reference_ar` | القانون عدد 1989-114 (الفصل 16) | Traduction arabe |
| `abrogating_reference` | Loi n°1997-11 | Texte qui abroge |
| `abrogating_reference_ar` | القانون عدد 1997-11 | Traduction arabe |
| `abrogation_date` | 1997-02-03 | Format YYYY-MM-DD |
| `scope` | partial | total / partial / implicit |
| `affected_articles` | 16 | Si partiel, liste articles |
| `jort_url` | https://... | Lien JORT si dispo |
| `source_url` | https://jibaya.tn/... | Source où trouvé |
| `notes` | Article 16 CGI abrogé... | Description |
| `domain` | fiscal | Domaine |
| `verified` | true | true si vérifié 2+ sources |

### Règles de Saisie

#### Références
- **Format standard** : `Loi n°YYYY-NN` ou `Décret n°YYYY-NNN`
- **Avec article** : `Loi n°YYYY-NN (Article X)`
- **Avec paragraphe** : `Loi n°YYYY-NN (Article X-§Y)`

#### Dates
- Format : `YYYY-MM-DD`
- Si jour inconnu : utiliser `01` (ex: `1997-02-01`)
- Si mois inconnu : utiliser `01-01` (ex: `1997-01-01`)

#### Portée (scope)
- `total` : Tout le texte est abrogé
- `partial` : Seulement certains articles (les lister dans `affected_articles`)
- `implicit` : Abrogation implicite (incompatibilité)

#### Traductions Arabes
Si traduction arabe non trouvée dans le document :
- Utiliser Google Translate
- Ou laisser vide et marquer `verified=false`

---

## ✅ Étape 4 : Vérification (30 min)

### Vérification Croisée

Pour chaque abrogation extraite, vérifier sur **au moins 2 sources** :

1. **Source primaire** : Code IRPP/IS 2024
2. **Source secondaire** : Choisir parmi :
   - Code Procédures Fiscaux 2024 (JIBAYA)
   - Loi de finances de l'année concernée
   - Site legislation.tn
   - JurisiteTunisie.com

### Checklist Qualité

Pour chaque ligne du CSV :
- [ ] Référence abrogée complète et correcte
- [ ] Référence abrogatrice complète et correcte
- [ ] Date au format YYYY-MM-DD
- [ ] Portée (total/partial/implicit) définie
- [ ] Si partiel : articles listés dans `affected_articles`
- [ ] Traduction arabe cohérente
- [ ] URL source vérifiable
- [ ] Notes explicatives claires
- [ ] Vérifié sur 2+ sources (`verified=true`)

---

## 💾 Étape 5 : Export et Import (10 min)

### Export CSV

1. Sauvegarder le tableau en CSV
2. **Format** : UTF-8, séparateur virgule `,`
3. **Nom fichier** : `phase3.1-cgi-abrogations-YYYY-MM-DD.csv`
4. **Emplacement** : `data/abrogations/`

### Import Production

```bash
npx tsx scripts/import-abrogations-phase3.1.ts --production phase3.1-cgi-abrogations-2026-02-13.csv
```

### Vérification Post-Import

```bash
# Compter abrogations par domaine
DB_PASSWORD="prod_secure_password_2026" npx tsx << 'EOF'
import { Pool } from 'pg'
const pool = new Pool({
  host: 'localhost', port: 5434,
  database: 'qadhya', user: 'moncabinet',
  password: process.env.DB_PASSWORD
})
;(async () => {
  const r = await pool.query(`
    SELECT
      SUBSTRING(notes FROM 'Domaine: ([^)]+)') as domain,
      COUNT(*) as count
    FROM legal_abrogations
    WHERE notes LIKE '%Domaine:%'
    GROUP BY domain
  `)
  console.table(r.rows)
  await pool.end()
})()
EOF
```

---

## 🎯 Abrogations Connues à Chercher

### Priorité Haute

Ces abrogations sont **documentées** dans la littérature fiscale tunisienne. Cherchez-les en priorité :

#### 1. Loi n°1989-114 - Code IRPP/IS Original
**Rechercher** : Articles abrogés ou modifiés par lois ultérieures
**Lois abrogatrices probables** :
- Loi n°1997-11 (Code Fiscalité Locale)
- Loi n°2004-90 (LF 2005)
- Loi n°2009-71 (LF 2010)
- Loi n°2017-8 (Réforme Investissement)

#### 2. Avantages Fiscaux Abrogés
**Rechercher** : "avantages fiscaux abrogés", "régimes abrogés"
**Période** : 2013-2024 (réformes fiscales post-révolution)

#### 3. Taux d'Impôt Modifiés
**Rechercher** : "taux abrogé", "barème abrogé"
**Exemple** :
- Ancien taux IS 30% → 25% → 15%
- Anciens barèmes IRPP progressifs

#### 4. Exonérations Supprimées
**Rechercher** : "exonération supprimée", "avantage supprimé"
**Secteurs** : Export, agriculture, tourisme

---

## 📊 Objectifs de Production

### Quota Minimum : 15 abrogations

| Type | Nombre | Temps |
|------|--------|-------|
| Abrogations notes bas de page | 8-10 | 1h |
| Dispositions transitoires | 3-5 | 30min |
| Articles dédiés | 2-3 | 30min |

### Quota Optimal : 20+ abrogations

Bonus si vous trouvez :
- Décrets d'application abrogés
- Circulaires fiscales abrogées
- Régimes spéciaux supprimés

---

## 🚨 Pièges à Éviter

### ❌ Ne pas confondre
- **Modification** ≠ **Abrogation**
  - Modification : texte reste en vigueur, changé
  - Abrogation : texte supprimé, plus en vigueur

### ❌ Ne pas oublier
- Vérifier que l'abrogation n'est pas déjà en base (doublons)
- Traduire les références en arabe
- Inclure les articles concernés si abrogation partielle

### ❌ Ne pas inventer
- Si date inconnue : laisser approximatif mais noter dans `notes`
- Si doute sur portée : marquer `implicit` et expliquer

---

## 📚 Ressources Complémentaires

### Lois de Finances Récentes (contiennent souvent abrogations)
- LF 2024 : https://jibaya.tn/wp-content/uploads/2024/02/Loi2023_13.pdf
- LF 2023 : https://ua.tn/wp-content/uploads/2023/01/Loi-de-Finances-2023_UA.pdf
- LF 2022 : http://www.droit-afrique.com/uploads/Tunisie-LF-2022.pdf

### Codes Fiscaux Historiques
- Code IRPP/IS 2018 : https://jibaya.tn/wp-content/uploads/2024/01/code-IRPP-IS-2018.pdf
- Code IRPP/IS 2022 : https://www.droit-afrique.com/uploads/Tunisie-Code-2022-IRPP.pdf

Comparer versions historiques pour identifier abrogations.

---

## 🎓 Exemple Complet

### Trouvaille dans PDF

**Page 45, Note de bas de page** :
```
Article 40 - Déductions communes

[...]

(1) Paragraphe III modifié par l'article 15 de la loi n° 2009-71
    du 21 décembre 2009, portant loi de finances pour l'année 2010.

(2) Les dispositions des articles 16 et 17 ont été abrogées par
    l'article 3 de la loi n° 97-11 du 3 février 1997, portant
    promulgation du code de la fiscalité locale.
```

### Extraction CSV

```csv
"Loi n°1989-114 (Articles 16-17)","القانون عدد 1989-114 (الفصول 16-17)","Loi n°1997-11","القانون عدد 1997-11",1997-02-03,partial,16;17,,https://jibaya.tn/...,Articles 16-17 Code IRPP abrogés par Code Fiscalité Locale,fiscal,true
```

---

## ✅ Validation Finale

Avant d'importer :

1. **Comptage** : Minimum 15 lignes (hors header)
2. **Format** : Toutes les colonnes remplies (sauf JORT URL optionnel)
3. **Dates** : Format YYYY-MM-DD uniquement
4. **Doublons** : Pas de lignes identiques
5. **Cohérence** : Date abrogation > Date texte abrogé

---

**Bonne extraction ! 🚀**

Pour questions : Voir `docs/PHASE3.1_PROGRESSION_RAPPORT.md`
