# Migration Ollama - Option C : Hybride Intelligent

**Date** : Février 2026
**Statut** : ✅ Implémenté

## Vue d'ensemble

Migration complète vers une architecture **hybride intelligente** qui combine :
- **Ollama local** (gratuit, rapide) pour l'usage quotidien
- **Cloud providers** (Groq/DeepSeek/Anthropic) pour les analyses premium

Cette approche élimine complètement la dépendance à OpenAI tout en offrant :
- ✅ **0€/mois** en usage normal (Ollama local)
- ✅ **5-15€/mois** seulement si mode premium utilisé (API cloud)
- ✅ **Pas d'upgrade VPS** requis (4 CPU, 8GB RAM suffisent)
- ✅ **Qualité maximale** disponible sur demande

---

## Architecture Technique

### Mode Rapide (Par Défaut)
```
Utilisateur → Ollama qwen3:8b (local)
              ↓ (si échec)
              Groq → DeepSeek → Anthropic (fallback cloud)
```

**Caractéristiques** :
- Temps réponse : ~15-20s
- Coût : **0€** (100% local)
- Usage : Questions simples, chat interactif, recherche rapide
- Modèle : `qwen3:8b` (4GB RAM, rapide)

### Mode Premium (Opt-in Utilisateur)
```
Utilisateur → SKIP Ollama
              ↓
              Groq → DeepSeek → Anthropic (direct cloud)
```

**Caractéristiques** :
- Temps réponse : ~10-30s
- Coût : ~0.001-0.01€ par requête (selon provider)
- Usage : Analyses complexes, consultations formelles, rédaction juridique
- Modèles : Llama 3.3 70B (Groq), DeepSeek R1, Claude Sonnet 4.5

---

## Fichiers Modifiés

### 1. Configuration Core
**`lib/ai/config.ts`**
```typescript
ollama: {
  baseUrl: string
  chatModelDefault: string  // qwen3:8b uniquement
  embeddingModel: string
  chatTimeoutDefault: number
  // SUPPRIMÉ : chatModelPremium, chatTimeoutPremium
}

// Type LLM sans OpenAI
export type LLMProviderType = 'groq' | 'deepseek' | 'anthropic'

// Embeddings : Ollama uniquement
export function getEmbeddingProvider(): 'ollama' | null
```

### 2. Service LLM Fallback
**`lib/ai/llm-fallback-service.ts`**
```typescript
export async function callLLMWithFallback(
  messages: LLMMessage[],
  options: LLMOptions = {},
  usePremiumModel: boolean = false  // 🆕 Toggle mode
): Promise<LLMResponse>
```

**Logique** :
- `usePremiumModel = false` → Ollama local → fallback cloud
- `usePremiumModel = true` → **SKIP Ollama**, direct cloud (qualité max)

**Ordre fallback cloud** : Groq → DeepSeek → Anthropic

### 3. Service Embeddings
**`lib/ai/embeddings-service.ts`**
- ❌ Suppression complète `generateEmbeddingWithOpenAI()`
- ❌ Suppression fallback OpenAI
- ✅ Ollama uniquement avec messages d'erreur clairs
- ✅ Circuit breaker pour résilience

### 4. Helper Ollama
**`lib/ai/ollama-client-helper.ts` (NOUVEAU)**
```typescript
export async function callOllamaWithSDK(
  messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
  options: OllamaCallOptions = {}
): Promise<OllamaResponse>
```

Centralise la logique SDK OpenAI pour appeler Ollama.
Utilisé par 8 services :
- rag-chat-service.ts
- kb-quality-analyzer-service.ts
- kb-duplicate-detector-service.ts
- metadata-extractor-service.ts
- legal-classifier-service.ts
- contradiction-detector-service.ts
- content-analyzer-service.ts
- conversation-summary-service.ts

### 5. Interface UI
**`components/chat/model-selector.tsx` (NOUVEAU)**

Toggle visuel :
- ⚡ Mode Rapide (Ollama local)
- 🧠 Mode Premium (Cloud LLMs)

Tooltips informatifs avec temps d'attente et recommandations d'usage.

---

## Variables d'Environnement

