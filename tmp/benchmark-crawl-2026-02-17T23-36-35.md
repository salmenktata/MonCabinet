# Benchmark Crawl Sources - Rapport Comparatif

**Date** : 18/02/2026 00:36:35  
**Sources testées** : cassation.tn

## 1. Résumé Comparatif Global

| Source | Score | Grade | Latence (ms) | Succès | Arabe | PDFs | Timeout |
|--------|-------|-------|-------------|--------|-------|------|---------|
| cassation.tn | **77** | **B** | 1023ms | 9/10 (90%) | 52.7% | 3 testés / 3 OK | ✅ Non |

## 2. Détail par Source

---

### cassation.tn

**URL** : `http://www.cassation.tn`  
**Score** : 77/100 — Grade **B**  
**Durée totale** : 44.3s 

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 1023ms |
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
| Pages réussies | 9 |
| Taux de succès | 90.0% |
| Contenu moyen | 8300 chars |
| Ratio arabe moyen | 52.7% |
| Score qualité moyen | 46.7/100 |
| Vitesse | 0.23 pages/s |
| PDFs détectés | 938 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 3412ms | 36497 | 51% | 60 | 460 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 2461ms | 21634 | 52% | 60 | 264 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 1827ms | 10693 | 50% | 70 | 144 | - |
| http://www.cassation.tn/fr/ | ✅ 200 | 896ms | 2613 | 73% | 80 | 33 | - |
| http://www.cassation.tn/fr/%D8%A7%D9%84%D9%85%D... | ❌  | 3813ms | 0 | 0% | 0 | 0 | fetch failed |
| http://www.cassation.tn/fr/%D8%A7%D8%B3%D8%A6%D... | ✅ 200 | 1045ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%B1%D9%88%D8%A7%D... | ✅ 200 | 1080ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%AE%D8%A7%D8%B1%D... | ✅ 200 | 1219ms | 636 | 86% | 70 | 1 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 924ms | 10 | 90% | 0 | 1 | - |
| http://www.cassation.tn/?id=1 | ✅ 200 | 1106ms | 2613 | 73% | 80 | 33 | - |

</details>

#### Phase 3 — Test PDF

| Métrique | Valeur |
|----------|--------|
| PDFs testés | 3 |
| PDFs réussis | 3 |
| Taille moyenne | 264 KB |
| Téléchargement moyen | 281ms |
| Chars extraits moyens | 4992 |
| OCR utilisé | Non |
| Ratio arabe moyen | 56.2% |

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/planning_21-22.pdf`
- Taille : 219KB | Téléchargement : 229ms
- Extraction : 5841 chars, 6 pages
- OCR : Non | Ratio arabe : 16.4%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/68182.pdf`
- Taille : 233KB | Téléchargement : 455ms
- Extraction : 6176 chars, 5 pages
- OCR : Non | Ratio arabe : 74.9%

**PDF** : `http://www.cassation.tn/fileadmin/user_upload/2335.pdf`
- Taille : 341KB | Téléchargement : 158ms
- Extraction : 2958 chars, 2 pages
- OCR : Non | Ratio arabe : 77.1%

---

## 3. Synthèse et Recommandations Prioritaires

### Classement

1. **cassation.tn** — Score 77/100 (B)

### Actions Prioritaires

---

*Rapport généré par `scripts/benchmark-crawl-sources.ts` — 2026-02-17T23:36:35.647Z*