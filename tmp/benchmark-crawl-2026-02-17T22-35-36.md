# Benchmark Crawl Sources - Rapport Comparatif

**Date** : 17/02/2026 23:35:36  
**Sources testées** : cassation.tn, da5ira.com, jibaya.tn

## 1. Résumé Comparatif Global

| Source | Score | Grade | Latence (ms) | Succès | Arabe | PDFs | Timeout |
|--------|-------|-------|-------------|--------|-------|------|---------|
| cassation.tn | **67** | **C** | 1201ms | 6/10 (60%) | 53.6% | 3 testés / 3 OK | ✅ Non |
| da5ira.com | **73** | **C** | 547ms | 10/10 (100%) | 72.0% | 1 testés / 0 OK | ✅ Non |
| jibaya.tn | **57** | **D** | 217ms | 10/10 (100%) | 0.0% | 0 testés / 0 OK | ⚠️ Oui |

## 2. Détail par Source

---

### cassation.tn

**URL** : `http://www.cassation.tn`  
**Score** : 67/100 — Grade **C**  
**Durée totale** : 37.0s 

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 1201ms |
| Status HTTP | 200 |
| SSL invalide | Non |
| SSL corrigé | N/A |
| Framework détecté | TYPO3 |
| Sitemap présent | Non |
| robots.txt | ⚠️ Absent ou inaccessible |
| Ban détecté | Non |

#### Phase 2 — Crawl Léger

| Métrique | Valeur |
|----------|--------|
| Pages tentées | 10 |
| Pages réussies | 6 |
| Taux de succès | 60.0% |
| Contenu moyen | 979 chars |
| Ratio arabe moyen | 53.6% |
| Score qualité moyen | 38.3/100 |
| Vitesse | 0.19 pages/s |
| PDFs détectés | 70 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 56ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 103ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 1058ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/ | ✅ 200 | 1136ms | 2613 | 73% | 80 | 33 | - |
| http://www.cassation.tn/fr/%D8%A7%D9%84%D9%85%D... | ❌  | 3590ms | 0 | 0% | 0 | 0 | fetch failed |
| http://www.cassation.tn/fr/%D8%A7%D8%B3%D8%A6%D... | ✅ 200 | 1253ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%B1%D9%88%D8%A7%D... | ✅ 200 | 983ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%AE%D8%A7%D8%B1%D... | ✅ 200 | 1007ms | 636 | 86% | 70 | 1 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 1122ms | 10 | 90% | 0 | 1 | - |
| http://www.cassation.tn/?id=1 | ✅ 200 | 1074ms | 2613 | 73% | 80 | 33 | - |

</details>

#### Phase 3 — Test PDF

