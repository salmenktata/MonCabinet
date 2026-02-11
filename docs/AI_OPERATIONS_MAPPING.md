# 🎯 Configuration IA par Type d'Opération - Qadhya

> **Organisation optimale des modèles IA selon les opérations métier**
> **Date** : 11 février 2026

---

## 📊 Vue d'ensemble du système

### Providers disponibles

| Provider | Modèle | Latence | Coût | Spécialité |
|----------|--------|---------|------|------------|
| **Groq** | llama-3.3-70b | 292ms | 0€ | ⚡ Chat ultra-rapide |
| **Gemini** | 2.5-flash | 1,5s | 0€ | 🌍 Multilingue AR/FR |
| **DeepSeek** | deepseek-chat | 1,8s | ~0.001€ | 📝 Extraction structurée |
| **OpenAI** | text-embedding-3-small | 500ms | ~0.0001€ | 🔍 Embeddings de qualité |
| **Ollama** | qwen2.5:3b | 18s | 0€ | 🏠 Backup local |
| **Ollama** | qwen3-embedding:0.6b | 2s | 0€ | 🔍 Embeddings gratuit |

---

## 🗂️ Configuration par Opération

### 1️⃣ **INDEXATION** (Background processing)

**URL** : N/A (Cron jobs, API `/api/admin/index-kb`)
**Volume** : ~100-500 documents/jour
**Priorité** : Coût > Vitesse (non critique)

#### Configuration recommandée

```typescript
{
  operation: 'indexation',

  // Extraction de contenu
  contentExtraction: {
    primary: 'ollama',      // Gratuit, volume élevé
    fallback: ['groq'],
    model: 'qwen2.5:3b',
    timeout: 30000,         // 30s acceptable
  },

  // Génération d'embeddings
  embeddings: {
    primary: 'ollama',      // Gratuit pour volume élevé
    fallback: ['openai'],   // Qualité supérieure si besoin
    model: 'qwen3-embedding:0.6b',
    dimensions: 1024,
    timeout: 10000,
  },

  // Analyse qualité document
  qualityAnalysis: {
    primary: 'gemini',      // Bon raisonnement
    fallback: ['deepseek', 'ollama'],
    model: 'gemini-2.5-flash',
    timeout: 15000,
  },

  // Classification juridique
  legalClassification: {
    primary: 'deepseek',    // Excellent extraction
    fallback: ['gemini', 'ollama'],
    model: 'deepseek-chat',
    timeout: 10000,
  },
}
```

**Estimation coûts** :
- 500 docs/jour × 30 jours = 15,000 docs/mois
- 95% Ollama (gratuit) + 5% fallback = **~2€/mois**

---

### 2️⃣ **ASSISTANT IA** (`/assistant-ia`)

**URL** : https://qadhya.tn/assistant-ia
**Volume** : ~1,000-2,000 questions/jour
**Priorité** : Vitesse ⚡ + Expérience utilisateur

#### Configuration recommandée

```typescript
{
  operation: 'assistant-ia',
  url: '/assistant-ia',

  // Recherche dans la base de connaissances
  ragSearch: {
    // 1. Génération embedding de la question
    queryEmbedding: {
      primary: 'ollama',      // Rapide + gratuit
      fallback: ['openai'],
      model: 'qwen3-embedding:0.6b',
      timeout: 3000,
    },

    // 2. Recherche vectorielle PostgreSQL
    vectorSearch: {
      method: 'pgvector',
      limit: 10,              // Top 10 résultats
      threshold: 0.7,
    },
  },

  // Génération de la réponse
  chatGeneration: {
    primary: 'groq',          // ⚡ ULTRA RAPIDE (292ms)
    fallback: ['gemini', 'ollama'],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    maxTokens: 500,
    timeout: 5000,            // Max 5s pour UX
  },

  // Mode premium (opt-in utilisateur)
  premiumMode: {
    primary: 'gemini',        // Meilleure qualité
    fallback: ['groq', 'deepseek'],
    model: 'gemini-2.5-flash',
    temperature: 0.2,
    maxTokens: 1000,
  },
}
```

**Parcours utilisateur** :
```
Question utilisateur
    ⬇️  (Ollama 2s)
Embedding de la question
    ⬇️  (PostgreSQL 100ms)
Recherche vectorielle (10 résultats)
    ⬇️  (Groq 292ms)
Génération réponse contextualisée
    ⬇️
Réponse à l'utilisateur (TOTAL: ~2.5s)
```

**Estimation coûts** :
- 2,000 questions/jour × 30 = 60,000 questions/mois
- 100% gratuit (Ollama + Groq)
- **0€/mois** 🎉

---

### 3️⃣ **ASSISTANT DOSSIERS** (`/dossiers/assistant`)

**URL** : https://qadhya.tn/dossiers/assistant
**Volume** : ~200-500 requêtes/jour
**Priorité** : Qualité > Vitesse (analyse approfondie)

#### Configuration recommandée

