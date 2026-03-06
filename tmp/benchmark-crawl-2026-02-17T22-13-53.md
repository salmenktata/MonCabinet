# Benchmark Crawl Sources - Rapport Comparatif

**Date** : 17/02/2026 23:13:53  
**Sources testées** : cassation.tn

## 1. Résumé Comparatif Global

| Source | Score | Grade | Latence (ms) | Succès | Arabe | PDFs | Timeout |
|--------|-------|-------|-------------|--------|-------|------|---------|
| cassation.tn | **70** | **C** | 1084ms | 6/10 (60%) | 53.6% | 3 testés / 3 OK | ✅ Non |

## 2. Détail par Source

---

### cassation.tn

**URL** : `http://www.cassation.tn`  
**Score** : 70/100 — Grade **C**  
**Durée totale** : 36.6s 

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 1084ms |
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
| Vitesse | 0.20 pages/s |
| PDFs détectés | 70 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 66ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 71ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ❌ 403 | 71ms | 0 | 0% | 0 | 0 | BAN_DETECTED: HTTP 403 Forbidden |
| http://www.cassation.tn/fr/ | ✅ 200 | 1038ms | 2613 | 73% | 80 | 33 | - |
| http://www.cassation.tn/fr/%D8%A7%D9%84%D9%85%D... | ❌  | 3177ms | 0 | 0% | 0 | 0 | fetch failed |
| http://www.cassation.tn/fr/%D8%A7%D8%B3%D8%A6%D... | ✅ 200 | 909ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%B1%D9%88%D8%A7%D... | ✅ 200 | 1151ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%AE%D8%A7%D8%B1%D... | ✅ 200 | 1323ms | 636 | 86% | 70 | 1 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 910ms | 10 | 90% | 0 | 1 | - |
| http://www.cassation.tn/?id=1 | ✅ 200 | 851ms | 2613 | 73% | 80 | 33 | - |

</details>

#### Phase 3 — Test PDF

| Métrique | Valeur |
|----------|--------|
| PDFs testés | 3 |
| PDFs réussis | 3 |
| Taille moyenne | 264 KB |
| Téléchargement moyen | 197ms |
| Chars extraits moyens | 4992 |
| OCR utilisé | Non |
| Ratio arabe moyen | 56.2% |

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/planning_21-22.pdf`
- Taille : 219KB | Téléchargement : 231ms
- Extraction : 5841 chars, 6 pages
- OCR : Non | Ratio arabe : 16.4%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/68182.pdf`
- Taille : 233KB | Téléchargement : 156ms
- Extraction : 6176 chars, 5 pages
- OCR : Non | Ratio arabe : 74.9%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/2335.pdf`
- Taille : 341KB | Téléchargement : 205ms
- Extraction : 2958 chars, 2 pages
- OCR : Non | Ratio arabe : 77.1%

---

## 3. Synthèse et Recommandations Prioritaires

### Classement

1. **cassation.tn** — Score 70/100 (C)

### Actions Prioritaires

---

*Rapport généré par `scripts/benchmark-crawl-sources.ts` — 2026-02-17T22:13:53.204Z*