### Requises
```bash
# Ollama (Local - Mode Rapide)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen3:8b
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_CHAT_TIMEOUT_DEFAULT=120000

# Cloud Providers (Mode Premium)
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # Optionnel
```

### Supprimées
```bash
# ❌ Plus nécessaires avec Option C
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=...
OLLAMA_CHAT_MODEL_PREMIUM=...
OLLAMA_CHAT_TIMEOUT_PREMIUM=...
```

---

## Installation Ollama

### macOS / Linux
```bash
# Installer Ollama
brew install ollama  # macOS
# ou: curl -fsSL https://ollama.com/install.sh | sh  # Linux

# Démarrer le service
ollama serve

# Télécharger les modèles
ollama pull qwen3:8b              # Chat rapide (4GB)
ollama pull qwen3-embedding:0.6b  # Embeddings (1.2GB)
```

### Production VPS
```bash
# Systemd override pour écouter sur 0.0.0.0
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e "[Service]\nEnvironment=OLLAMA_HOST=0.0.0.0:11434" | \
  sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama

# UFW : autoriser Docker → Ollama
sudo ufw allow from 172.16.0.0/12 to any port 11434

# Docker : extra_hosts
# docker-compose.prod.yml
extra_hosts:
  - "host.docker.internal:host-gateway"

# Variable env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

---

## Intégration dans le Code

### 1. Appels LLM Simples
```typescript
import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'

// Mode rapide (défaut)
const response = await callLLMWithFallback(
  [{ role: 'user', content: 'Question rapide ?' }],
  { temperature: 0.3, maxTokens: 2000 },
  false  // Mode rapide
)

// Mode premium (qualité max)
const premiumResponse = await callLLMWithFallback(
  [{ role: 'user', content: 'Analyse juridique complexe...' }],
  { temperature: 0.1, maxTokens: 4000 },
  true  // Mode premium → cloud providers
)
```

### 2. Services Utilisant le Helper
```typescript
import { callOllamaWithSDK } from '@/lib/ai/ollama-client-helper'

if (aiConfig.ollama.enabled) {
  try {
    const result = await callOllamaWithSDK(messages, {
      temperature: 0.1,
      maxTokens: 2000,
      // usePremiumModel ignoré avec Option C
    })
    // Utiliser result.content
  } catch (error) {
    // Fallback vers Groq/DeepSeek
  }
}
```

### 3. Interface Chat (Exemple)
```typescript
import { ModelSelector } from '@/components/chat/model-selector'
import { useState } from 'react'

export function ChatPage() {
  const [usePremiumModel, setUsePremiumModel] = useState(false)

  return (
    <>
      <ModelSelector
        isPremium={usePremiumModel}
        onToggle={setUsePremiumModel}
      />
      <ChatInterface usePremiumModel={usePremiumModel} />
    </>
  )
}
```

---

## Coûts Estimés

### Mode Rapide (Default)
- **Ollama local** : 0€
- Électricité VPS : inclus dans forfait

### Mode Premium (Opt-in)
| Provider | Coût / 1M tokens | Exemple 500 tokens |
|----------|------------------|---------------------|
| **Groq** | Gratuit (tier free) | 0€ |
| **DeepSeek** | 0.14$ / 1M | 0.00007€ |
| **Anthropic** | 3$ / 1M | 0.0015€ |

**Usage réaliste** :
- 100 requêtes premium/mois × 500 tokens = **0.01€ - 0.15€/mois**
- Groq tier gratuit suffit pour 95% des cas

---

## Performances Attendues

### Mode Rapide (Ollama qwen3:8b)
- **Latence** : 15-20s (VPS 4 CPU)
- **Throughput** : ~10 tokens/s
- **Qualité** : Correcte pour usage quotidien

### Mode Premium (Cloud)
- **Latence Groq** : 10-15s (très rapide)
- **Latence DeepSeek** : 15-25s
- **Latence Anthropic** : 20-30s
- **Qualité** : Excellente (niveau GPT-4)

---

## Tests de Validation

### Tests Unitaires
```bash
# Vérifier compilation TypeScript
npm run type-check

