# 🔍 Audit Menu Système (Super Admin)

**Date** : 9 février 2026
**Fichier source** : `components/super-admin/SuperAdminSidebar.tsx` (lignes 102-112)

---

## 📋 État Actuel du Menu Système

```typescript
{
  group: 'Système',
  items: [
    { href: '/super-admin/ai-costs', label: 'Coûts IA', icon: 'dollar' },
    { href: '/super-admin/provider-usage', label: 'Monitoring Providers', icon: 'activity' },
    { href: '/super-admin/audit-logs', label: 'Journal d\'audit', icon: 'shield' },
    { href: '/super-admin/backups', label: 'Sauvegardes', icon: 'database' },
    { href: '/super-admin/settings', label: 'Paramètres', icon: 'settings' },
    { href: '/super-admin/settings/providers', label: 'Fournisseurs IA', icon: 'zap' },
  ],
}
```

**Total** : 6 entrées

---

## ✅ Pages Existantes et Alignement

| # | Page | URL | Existe | Aligné Plan IA | Description |
|---|------|-----|--------|----------------|-------------|
| 1 | **Coûts IA** | `/super-admin/ai-costs` | ✅ | ✅ **OUI** | Monitoring coûts 30j (USD/TND), tokens, opérations |
| 2 | **Monitoring Providers** | `/super-admin/provider-usage` | ✅ | ✅ **OUI** | Matrice provider×opération (conforme `PROVIDER_USAGE_DASHBOARD.md`) |
| 3 | **Journal d'audit** | `/super-admin/audit-logs` | ✅ | ✅ **OUI** | Logs admin actions (sécurité) |
| 4 | **Sauvegardes** | `/super-admin/backups` | ✅ | ✅ **OUI** | Backup DB/MinIO (ops) |
| 5 | **Paramètres** | `/super-admin/settings` | ✅ | ✅ **OUI** | Tab "Architecture IA" (nouvelle interface avec Gemini) |
| 6 | **Fournisseurs IA** | `/super-admin/settings/providers` | ✅ | ❌ **DÉPRÉCIÉ** | Interface ancienne (Sprint 2), **redondante** |

---

## 🔴 Problèmes Critiques

### Problème #1 : Entrée Redondante "Fournisseurs IA"

**Situation** :
- Ligne 110 : `{ href: '/super-admin/settings/providers', label: 'Fournisseurs IA' }`
- Ligne 109 : `{ href: '/super-admin/settings', label: 'Paramètres' }` (contient déjà Architecture IA)

**Impact** :
- ❌ **Confusion utilisateur** : 2 chemins pour gérer providers IA
- ❌ **Incohérence** : "Paramètres" → Tab "Architecture IA" (nouvelle interface, avec Gemini)
- ❌ **Incohérence** : "Fournisseurs IA" → Ancienne interface (sans Gemini, lecture seule depuis Sprint 2)

**Selon Sprint 2 (9 février 2026)** :
- `/super-admin/settings/providers` = Interface **dépréciée**
- Bandeau orange "⚠️ Interface Dépréciée" + redirect vers `/super-admin/settings`
- Prévue suppression complète (Sprint 3, après 2 semaines observation)

**Recommandation** : ⚠️ **SUPPRIMER** l'entrée "Fournisseurs IA" immédiatement
- La nouvelle interface est déjà accessible via "Paramètres" > tab "Architecture IA"
- Évite confusion et double maintenance

---

### Problème #2 : Ordre Logique des Entrées

**Ordre actuel** (par apparition menu) :
1. Coûts IA
2. Monitoring Providers
3. Journal d'audit
4. Sauvegardes
5. Paramètres
6. Fournisseurs IA (déprécié)

**Problème** :
- ❌ Pages liées IA (Coûts, Monitoring, Config) dispersées
- ❌ "Paramètres" devrait être en premier (configuration globale)

**Ordre recommandé** (par priorité fonctionnelle) :
1. ⚙️ Paramètres (config globale)
2. 💰 Coûts IA (monitoring $)
3. 📊 Monitoring Providers (monitoring technique)
4. 🛡️ Journal d'audit (sécurité)
5. 💾 Sauvegardes (ops)

---

## ✅ Pages Conformes au Plan IA

