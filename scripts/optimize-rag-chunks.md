# Optimisation Chunks RAG

## Problèmes Identifiés

1. **Chunks trop petits** : 42-200 chars (contexte insuffisant)
2. **Chunks trop gros** : >5000 chars (dépassent limites embeddings)
3. **Google Drive** : Score moyen 64 vs 82 pour legislation

## Actions d'Optimisation

### 1. Fusionner chunks trop petits (<200 chars)

```sql
-- Identifier chunks à fusionner
SELECT
  kb.id,
  kb.title,
  COUNT(kbc.id) as chunks_count,
  COUNT(*) FILTER (WHERE LENGTH(kbc.content) < 200) as small_chunks,
  COUNT(*) FILTER (WHERE LENGTH(kbc.content) > 5000) as large_chunks
FROM knowledge_base kb
JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
GROUP BY kb.id
HAVING COUNT(*) FILTER (WHERE LENGTH(kbc.content) < 200) > 0
ORDER BY small_chunks DESC
LIMIT 20;
```

### 2. Redécouper chunks trop gros (>5000 chars)

```sql
-- Identifier chunks à redécouper
SELECT
  kbc.id,
  kb.title,
  LENGTH(kbc.content) as length,
  kbc.chunk_index
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
WHERE LENGTH(kbc.content) > 5000
ORDER BY LENGTH(kbc.content) DESC
LIMIT 20;
```

### 3. Améliorer qualité Google Drive

**Analyse** : Score moyen 64 vs 82 legislation

**Hypothèses** :
- Documents plus hétérogènes (mémoires, thèses, etc.)
- Moins de structure standardisée
- Potentiellement plus de bruit

**Actions** :
- Réanalyser avec paramètres ajustés
- Ajouter validation spécifique Google Drive
- Filtrer documents de faible qualité avant indexation

### 4. Promouvoir documents vers excellence (90-100)

**Actuellement** : Seulement 2.1% excellent

**Critères à identifier** :
```sql
-- Analyser caractéristiques documents excellents
SELECT
  kb.category,
  kb.quality_score,
  kb.title,
  LENGTH(kb.full_text) as length,
  kb.metadata->>'sourceType' as source_type
FROM knowledge_base kb
WHERE kb.quality_score >= 90
ORDER BY kb.quality_score DESC
LIMIT 20;
```

## Ordre d'Exécution

1. **Immédiat** : Identifier et fusionner petits chunks
2. **Court terme** : Redécouper gros chunks
3. **Moyen terme** : Améliorer scoring Google Drive
4. **Long terme** : Critères excellence automatique

## Métriques Cibles

| Métrique | Actuel | Cible |
|----------|--------|-------|
| Chunks < 200 chars | Quelques uns | 0% |
| Chunks > 5000 chars | Quelques uns | 0% |
| Score Google Drive | 64 | 75+ |
| Documents excellent | 2.1% | 10%+ |
| Score moyen global | 81 | 85+ |

## Impact Attendu

- ✅ Meilleure qualité recherche RAG
- ✅ Réponses plus pertinentes
- ✅ Scores similarité améliorés
- ✅ Expérience utilisateur optimisée
