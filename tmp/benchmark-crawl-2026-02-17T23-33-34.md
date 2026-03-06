# Benchmark Crawl Sources - Rapport Comparatif

**Date** : 18/02/2026 00:33:34  
**Sources testées** : cassation.tn

## 1. Résumé Comparatif Global

| Source | Score | Grade | Latence (ms) | Succès | Arabe | PDFs | Timeout |
|--------|-------|-------|-------------|--------|-------|------|---------|
| cassation.tn | **56** | **D** | 1159ms | 9/10 (90%) | 52.7% | 0 testés / 0 OK | ✅ Non |

## 2. Détail par Source

---

### cassation.tn

**URL** : `http://www.cassation.tn`  
**Score** : 56/100 — Grade **D**  
**Durée totale** : 52.4s 

#### Phase 1 — Connectivité

| Métrique | Valeur |
|----------|--------|
| Connexion | ✅ OK |
| Latence | 1159ms |
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
| Vitesse | 0.18 pages/s |
| PDFs détectés | 938 |

<details>
<summary>Détail des pages crawlées (10)</summary>

| URL | Status | Latence | Chars | Arabe | Qualité | PDFs | Issue |
|-----|--------|---------|-------|-------|---------|------|-------|
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 4416ms | 36497 | 51% | 60 | 460 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 3732ms | 21634 | 52% | 60 | 264 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 2787ms | 10693 | 50% | 70 | 144 | - |
| http://www.cassation.tn/fr/ | ✅ 200 | 1182ms | 2613 | 73% | 80 | 33 | - |
| http://www.cassation.tn/fr/%D8%A7%D9%84%D9%85%D... | ❌  | 3688ms | 0 | 0% | 0 | 0 | fetch failed |
| http://www.cassation.tn/fr/%D8%A7%D8%B3%D8%A6%D... | ✅ 200 | 4461ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%B1%D9%88%D8%A7%D... | ✅ 200 | 1370ms | 0 | 0% | 0 | 1 | - |
| http://www.cassation.tn/fr/%D8%AE%D8%A7%D8%B1%D... | ✅ 200 | 3165ms | 636 | 86% | 70 | 1 | - |
| http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%... | ✅ 200 | 2460ms | 10 | 90% | 0 | 1 | - |
| http://www.cassation.tn/?id=1 | ✅ 200 | 1129ms | 2613 | 73% | 80 | 33 | - |

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

- 💡 Aucun PDF trouvé — vérifier les patterns de détection PDF

---

## 3. Synthèse et Recommandations Prioritaires

### Classement

1. **cassation.tn** — Score 56/100 (D)

### Actions Prioritaires

---

*Rapport généré par `scripts/benchmark-crawl-sources.ts` — 2026-02-17T23:33:34.648Z*