# Tests services
npm run test lib/ai/llm-fallback-service.test.ts
npm run test lib/ai/ollama-client-helper.test.ts
```

### Tests Manuels

#### Mode Rapide
```bash
# Dans dev tools console
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Explique le divorce en droit tunisien',
    usePremiumModel: false
  })
})
const data = await response.json()
console.log('Mode rapide:', data)
```

#### Mode Premium
```bash
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Rédige une assignation en divorce complexe',
    usePremiumModel: true
  })
})
const data = await response.json()
console.log('Mode premium:', data)
```

### Vérification Embeddings
```bash
# Tester génération embedding
curl http://localhost:11434/api/embeddings \
  -d '{"model": "qwen3-embedding:0.6b", "prompt": "test juridique"}'
```

---

## Monitoring Production

### Logs à Surveiller
```bash
# Logs Ollama
journalctl -u ollama -f

# Logs Next.js
docker logs -f moncabinet-nextjs | grep "LLM-Fallback"

# Vérifier circuit breaker
# Dans app admin → État système → Embeddings Circuit Breaker
```

### Métriques Clés
- **Taux fallback Ollama → Cloud** : <5% attendu
- **Latence moyenne mode rapide** : 15-20s
- **Latence moyenne mode premium** : 10-30s
- **Circuit breaker OPEN** : 0 occurrences/jour

---

## Rollback Plan

Si problèmes critiques :

### 1. Rollback vers qwen2.5:3b (stable)
```bash
ollama pull qwen2.5:3b
# .env.production
OLLAMA_CHAT_MODEL=qwen2.5:3b
```

### 2. Activer OpenAI temporaire
```bash
# .env.production
OPENAI_API_KEY=sk-proj-...
# Code fallback automatique existe toujours
```

### 3. Revert Git
```bash
git revert HEAD~5..HEAD  # Revenir avant migration
docker-compose up -d --build
```

---

## Avantages Option C

✅ **Économies** : 0€/mois usage normal vs ~50-100€/mois OpenAI
✅ **Pas d'upgrade VPS** : 8GB RAM suffisent (vs 64GB pour llama3.3:70b)
✅ **Qualité disponible** : Cloud LLMs accessibles sur demande
✅ **Flexibilité** : Utilisateur choisit rapidité vs qualité
✅ **Résilience** : Fallback automatique si Ollama down

## Inconvénients

⚠️ **Latence mode rapide** : 15-20s (vs 2-5s GPT-4 Turbo)
⚠️ **Dépendance réseau** : Mode premium nécessite internet
⚠️ **Quotas cloud** : Groq tier gratuit limité à ~100k tokens/jour

---

## Prochaines Étapes

1. ✅ Migration code terminée
2. ⏳ Créer store chat pour persister préférence usePremiumModel
3. ⏳ Intégrer ModelSelector dans interface chat
4. ⏳ Créer endpoint API `/api/chat` avec support usePremiumModel
5. ⏳ Tests end-to-end mode rapide + premium
6. ⏳ Déploiement staging
7. ⏳ Déploiement production
8. ⏳ Monitoring 1 semaine

---

## Support & Debugging

### Problème : Ollama ne démarre pas
```bash
# Vérifier statut
systemctl status ollama

# Logs
journalctl -u ollama -n 50

# Réinstaller
curl -fsSL https://ollama.com/install.sh | sh
```

### Problème : Modèle non trouvé
```bash
# Lister modèles disponibles
ollama list

# Re-télécharger
ollama pull qwen3:8b
ollama pull qwen3-embedding:0.6b
```

### Problème : Timeout embeddings
```bash
# Augmenter timeout
# .env.production
OLLAMA_CHAT_TIMEOUT_DEFAULT=180000  # 3 min au lieu de 2
```

### Problème : Circuit breaker OPEN
```bash
# API admin : POST /api/admin/embeddings/circuit-breaker/reset
# Ou attendre 60s (reset automatique)
```

---

## Références

- [Ollama Documentation](https://github.com/ollama/ollama)
- [Qwen3 Model Card](https://ollama.com/library/qwen3)
- [Groq API Docs](https://console.groq.com/docs)
- [DeepSeek API Docs](https://platform.deepseek.com/api-docs)