### 1. Coûts IA (`/super-admin/ai-costs`)

**Contenu** :
- Coût total 30j (USD → TND conversion)
- Total opérations
- Utilisateurs uniques
- Total tokens

**Alignement Plan** : ✅ 100%
- Plan recommande : "Dashboard usage tokens par provider"
- Implémenté : Stats globales + historique 7j

**Amélioration possible** :
- Ajouter breakdown par provider (actuellement global)
- Ajouter alerte si budget >80% (mentionné dans plan)

---

### 2. Monitoring Providers (`/super-admin/provider-usage`)

**Contenu** :
- Matrice provider × opération (heatmap)
- Graphique tendances
- Distribution opérations (Pie chart)
- Breakdown coûts (Bar chart)
- Période: 7j / 30j

**Alignement Plan** : ✅ 100%
- Conforme à `docs/PROVIDER_USAGE_DASHBOARD.md`
- Providers trackés : Gemini, DeepSeek, Groq, Anthropic, Ollama
- Opérations : embedding, chat, generation, classification, extraction

**Suggestions** :
- Ajouter filtre par utilisateur (déjà dans code : `UserSelector.tsx`)
- Ajouter top users table (déjà dans code : `TopUsersTable.tsx`)

---

### 3. Journal d'audit (`/super-admin/audit-logs`)

**Contenu** : Logs actions admin

**Alignement Plan** : ✅ Neutre (pas mentionné dans plan IA, mais nécessaire sécurité)

---

### 4. Sauvegardes (`/super-admin/backups`)

**Contenu** : Backup DB/MinIO

**Alignement Plan** : ✅ Neutre (ops standard, pas lié plan IA)

---

### 5. Paramètres (`/super-admin/settings`)

**Contenu** (tabs) :
- ⚡ **Architecture IA** : `ProviderConfigTable` (Gemini, DeepSeek, Groq, Ollama, Anthropic, OpenAI)
- 📧 Email : Config Brevo/Resend
- 🗄️ Système : Clés API, CRON, configs
- ⚠️ Zone Dangereuse : Purge RAG