```typescript
{
  operation: 'dossiers-assistant',
  url: '/dossiers/assistant',

  // Analyse du dossier complet
  dossierAnalysis: {
    primary: 'gemini',        // Excellent raisonnement
    fallback: ['groq', 'deepseek'],
    model: 'gemini-2.5-flash',
    temperature: 0.2,
    maxTokens: 2000,          // Réponses détaillées
    timeout: 15000,           // 15s acceptable
  },

  // Extraction d'informations structurées
  structuredExtraction: {
    primary: 'deepseek',      // Meilleur pour JSON
    fallback: ['gemini'],
    model: 'deepseek-chat',
    responseFormat: 'json',
    timeout: 10000,
  },

  // Recherche jurisprudence pertinente
  jurisprudenceSearch: {
    queryEmbedding: {
      primary: 'openai',      // Qualité supérieure
      fallback: ['ollama'],
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
    vectorSearch: {
      method: 'pgvector',
      limit: 20,              // Plus de résultats
      threshold: 0.65,        // Moins strict
    },
  },

  // Synthèse juridique
  legalSummary: {
    primary: 'gemini',        // Multilingue AR/FR
    fallback: ['groq'],
    model: 'gemini-2.5-flash',
    temperature: 0.1,         // Très factuel
    maxTokens: 1500,
  },
}
```

**Parcours utilisateur** :
```
Ouverture dossier
    ⬇️  (Gemini 1.5s)
Analyse contexte juridique
    ⬇️  (OpenAI 500ms)
Recherche jurisprudence (embedding)
    ⬇️  (PostgreSQL 200ms)
Recherche vectorielle
    ⬇️  (Gemini 2s)
Synthèse argumentaire
    ⬇️
Suggestions à l'utilisateur (TOTAL: ~4.2s)
```

**Estimation coûts** :
- 500 dossiers/jour × 30 = 15,000 analyses/mois
- OpenAI embeddings : 15,000 × 0.0001€ = 1.50€
- Autres : gratuit (Gemini/Groq)
- **~1.50€/mois**

---

### 4️⃣ **CONSULTATION DOSSIERS** (`/dossiers/consultation`)

**URL** : https://qadhya.tn/dossiers/consultation
**Volume** : ~100-200 consultations/jour
**Priorité** : Qualité maximale + Méthodologie IRAC

#### Configuration recommandée

```typescript
{
  operation: 'dossiers-consultation',
  url: '/dossiers/consultation',

  // Génération consultation formelle (méthode IRAC)
  formalConsultation: {
    primary: 'gemini',        // Meilleur raisonnement structuré
    fallback: ['deepseek', 'groq'],
    model: 'gemini-2.5-flash',
    temperature: 0.1,         // Très factuel
    maxTokens: 4000,          // Consultations longues
    timeout: 30000,           // 30s acceptable
    systemPrompt: 'legal-reasoning-irac',
  },

  // Recherche textes législatifs
  legislationSearch: {
    queryEmbedding: {
      primary: 'openai',      // Précision maximale
      fallback: ['ollama'],
      model: 'text-embedding-3-small',
    },
    vectorSearch: {
      method: 'pgvector',
      limit: 30,              // Beaucoup de résultats
      threshold: 0.6,         // Large filet
      filters: {
        category: ['legislation', 'jurisprudence'],
      },
    },
  },

  // Vérification cohérence juridique
  coherenceCheck: {
    primary: 'deepseek',      // Analyse fine
    fallback: ['gemini'],
    model: 'deepseek-chat',
    temperature: 0.05,        // Très strict
  },

  // Génération document final (FR + AR)
  documentGeneration: {
    primary: 'gemini',        // Meilleur bilingue
    fallback: ['groq'],
    model: 'gemini-2.5-flash',
    temperature: 0.2,
  },
}
```

**Parcours utilisateur** :
```
Demande consultation
    ⬇️  (OpenAI 500ms)
Recherche législation pertinente
    ⬇️  (PostgreSQL 300ms)
Recherche vectorielle multi-sources
    ⬇️  (Gemini 10s)
Rédaction consultation IRAC
    ⬇️  (DeepSeek 2s)
Vérification cohérence
    ⬇️  (Gemini 3s)
Génération PDF FR + AR
    ⬇️
Consultation livrée (TOTAL: ~15-20s)
```

**Estimation coûts** :
- 200 consultations/jour × 30 = 6,000 consultations/mois
- OpenAI embeddings : 6,000 × 0.0001€ = 0.60€
- Autres : gratuit (Gemini/DeepSeek)
- **~0.60€/mois**

---

## 📊 Matrice récapitulative

| Opération | Primary | Fallback | Latence | Coût/mois | Volume/jour |
|-----------|---------|----------|---------|-----------|-------------|
| **Indexation** | Ollama | Groq | 30s | ~2€ | 100-500 docs |
| **Assistant IA** | Groq | Gemini | 2.5s | 0€ | 1,000-2,000 |
| **Assistant Dossiers** | Gemini | Groq | 4.2s | ~1.50€ | 200-500 |
| **Consultation** | Gemini | DeepSeek | 15-20s | ~0.60€ | 100-200 |
| **Embeddings** | Ollama | OpenAI | 2s | ~2.10€ | Tous |