| Métrique | Valeur |
|----------|--------|
| PDFs testés | 3 |
| PDFs réussis | 3 |
| Taille moyenne | 264 KB |
| Téléchargement moyen | 199ms |
| Chars extraits moyens | 4992 |
| OCR utilisé | Non |
| Ratio arabe moyen | 56.2% |

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/planning_21-22.pdf`
- Taille : 219KB | Téléchargement : 187ms
- Extraction : 5841 chars, 6 pages
- OCR : Non | Ratio arabe : 16.4%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/68182.pdf`
- Taille : 233KB | Téléchargement : 151ms
- Extraction : 6176 chars, 5 pages
- OCR : Non | Ratio arabe : 74.9%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/2335.pdf`
- Taille : 341KB | Téléchargement : 258ms
- Extraction : 2958 chars, 2 pages
- OCR : Non | Ratio arabe : 77.1%

---

### da5ira.com

**URL** : `https://www.da5ira.com`  
**Score** : 73/100 — Grade **C**  
**Durée totale** : 15.5s 

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 547ms |
| Status HTTP | 200 |
| SSL invalide | Non |
| SSL corrigé | N/A |
| Framework détecté | Blogger |
| Sitemap présent | ✅ Oui (https://www.da5ira.com/sitemap.xml) |
| robots.txt | ⚠️ Absent ou inaccessible |
| Ban détecté | Non |

#### Phase 2 — Crawl Léger

| Métrique | Valeur |
|----------|--------|
| Pages tentées | 10 |
| Pages réussies | 10 |
| Taux de succès | 100.0% |
| Contenu moyen | 2560 chars |
| Ratio arabe moyen | 72.0% |
| Score qualité moyen | 73.0/100 |
| Vitesse | 0.86 pages/s |
| PDFs détectés | 6 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| https://www.da5ira.com/2026/02/blog-post.html | ✅ 200 | 418ms | 861 | 71% | 70 | 5 | - |
| https://www.da5ira.com/2026/01/blog-post_27.html | ✅ 200 | 438ms | 4486 | 70% | 80 | 0 | - |
| https://www.da5ira.com/2026/01/blog-post.html | ✅ 200 | 703ms | 2407 | 75% | 80 | 0 | - |
| https://www.da5ira.com/2026/01/1972.html | ✅ 200 | 538ms | 1363 | 72% | 70 | 0 | - |
| https://www.da5ira.com/2025/09/blog-post_30.html | ✅ 200 | 582ms | 388 | 77% | 60 | 0 | - |
| https://www.da5ira.com/2025/09/blog-post.html | ✅ 200 | 615ms | 323 | 76% | 60 | 0 | - |
| https://www.da5ira.com/2025/08/html-body-font-f... | ✅ 200 | 437ms | 7715 | 77% | 80 | 0 | - |
| https://www.da5ira.com/2025/08/blog-post_84.html | ✅ 200 | 933ms | 1513 | 64% | 70 | 1 | - |
| https://www.da5ira.com/2025/08/blog-post_70.html | ✅ 200 | 537ms | 2598 | 69% | 80 | 0 | - |
| https://www.da5ira.com/2025/08/blog-post_27.html | ✅ 200 | 428ms | 3941 | 70% | 80 | 0 | - |

</details>

#### Phase 3 — Test PDF

| Métrique | Valeur |
|----------|--------|
| PDFs testés | 1 |
| PDFs réussis | 0 |
| Taille moyenne | 0 KB |
| Téléchargement moyen | 0ms |
| Chars extraits moyens | 0 |
| OCR utilisé | Non |
| Ratio arabe moyen | 0.0% |

**PDF** : `http://www.legislation.tn/sites/default/files/fraction-journal-officiel/2004/200`
- Taille : 0KB | Téléchargement : 70ms
- Extraction : 0 chars, 0 pages
- OCR : Non | Ratio arabe : 0.0%
- ❌ Issue : HTTP 503: Service Unavailable

#### Problèmes Détectés

- ⚠️ PDF: HTTP 503: Service Unavailable

---

### jibaya.tn

**URL** : `https://jibaya.tn`  
**Score** : 57/100 — Grade **D**  
**Durée totale** : 120.0s ⚠️ (timeout global atteint)

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 217ms |
| Status HTTP | 200 |
| SSL invalide | Non |
| SSL corrigé | N/A |
| Framework détecté | WordPress |
| Sitemap présent | ✅ Oui (https://jibaya.tn/sitemap.xml) |
| robots.txt | ⚠️ Absent ou inaccessible |
| Ban détecté | Non |

#### Phase 2 — Crawl Léger

| Métrique | Valeur |
|----------|--------|
| Pages tentées | 10 |
| Pages réussies | 10 |
| Taux de succès | 100.0% |
| Contenu moyen | 3001 chars |
| Ratio arabe moyen | 0.0% |
| Score qualité moyen | 43.0/100 |
| Vitesse | 0.30 pages/s |
| PDFs détectés | 37 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| https://jibaya.tn/blog/fiscalite-10-10-saison-8... | ✅ 200 | 2397ms | 1772 | 0% | 40 | 0 | - |
| https://jibaya.tn/blog/communique/ | ✅ 200 | 2473ms | 1620 | 0% | 40 | 0 | - |
| https://jibaya.tn/blog/depot-sur-support-magnet... | ✅ 200 | 2371ms | 1804 | 0% | 40 | 13 | - |
| https://jibaya.tn/blog/declaration-pays-par-pays/ | ✅ 200 | 101ms | 4629 | 0% | 50 | 9 | - |
| https://jibaya.tn/blog/la-fiscalite-en-toute-co... | ✅ 200 | 2463ms | 1818 | 0% | 40 | 0 | - |
| https://jibaya.tn/blog/__trashed-4/ | ✅ 200 | 2468ms | 2285 | 0% | 50 | 1 | - |
| https://jibaya.tn/blog/la-dgi-au-global-ai-cong... | ✅ 200 | 2870ms | 1001 | 0% | 40 | 0 | - |
| https://jibaya.tn/blog/avis-depot-de-la-liasse-... | ✅ 200 | 2620ms | 695 | 0% | 40 | 0 | - |
| https://jibaya.tn/blog/plateforme-de-transfert-... | ✅ 200 | 2415ms | 12789 | 0% | 50 | 9 | - |
| https://jibaya.tn/blog/depot-dematerialise-de-l... | ✅ 200 | 2337ms | 1597 | 0% | 40 | 5 | - |

</details>

#### Phase 3 — Test PDF

| Métrique | Valeur |
|----------|--------|
| PDFs testés | 0 |
| PDFs réussis | 0 |
| Taille moyenne | 0 KB |
| Téléchargement moyen | 0ms |
| Chars extraits moyens | 0 |
| OCR utilisé | Non |
| Ratio arabe moyen | 0.0% |

#### Recommandations

- 💡 Contenu arabe faible — vérifier les pages cibles
- 💡 Aucun PDF trouvé — vérifier les patterns de détection PDF

---

## 3. Synthèse et Recommandations Prioritaires

### Classement

1. **da5ira.com** — Score 73/100 (C)
2. **cassation.tn** — Score 67/100 (C)
3. **jibaya.tn** — Score 57/100 (D)

### Actions Prioritaires

---

*Rapport généré par `scripts/benchmark-crawl-sources.ts` — 2026-02-17T22:35:36.461Z*