**Alignement Plan** : ✅ 100%
- Tab "Architecture IA" = Interface principale consolidée (Sprint 1)
- Affiche **tous** les providers (y compris Gemini priorité #6)
- Ordre priorité visible, badge actif dynamique

---

### 6. Fournisseurs IA (`/super-admin/settings/providers`) ❌

**Contenu** :
- Tab "Email" : Config Brevo/Resend
- Tab "IA" : `AIProvidersConfig` (ancienne interface)

**Alignement Plan** : ❌ **DÉPRÉCIÉ (Sprint 2 - 9 février 2026)**

**Problèmes** :
- ❌ N'affiche **PAS** Gemini (seulement DeepSeek, Groq, Ollama, Anthropic, OpenAI)
- ❌ Interface en lecture seule (bandeau orange)
- ❌ Redondante avec `/super-admin/settings` (tab Architecture IA)

**État Sprint 2** :
- Bandeau dépréciation ajouté
- Tous inputs désactivés
- Bouton redirect vers nouvelle interface
- Logging usage actif (`console.warn`)

**Action requise** :
- Supprimer entrée menu **MAINTENANT** (évite confusion)
- Conserver page 2 semaines (observation logs)
- Suppression complète Sprint 3 (23+ février 2026)

---

## 🎯 Recommandations Prioritaires

### 🔴 Priorité 1 : Supprimer Entrée Redondante (IMMÉDIAT)

**Action** : Supprimer ligne 110 dans `SuperAdminSidebar.tsx`

```diff
  {
    group: 'Système',
    items: [
+     { href: '/super-admin/settings', label: 'Paramètres', icon: 'settings' },
      { href: '/super-admin/ai-costs', label: 'Coûts IA', icon: 'dollar' },
      { href: '/super-admin/provider-usage', label: 'Monitoring Providers', icon: 'activity' },
      { href: '/super-admin/audit-logs', label: 'Journal d\'audit', icon: 'shield' },
      { href: '/super-admin/backups', label: 'Sauvegardes', icon: 'database' },
-     { href: '/super-admin/settings', label: 'Paramètres', icon: 'settings' },
-     { href: '/super-admin/settings/providers', label: 'Fournisseurs IA', icon: 'zap' },
    ],
  }
```

**Impact** :
- ✅ Supprime confusion (1 seul chemin vers config IA)
- ✅ Nouvelle interface devient la référence
- ✅ Ordre logique : Paramètres en premier
- ✅ Ancienne page reste accessible direct (2 semaines observation)

---

### 🟡 Priorité 2 : Améliorer Labels (RECOMMANDÉ)

**Actions** :

1. **Renommer "Paramètres" → "Configuration"** (plus clair)
2. **Ajouter sous-titre** pour "Monitoring Providers" :
   ```typescript
   { href: '/super-admin/provider-usage', label: 'Monitoring Providers', subtitle: 'Consommation IA', icon: 'activity' }
   ```

---

### 🟢 Priorité 3 : Ajouter Page Manquante (OPTIONNEL)

**Suggestion** : Ajouter page **"Quotas & Alertes"**

**Objectif** : Centraliser monitoring quotas providers
- Tier gratuit Gemini : 1M tokens/jour (afficher reste)
- DeepSeek solde : Afficher + alerte si <$5
- Groq rate limit : Afficher RPM restant

**URL** : `/super-admin/quotas`
**Icône** : `gauge` ou `trendingUp`

**Alignement Plan** :
- Plan mentionne : "Monitoring usage quotidien" + "Alerte si tier gratuit Gemini >80%"
- Actuellement : Dispersé dans plusieurs pages

---

## 📊 Menu Optimisé (Proposition Finale)

```typescript
{
  group: 'Système',
  items: [
    // Configuration globale (priorité 1)
    { href: '/super-admin/settings', label: 'Configuration', icon: 'settings' },

    // Monitoring IA (groupé)
    { href: '/super-admin/ai-costs', label: 'Coûts IA', icon: 'dollar' },
    { href: '/super-admin/provider-usage', label: 'Monitoring Providers', icon: 'activity' },

    // Sécurité & Ops
    { href: '/super-admin/audit-logs', label: 'Journal d\'audit', icon: 'shield' },
    { href: '/super-admin/backups', label: 'Sauvegardes', icon: 'database' },

    // OPTIONNEL : Nouveau
    // { href: '/super-admin/quotas', label: 'Quotas & Alertes', icon: 'gauge' },
  ],
}
```

**Changements** :
1. ❌ **Supprimé** : "Fournisseurs IA" (déprécié)
2. 📝 **Renommé** : "Paramètres" → "Configuration"
3. 📌 **Réordonné** : Config en premier, puis monitoring IA groupé, puis ops
4. 🆕 **Optionnel** : Page "Quotas & Alertes"

**Résultat** :
- **5 entrées** (au lieu de 6)
- **0 redondance**
- **Ordre logique** : Config → Monitoring → Ops
- **100% aligné** plan IA

---

## ✅ Checklist Validation

- [x] Toutes les pages existent
- [x] Pages alignées plan IA (100%)
- [x] Problème redondance identifié
- [ ] **TODO** : Supprimer entrée "Fournisseurs IA"
- [ ] **TODO** : Réordonner items (optionnel)
- [ ] **TODO** : Ajouter page Quotas (optionnel Sprint 4)

---

## 📅 Calendrier

| Action | Priorité | Effort | Deadline |
|--------|----------|--------|----------|
| Supprimer entrée "Fournisseurs IA" | 🔴 P1 | 2 min | **Immédiat** |
| Réordonner menu | 🟡 P2 | 5 min | Cette semaine |
| Renommer labels | 🟡 P2 | 5 min | Cette semaine |
| Page Quotas & Alertes | 🟢 P3 | 2-3h | Sprint 4 (optionnel) |

---

## 🎉 Résumé

**État actuel** : ⚠️ 83% aligné (5/6 pages conformes)

**Bloqueur** : Entrée redondante "Fournisseurs IA" (dépréciée Sprint 2)

**Action immédiate** : Supprimer ligne 110 `SuperAdminSidebar.tsx`

**Après correction** : ✅ 100% aligné plan IA

---

**Auteur** : Claude Sonnet 4.5
**Date** : 9 février 2026
