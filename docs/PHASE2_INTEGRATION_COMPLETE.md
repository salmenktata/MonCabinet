# Phase 2 : Intégration UI - TERMINÉE ✅

**Date** : 9 février 2026
**Statut** : Intégration complète + Page de test

---

## 📁 Fichiers Créés/Modifiés

### Nouveaux Fichiers
- ✅ `lib/stores/chat-store.ts` - Store Zustand pour préférence mode
- ✅ `app/(app)/chat-test/page.tsx` - Page de test interactive

### Fichiers Modifiés
- ✅ `lib/ai/rag-chat-service.ts` - Support `usePremiumModel` dans ChatOptions
- ✅ `app/api/chat/route.ts` - Accepte et propage `usePremiumModel`

---

## 🧪 Test de la Migration

### 1. Prérequis

```bash
# Démarrer Ollama
ollama serve

# Télécharger les modèles (si pas déjà fait)
ollama pull qwen3:8b
ollama pull qwen3-embedding:0.6b

# Vérifier que les modèles sont installés
ollama list
```

### 2. Démarrer le dev

```bash
npm run dev
```

### 3. Accéder à la page de test

Ouvrir dans le navigateur :
```
http://localhost:7002/chat-test
```

### 4. Scénarios de Test

#### Test 1 : Mode Rapide (Ollama)
1. **Toggle désactivé** (⚡ Mode Rapide)
2. Poser une question : "Quels sont les délais pour déposer une assignation en divorce ?"
3. **Attendre ~15-20 secondes**
4. Vérifier la réponse + métadonnées
5. **Console logs** devrait afficher : `[LLM-Fallback] Mode Rapide → Ollama (qwen3:8b)`

#### Test 2 : Mode Premium (Cloud)
1. **Activer le toggle** (🧠 Mode Premium)
2. Poser la même question
3. **Attendre ~10-30 secondes**
4. Vérifier la réponse (devrait être plus détaillée)
5. **Console logs** devrait afficher : `[LLM-Fallback] Mode Premium activé → utilisation cloud providers`

#### Test 3 : Fallback Automatique
1. **Stopper Ollama** : `killall ollama` (ou Ctrl+C dans le terminal ollama serve)
2. Mode rapide activé (⚡)
3. Poser une question
4. **Vérifier que ça passe automatiquement sur Groq/DeepSeek**
5. Console logs : `[LLM-Fallback] ⚠ Ollama échoué, fallback vers cloud providers`
6. Redémarrer Ollama : `ollama serve`

#### Test 4 : Persistance Préférence
1. Activer mode premium
2. Recharger la page (F5)
3. **Vérifier que le toggle reste activé** (stocké dans localStorage)

---

## 🔍 Vérification Console

### Logs attendus (Mode Rapide réussi)
```
[LLM-Fallback] Mode Rapide → Ollama (qwen3:8b)
[RAG] Sources trouvées: 5
[Chat API] Réponse générée en 18.2s
```

### Logs attendus (Mode Premium)
```
[LLM-Fallback] Mode Premium activé → utilisation cloud providers
[LLM-Fallback] groq rate limited (429), skipping retries
[LLM-Fallback] ✓ Fallback réussi: groq → deepseek
[Chat API] Réponse générée en 12.5s
```

### Logs attendus (Fallback Ollama → Cloud)
```
[LLM-Fallback] Mode Rapide → Ollama (qwen3:8b)
[LLM-Fallback] ⚠ Ollama échoué, fallback vers cloud providers
[LLM-Fallback] ✓ Fallback réussi: ollama → groq
```

---

## 📊 Comparaison Attendue

| Critère | Mode Rapide (Ollama) | Mode Premium (Cloud) |
|---------|----------------------|----------------------|
| **Temps** | 15-20s | 10-30s |
| **Coût** | 0€ | ~0.001-0.01€ |
| **Qualité** | Bonne | Excellente |
| **Usage** | Quotidien | Analyses complexes |

---

## ✅ Checklist de Validation

- [ ] **TypeScript** : `npm run type-check` → 0 erreurs
- [ ] **Mode Rapide** : Réponse obtenue avec Ollama (~15-20s)
- [ ] **Mode Premium** : Réponse obtenue avec cloud (~10-30s)
- [ ] **Fallback** : Si Ollama down, bascule automatique sur cloud
- [ ] **Toggle UI** : Fonctionne et affiche tooltip correct
- [ ] **Persistance** : Préférence sauvegardée dans localStorage
- [ ] **Console logs** : Messages clairs sur le provider utilisé

---

## 🚀 Prochaines Étapes

### Option A : Intégrer dans l'interface chat principale
- Chercher la page chat existante
- Ajouter `ModelSelector` dans le header
- Connecter au store

### Option B : Créer une nouvelle interface chat
- Utiliser `chat-test/page.tsx` comme base
- Améliorer l'UI (messages en liste, streaming, etc.)
- Ajouter historique conversations

### Option C : Déployer en production
- Mettre à jour `.env.production` avec nouvelles variables
- Déployer sur VPS
- Tester en conditions réelles
- Monitorer les logs

---

## 🐛 Troubleshooting

### Problème : "Ollama n'est pas accessible"
```bash
# Vérifier si Ollama tourne
ps aux | grep ollama

# Redémarrer
ollama serve
```

### Problème : "Modèle qwen3:8b non trouvé"
```bash
ollama pull qwen3:8b
```

### Problème : Toggle ne persiste pas
```bash
# Vérifier localStorage dans DevTools Console
localStorage.getItem('chat-preferences')

# Si vide, vérifier que zustand/middleware persist est bien installé
npm list zustand
```

### Problème : Toujours mode premium même toggle désactivé
```bash
# Nettoyer le localStorage
localStorage.removeItem('chat-preferences')
# Recharger la page
```

---

## 📈 Métriques à Surveiller

Après quelques jours d'utilisation :

1. **Taux d'utilisation mode premium** : Objectif <20% (mode rapide suffisant pour la majorité)
2. **Taux de fallback Ollama → Cloud** : Objectif <5% (Ollama fiable)
3. **Temps réponse moyen mode rapide** : Objectif 15-20s
4. **Temps réponse moyen mode premium** : Objectif 10-30s
5. **Coûts API cloud** : Objectif <15€/mois

---

## 🎉 Résultat Attendu

Après cette Phase 2, vous devriez avoir :

✅ Un système hybride fonctionnel
✅ Une page de test pour valider
✅ Un store qui persiste la préférence
✅ Un toggle UI qui fonctionne
✅ Des logs clairs pour déboguer
✅ Un fallback automatique robuste

**Phase 3** (optionnelle) : Intégration dans l'interface chat principale + déploiement production