**Total mensuel** : **~6.20€/mois** (vs 100€+ avec alternatives)

---

## 🎯 Configuration code recommandée

### Fichier : `lib/ai/operations-config.ts`

```typescript
/**
 * Configuration IA par opération métier
 */

export const AI_OPERATIONS_CONFIG = {
  // 1. Indexation (background)
  indexation: {
    contentExtraction: {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      fallback: ['groq', 'gemini'],
      timeout: 30000,
    },
    embeddings: {
      provider: 'ollama',
      model: 'qwen3-embedding:0.6b',
      fallback: ['openai'],
      timeout: 10000,
    },
    qualityAnalysis: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['deepseek', 'ollama'],
      timeout: 15000,
    },
    legalClassification: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallback: ['gemini', 'ollama'],
      timeout: 10000,
    },
  },

  // 2. Assistant IA (/assistant-ia)
  'assistant-ia': {
    queryEmbedding: {
      provider: 'ollama',
      model: 'qwen3-embedding:0.6b',
      fallback: ['openai'],
      timeout: 3000,
    },
    chatGeneration: {
      provider: 'groq',             // ULTRA RAPIDE ⚡
      model: 'llama-3.3-70b-versatile',
      fallback: ['gemini', 'ollama'],
      temperature: 0.3,
      maxTokens: 500,
      timeout: 5000,
    },
    premiumMode: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['groq', 'deepseek'],
      temperature: 0.2,
      maxTokens: 1000,
    },
  },

  // 3. Assistant Dossiers (/dossiers/assistant)
  'dossiers-assistant': {
    dossierAnalysis: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['groq', 'deepseek'],
      temperature: 0.2,
      maxTokens: 2000,
      timeout: 15000,
    },
    structuredExtraction: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallback: ['gemini'],
      responseFormat: 'json',
      timeout: 10000,
    },
    jurisprudenceSearch: {
      queryEmbedding: {
        provider: 'openai',         // Qualité supérieure
        model: 'text-embedding-3-small',
        fallback: ['ollama'],
      },
    },
    legalSummary: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['groq'],
      temperature: 0.1,
      maxTokens: 1500,
    },
  },

  // 4. Consultation Dossiers (/dossiers/consultation)
  'dossiers-consultation': {
    formalConsultation: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['deepseek', 'groq'],
      temperature: 0.1,
      maxTokens: 4000,
      timeout: 30000,
      systemPrompt: 'legal-reasoning-irac',
    },
    legislationSearch: {
      queryEmbedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        fallback: ['ollama'],
      },
      filters: {
        category: ['legislation', 'jurisprudence'],
      },
    },
    coherenceCheck: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallback: ['gemini'],
      temperature: 0.05,
    },
    documentGeneration: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: ['groq'],
      temperature: 0.2,
    },
  },
} as const

export type OperationType = keyof typeof AI_OPERATIONS_CONFIG
```

---

## 💡 Points clés de la stratégie

### ✅ OpenAI intégré

- **Usage** : Embeddings de qualité pour dossiers/consultations
- **Coût** : ~2€/mois (très raisonnable)
- **Fallback** : Ollama (gratuit mais qualité inférieure)

### ✅ Groq optimisé

- **Usage principal** : Chat assistant IA (volume élevé)
- **Raison** : 292ms ultra-rapide pour UX fluide
- **Économie** : 100% gratuit sur volume principal

### ✅ Gemini stratégique

- **Usage** : Analyses juridiques complexes
- **Raison** : Meilleur raisonnement + multilingue AR/FR
- **Avantage** : Gratuit avec excellent contexte

### ✅ DeepSeek ciblé

- **Usage** : Extraction structurée + JSON
- **Raison** : Excellent pour données structurées
- **Coût** : Minimal (~1€/mois)

### ✅ Ollama économique

- **Usage** : Indexation background + embeddings
- **Raison** : Volume élevé, non critique
- **Avantage** : 100% gratuit, toujours disponible

---

## 🚀 Prochaines étapes

### Implémentation (1-2 semaines)

1. **Créer** `lib/ai/operations-config.ts`
2. **Modifier** routes pour utiliser config par opération :
   - `/api/assistant-ia/route.ts`
   - `/api/dossiers/[id]/assistant/route.ts`
   - `/api/dossiers/[id]/consultation/route.ts`
   - `/api/admin/index-kb/route.ts`
3. **Tester** chaque opération individuellement
4. **Monitorer** usage réel pendant 2 semaines
5. **Ajuster** selon métriques

### Validation

- [ ] Config testée sur dev
- [ ] Tests de charge OK
- [ ] Coûts validés < 10€/mois
- [ ] Latences respectées
- [ ] Qualité validée par utilisateurs

---

**Configuration validée** : 11 février 2026
**Coût total estimé** : **~6€/mois**
**Économie vs alternatives** : **~1,140€/an** 🎉
