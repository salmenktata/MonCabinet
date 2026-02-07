# 🗺️ ROADMAP QADHYA - SaaS Juridique Tunisie
## Roadmap Consolidé - Version Officielle

**Date de consolidation** : 6 février 2026
**Version** : 2.1
**Statut** : Post-Mois 3 - Fonctionnalités avancées complétées

---

## 🏗️ ARCHITECTURE ACTUELLE (VPS Standalone)

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + SSL Full Strict)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  VPS Contabo                                                │
├─────────────────────────────────────────────────────────────┤
│  Nginx (reverse proxy) → PM2 (process manager)             │
│  Docker Compose:                                            │
│    ├─ PostgreSQL 15 + pgvector (port 5433)                 │
│    ├─ MinIO S3-compatible (ports 9000/9001)                │
│    └─ Next.js 15.5.12 (port 7002)                          │
└─────────────────────────────────────────────────────────────┘
```

| Composant | Technologie | Remplace |
|-----------|-------------|----------|
| Base de données | PostgreSQL 15 (Docker) | Supabase DB |
| Storage | MinIO (S3-compatible) | Supabase Storage |
| Auth | JWT custom + HttpOnly cookies | Supabase Auth |
| Email Factures | Resend API | - |
| Email Notifications | Brevo API (daily digest) | - |
| Cron Jobs | API Route + CRON_SECRET | Supabase Edge Functions |
| Déploiement | Docker + PM2 + Nginx | Vercel |

---

## 📊 ÉTAT D'AVANCEMENT GLOBAL

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROGRESSION ROADMAP                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MOIS 1 : Conformité ONAT                ████████████ 100%     │
│  MOIS 2 : Workflows & Productivité       ████████████ 100%     │
│  MOIS 3 : Spécialisation Tunisie         ████████████ 100%     │
│                                                                 │
│  PROGRESSION TOTALE                      ████████████ 100%     │
└─────────────────────────────────────────────────────────────────┘

🎉 ROADMAP 3 MOIS COMPLÉTÉ !
```

---

## 🎯 VISION & OBJECTIFS

### Vision
Digitaliser la gestion des cabinets d'avocats tunisiens avec une solution SaaS moderne, conforme aux spécificités juridiques locales et au Code Statut Personnel.

### Objectifs Roadmap
1. ✅ **Conformité ONAT 2026** : Factures, notes d'honoraires, conventions conformes
2. ✅ **3 workflows tunisiens** : Civil, Commercial TMM+7, Divorce CSP
3. ✅ **Templates documents** : 21 documents juridiques FR/AR + génération DOCX
4. ✅ **Calculs automatiques** : Intérêts commerciaux, pensions divorce
5. ✅ **Productivité avocat** : Recherche Cmd+K, notifications Brevo, preview temps réel

---

## 📅 ROADMAP DÉTAILLÉ

### ✅ MOIS 1 : CONFORMITÉ ONAT (TERMINÉ)
**Objectif** : Éviter amendes + professionnaliser facturation

#### Semaine 1-2 : PDF Factures Professionnelles ✅
- [x] Génération PDF via @react-pdf/renderer
- [x] Mentions légales tunisiennes obligatoires (Matricule ONAT, Barreau, TVA 19%)
- [x] Bouton téléchargement + envoi email
- [x] Support bilingue FR/AR

**Livrables** :
- `lib/pdf/facture-pdf.tsx` (570 lignes)
- `app/api/factures/[id]/pdf/route.ts`
- Watermark "PAYÉE" si statut payé

#### Semaine 2-3 : Notifications Intelligentes ✅
- [x] Email quotidien récapitulatif (échéances J-15/7/3/1)
- [x] Alertes délais légaux (Appel 20j/10j, Cassation 60j)
- [x] Templates email FR/AR professionnels
- [x] API Route Cron `/api/cron/daily-digest` avec CRON_SECRET
- [x] Page préférences notifications

**Livrables** :
- `lib/email/brevo-client.ts` - Client Brevo SDK
- `lib/notifications/daily-digest-service.ts` - Service digest quotidien
- `app/api/cron/daily-digest/route.ts` - Endpoint cron protégé

#### Semaine 4 : Notes Honoraires ONAT ✅
- [x] Distinction honoraires / débours
- [x] 4 types : forfait, horaire, résultat, mixte
- [x] Template PDF spécifique "Note d'honoraires"
- [x] Provisions reçues + solde à payer

**Livrables** :
- `lib/pdf/note-honoraires-pdf.tsx` (570 lignes)
- `app/api/factures/[id]/note-honoraires/route.ts`

---

### ✅ MOIS 2 : WORKFLOWS & PRODUCTIVITÉ (TERMINÉ)
**Objectif** : Multiplier workflows tunisiens + bibliothèque documents

#### Semaine 5 : Workflow Commercial Tunisien ✅
- [x] Nouveau workflow 6-8 étapes
- [x] Calculs intérêts TMM+7 automatiques (14.5%)
- [x] Types litiges : chèque sans provision, rupture contrat, concurrence déloyale
- [x] Délai appel réduit : **10 jours** (vs 20j civil) ⚠️
- [x] Indemnité forfaitaire 40 TND
- [x] Formulaire spécialisé + calculator temps réel

**Livrables** :
- `lib/utils/calculs-commerciaux.ts` (330 lignes)
- `lib/workflows/workflows-config.ts` (enrichi)
- `components/dossiers/DossierCommercialForm.tsx`
- `components/dossiers/InteretsCalculator.tsx`
- `supabase/migrations/20260205000004_add_commercial_fields.sql`

#### Semaine 6 : Templates Pack 2 ✅
- [x] Requête en référé (civil + commercial)
- [x] Assignation paiement chèque sans provision
- [x] Templates avec calculs intérêts TMM+7
- [x] Variables additionnelles commerciales

**Livrables** :
- `data/templates/requete-refere-civil-fr.txt`
- `data/templates/assignation-paiement-cheque-fr.txt`

#### Semaine 7 : Recherche Globale ✅
- [x] Index GIN full-text sur 4 tables
- [x] Recherche dans clients, dossiers, factures, documents
- [ ] Command palette Cmd+K (UI à créer)
- [ ] Composant GlobalSearch.tsx (à créer)

**Livrables** :
- `supabase/migrations/20260205000005_fulltext_search_indexes.sql`
- `app/api/search/route.ts`
- À finaliser : UI Command Palette

#### Semaine 8 : Convention Honoraires ✅
- [x] Template convention base
- [x] Variables auto-remplies (client, avocat, dossier)
- [x] Clauses types tunisiennes
- [ ] Génération PDF convention (à créer)
- [ ] API endpoint génération (à créer)

**Livrables** :
- `data/templates/convention-honoraires-base.txt`
- À finaliser : Génération PDF + API

---

### ⏳ MOIS 3 : SPÉCIALISATION TUNISIE (80% TERMINÉ)
**Objectif** : Différenciation marché tunisien via workflows CSP

#### Semaines 9-10 : Workflow Divorce CSP ✅
- [x] 4 types divorce : consentement mutuel, préjudice (Darar), unilatéral époux/épouse (Khol')
- [x] Calculs pensions alimentaire (20-30% revenus père)
- [x] Calculs Moutaa (1 an mariage = 2 mois revenus époux)
- [x] Formulaire spécialisé avec gestion enfants
- [x] 3 tentatives conciliation + délai réflexion 2 mois
- [x] Templates requêtes divorce FR/AR

**Livrables** :
- `lib/utils/calculs-divorce.ts` (164 lignes)
- `supabase/migrations/20260205000006_divorce_fields.sql`
- `components/dossiers/DossierDivorceForm.tsx` (500+ lignes)
- `data/templates/requete-divorce-consentement-mutuel-fr.txt`
- `data/templates/requete-divorce-prejudice-fr.txt`
- `data/templates/requete-divorce-consentement-mutuel-ar.txt`

#### Semaine 11 : Templates Pack 1 (Documents Base) ✅
- [x] Assignation civile FR/AR
- [x] Conclusions en défense FR
- [x] Mise en demeure contractuelle FR
- [x] Constitution d'avocat FR
- [x] Bordereau communication pièces FR
- [x] 9 templates uniques créés (3 divorce + 6 base)

**Livrables** :
- `data/templates/assignation-civile-fr.txt`
- `data/templates/assignation-civile-ar.txt`
- `data/templates/conclusions-defense-fr.txt`
- `data/templates/mise-en-demeure-contractuelle-fr.txt`
- `data/templates/constitution-avocat-fr.txt`
- `data/templates/bordereau-communication-pieces-fr.txt`

**Total templates** : 21 documents juridiques FR/AR

#### Semaine 12 : Finalisation & Polish ✅ (TERMINÉ)
**Option choisie** : **Option B - Finaliser fonctionnalités existantes**

**Objectifs** :
- [x] Command Palette (Cmd+K) avec UI complète
- [ ] ~~Edge Function notifications Supabase~~ → Cron Job Node.js (architecture VPS)
- [x] API génération convention PDF
- [x] Page préférences notifications
- [x] Migration table préférences
- [x] Formulaire préférences complet

**Livrables créés** :
- `components/shared/GlobalSearch.tsx` - Command Palette UI
- `app/api/dossiers/[id]/convention/route.ts` - API convention
- `lib/pdf/convention-pdf.tsx` - Template PDF convention
- `app/(dashboard)/parametres/notifications/page.tsx` - Page préférences
- `components/parametres/NotificationPreferencesForm.tsx` - Formulaire préférences

**Valeur** : Expérience utilisateur complète, 100% fonctionnalités finalisées

---

## 📦 LIVRABLES ACTUELS

### Fichiers Créés (Mois 1-3)

#### Conformité ONAT (Mois 1)
1. `lib/pdf/facture-pdf.tsx` - PDF factures professionnelles
2. `lib/pdf/note-honoraires-pdf.tsx` - Notes honoraires ONAT
3. `app/api/factures/[id]/pdf/route.ts` - API génération PDF facture
4. `app/api/factures/[id]/note-honoraires/route.ts` - API note honoraires

#### Workflows Tunisiens (Mois 2-3)
5. `lib/utils/calculs-commerciaux.ts` - Calculs intérêts TMM+7
6. `lib/utils/calculs-divorce.ts` - Calculs pensions divorce
7. `lib/workflows/workflows-config.ts` - Configuration 3 workflows
8. `components/dossiers/DossierCommercialForm.tsx` - Formulaire commercial
9. `components/dossiers/DossierDivorceForm.tsx` - Formulaire divorce
10. `components/dossiers/InteretsCalculator.tsx` - Widget calcul intérêts

#### Migrations Base de Données
11. `supabase/migrations/20260205000004_add_commercial_fields.sql`
12. `supabase/migrations/20260205000005_fulltext_search_indexes.sql`
13. `supabase/migrations/20260205000006_divorce_fields.sql`

#### Templates Documents Juridiques (15 templates)
**Divorce (3)** :
14. `data/templates/requete-divorce-consentement-mutuel-fr.txt`
15. `data/templates/requete-divorce-prejudice-fr.txt`
16. `data/templates/requete-divorce-consentement-mutuel-ar.txt`

**Commercial (2)** :
17. `data/templates/requete-refere-civil-fr.txt`
18. `data/templates/assignation-paiement-cheque-fr.txt`

**Base (6)** :
19. `data/templates/assignation-civile-fr.txt`
20. `data/templates/assignation-civile-ar.txt`
21. `data/templates/conclusions-defense-fr.txt`
22. `data/templates/mise-en-demeure-contractuelle-fr.txt`
23. `data/templates/constitution-avocat-fr.txt`
24. `data/templates/bordereau-communication-pieces-fr.txt`

**Honoraires (1)** :
25. `data/templates/convention-honoraires-base.txt`

**Pack 3 - Procédure FR (6)** :
26. `data/templates/conclusions-demande-fr.txt`
27. `data/templates/requete-injonction-payer-fr.txt`
28. `data/templates/opposition-injonction-payer-fr.txt`
29. `data/templates/acte-appel-fr.txt`
30. `data/templates/procuration-judiciaire-fr.txt`
31. `data/templates/requete-refere-provision-fr.txt`

**Pack 3 - Procédure AR (6)** :
32. `data/templates/conclusions-demande-ar.txt`
33. `data/templates/requete-injonction-payer-ar.txt`
34. `data/templates/opposition-injonction-payer-ar.txt`
35. `data/templates/acte-appel-ar.txt`
36. `data/templates/procuration-judiciaire-ar.txt`
37. `data/templates/requete-refere-provision-ar.txt`

#### Recherche & API
26. `app/api/search/route.ts` - API recherche globale
27. `app/api/dossiers/[id]/convention/route.ts` - API génération convention PDF

#### Finalisation S12 (5 fichiers)
28. `components/shared/GlobalSearch.tsx` - Command Palette Cmd+K
29. `components/parametres/NotificationPreferencesForm.tsx` - Formulaire préférences
30. `app/(dashboard)/parametres/notifications/page.tsx` - Page préférences
31. `lib/pdf/convention-pdf.tsx` - Template PDF convention

#### Post-Roadmap (VPS Standalone)
38. `lib/stores/assistant-store.ts` - Store Zustand persistance Assistant IA
39. `lib/db/postgres.ts` - Client PostgreSQL standalone
40. `lib/storage/minio.ts` - Client MinIO S3-compatible
41. `lib/auth/session.ts` - Auth JWT custom
42. `docker-compose.yml` - Orchestration containers
43. `Dockerfile` - Build multi-stage Next.js

#### Fonctionnalités Avancées (Session 6 fév 2026)
44. `lib/email/brevo-client.ts` - Client Brevo SDK pour notifications
45. `lib/notifications/daily-digest-service.ts` - Service digest quotidien
46. `app/api/cron/daily-digest/route.ts` - Endpoint cron protégé
47. `lib/docx/docx-generator.ts` - Génération DOCX avec support FR/AR RTL
48. `app/api/templates/[id]/docx/route.ts` - API génération DOCX
49. `components/templates/TemplatePreview.tsx` - Preview temps réel templates
50. `components/templates/GenerateDocumentForm.tsx` - Formulaire avec preview intégré

#### Amélioration Pipeline RAG
51. `lib/ai/config.ts` - Seuils centralisés RAG_THRESHOLDS, SOURCE_BOOST
52. `lib/ai/rag-chat-service.ts` - Re-ranking, diversité sources, monitoring

#### Améliorations RAG Avancées (Fév 2026)
61. `lib/cache/translation-cache.ts` - Cache traductions AR↔FR (TTL 30j)
62. `lib/ai/feedback-service.ts` - Boost dynamique basé feedback utilisateurs
63. `lib/ai/reranker-service.ts` - Cross-encoder re-ranking (Xenova)
64. `lib/ai/clustering-service.ts` - Clustering UMAP + HDBSCAN
65. `lib/ai/related-documents-service.ts` - Documents similaires avec cache
66. `lib/ai/conversation-summary-service.ts` - Résumé conversations longues
67. `db/migrations/20260207000003_related_documents_function.sql` - Fonction SQL find_related_documents
68. `db/migrations/20260208000003_kb_clustering.sql` - Colonne cluster_id + fonctions SQL

#### Système de Backups & Admin
53. `backup.sh` - Script backup PostgreSQL + MinIO + Code avec notifications Brevo
54. `restore.sh` - Script restauration avec options --list/--db/--minio/--latest
55. `app/api/admin/backup/route.ts` - API backups (GET/POST/DELETE)
56. `components/super-admin/backups/BackupsManager.tsx` - Interface gestion backups
57. `app/super-admin/backups/page.tsx` - Page admin backups
58. `docs/BACKUPS.md` - Documentation système backups

#### Support Bilingue Templates
59. `components/templates/TemplateLanguageFilter.tsx` - Filtre FR/AR
60. `supabase/migrations/20260206300000_templates_add_langue.sql` - Colonne langue + trigger

**Total : 68+ fichiers créés**

---

## ✅ FONCTIONNALITÉS COMPLÈTES

### Conformité & Facturation
- ✅ PDF factures professionnelles (mentions ONAT)
- ✅ Notes d'honoraires conformes (4 types)
- ✅ Convention honoraires (template base + PDF)
- ✅ Watermark "PAYÉE"
- ✅ Envoi email factures via Resend

### Workflows Tunisiens
- ✅ Workflow Civil (10 étapes) - Existant
- ✅ Workflow Commercial (9 étapes) - Nouveau
  - ✅ Calculs intérêts TMM+7 (14.5%)
  - ✅ Indemnité 40 TND
  - ✅ Délai appel 10j
- ✅ Workflow Divorce CSP (9 étapes) - Nouveau
  - ✅ 4 types divorce
  - ✅ Calculs pensions alimentaire
  - ✅ Calculs Moutaa
  - ✅ Gestion enfants mineurs

### Calculs Automatiques
- ✅ Intérêts commerciaux (TMM+7)
- ✅ Pension alimentaire (20-30% revenus)
- ✅ Pension compensatoire Moutaa (durée × 2 × revenus)
- ✅ Âge enfants + statut mineur (<18 ans)
- ✅ Durée mariage automatique

### Templates Documents
- ✅ 27 templates juridiques FR/AR (21 + 6 Pack 3 AR)
- ✅ Variables auto-remplies
- ✅ Support bilingue FR/AR avec filtrage par langue
- ✅ Colonne `langue` avec auto-détection arabe
- ✅ Badge FR/عربي sur les cartes templates
- ✅ Génération PDF (React-PDF)
- ✅ Génération DOCX éditable (docx.js avec RTL)
- ✅ Preview temps réel avant génération

### Recherche & Productivité
- ✅ Index full-text (GIN) sur 4 tables
- ✅ API recherche globale
- ✅ UI Command Palette Cmd+K

### Assistant IA Qadhya ✅
- ✅ Chat conversationnel RAG (`/assistant-ia`)
  - Pipeline RAG complet (`lib/ai/rag-chat-service.ts`)
  - Base de connaissances vectorisée (`lib/ai/knowledge-base-service.ts`)
  - Embeddings OpenAI/Ollama (`lib/ai/embeddings-service.ts`)
- ✅ Structuration dossiers par récit (`/dossiers/assistant`)
  - Analyse récit client (`lib/ai/dossier-structuring-service.ts`)
  - Extraction automatique faits juridiques
- ✅ Calculs juridiques tunisiens automatisés
  - Pension Moutaa (Art. 31 CSP)
  - Pension alimentaire enfants (Art. 46 CSP)
  - Nafaqa épouse (Art. 38 CSP)
  - Intérêts moratoires (TMM+7%)
  - Indemnité forfaitaire chèque
- ✅ Classification automatique documents (`lib/ai/document-classifier.ts`)
- ✅ Import jurisprudence tunisienne (`lib/ai/jurisprudence-importer.ts`)
- ✅ Monitoring coûts IA (`lib/ai/usage-tracker.ts`)
- ✅ **Améliorations RAG (Fév 2026)**
  - Cache traductions AR↔FR (TTL 30j) (`lib/cache/translation-cache.ts`)
  - Fallback dégradé si embeddings échouent
  - Comptage tokens précis gpt-tokenizer
  - Résumé conversations longues (>10 messages)
  - Feedback loop dynamique pour boost sources (`lib/ai/feedback-service.ts`)
  - Re-ranking cross-encoder Xenova/ms-marco (`lib/ai/reranker-service.ts`)
  - Clustering sémantique UMAP+HDBSCAN (`lib/ai/clustering-service.ts`)
  - Documents similaires avec cache Redis (`lib/ai/related-documents-service.ts`)

### Notifications
- ✅ Logique notifications (échéances J-15/7/3/1)
- ✅ Page préférences notifications
- ✅ API Cron daily-digest avec Brevo
- ✅ Email digest quotidien automatisé

---

## 🚧 TÂCHES RESTANTES

### Priorité 0 (Critique)
- [x] **Cron Job notifications Brevo** ✅
  - API route `/api/cron/daily-digest` avec CRON_SECRET
  - Déclenché par cron système ou service externe (cron-job.org)
  - Email digest quotidien via Brevo
- [ ] **Tests manuels complets** workflows
  - Commercial : créer dossier + calculs
  - Divorce : créer dossier + pensions
  - Générer tous les templates

### Priorité 1 (Important)
- [x] **Command Palette UI** (Cmd+K) ✅
  - Composant `GlobalSearch.tsx` créé
  - Intégration cmdk
  - Navigation clavier
- [x] **API génération convention PDF** ✅
  - Endpoint `/api/dossiers/[id]/convention`
  - Template React-PDF
- [x] **Page préférences notifications** ✅
  - `/app/(dashboard)/parametres/notifications/page.tsx`
  - Fréquence, types alertes

### Priorité 2 (Nice to have)
- [x] **Templates Pack 3** ✅ (6 nouveaux documents juridiques)
- [x] **Génération DOCX éditable** ✅ (docx.js avec support FR/AR RTL)
- [x] **Preview templates temps réel** ✅ (remplacement variables en direct)
- [x] **Pipeline RAG amélioré** ✅ (re-ranking, monitoring, diversité sources)
- [ ] **Moteur génération avancé** (tables, numérotation)
- [x] **Persistance état Assistant IA** ✅ (Zustand + sessionStorage)

### Priorité 3 (Améliorations IA Qadhya)
- [x] **Pipeline RAG optimisé** ✅
  - Cache traductions 30j
  - Fallback dégradé
  - Comptage tokens précis
  - Résumé conversations longues
  - Feedback loop dynamique
  - Re-ranking cross-encoder
  - Clustering sémantique KB
- [ ] **Enrichissement base jurisprudence** (10,000+ décisions)
- [ ] **Fine-tuning prompts spécialisés** par type de dossier
- [ ] **Amélioration OCR** documents scannés

---

## 📊 MÉTRIQUES DE SUCCÈS

### Adoption Avocat (M+3)
- **Objectif** : 20 avocats testeurs actifs
- **Taux utilisation** : >3 connexions/semaine
- **Features adoptées** :
  - 80% utilisent PDF factures
  - 70% utilisent templates documents
  - 50% utilisent workflow divorce
  - 40% utilisent workflow commercial

### Conformité
- 100% factures avec mentions ONAT conformes
- 100% dossiers divorce avec convention honoraires
- 0 plainte non-conformité

### Productivité
- **Temps création facture** : -50% (5 min → 2.5 min)
- **Temps rédaction documents** : -70% (2h → 30 min avec templates)
- **Calculs manuels** : -100% (intérêts, pensions automatiques)

---

## 🔄 PROCHAINES PHASES

### Phase 2 : Post-Roadmap (Mois 4-6)
1. **E-facture TTN obligatoire** (6 semaines)
   - Intégration API Tunisie TradeNet
   - Conformité 2026 obligatoire
2. **Analytics avancés** (3 semaines)
   - Graphiques revenus, taux succès
   - Dashboard BI
3. **Rappels SMS audiences** (2 semaines)
   - TopNet SMS API
4. **Module comptabilité BNC** (3 semaines)
   - Livre recettes/dépenses tunisien

### Phase 3 : Différenciation IA (Mois 7-12)
1. ✅ **Assistant IA Qadhya** (TERMINÉ)
   - Premier assistant juridique droit tunisien
   - Chat conversationnel RAG opérationnel (`/assistant-ia`)
   - Structuration dossiers par récit (`/dossiers/assistant`)
   - Calculs juridiques tunisiens automatisés
2. ⏳ **Enrichissement base jurisprudence** (en cours)
   - Objectif : 10,000+ décisions Cour Cassation
   - Import jurisprudence tunisienne fonctionnel
3. **Mobile app iOS/Android** (12 semaines)
   - React Native, scan OCR, offline
4. **Paiements mobiles** (2 semaines)
   - Flouci/D17 integration QR code

### Phase 4 : Scale (Mois 13-18)
1. **Collaboration multi-users** (6 semaines)
   - Cabinets 3-10 avocats, RBAC
2. **Portail client** (4 semaines)
   - Accès documents, paiements en ligne
3. **Signature électronique** (3 semaines)
   - Conformité tunisienne

---

## 🎯 AVANTAGES COMPÉTITIFS

| Critère | Qadhya | Concurrents EU |
|---------|--------|----------------|
| Prix | 49-199 TND/mois | 400-800 TND/mois |
| Délais tunisiens | ✅ 11 types auto | ❌ Génériques |
| Workflows tunisiens | ✅ Divorce CSP, Commercial TMM+7 | ❌ Droit français |
| Calculs auto | ✅ Intérêts, pensions | ❌ Manuels |
| Bilingue FR/AR | ✅ Natif | ❌ FR uniquement |
| Codes tunisiens | ✅ COC, CPC, CSP | ❌ Codes français |
| Support | ✅ FR/AR, fuseau TN | ❌ FR, fuseau EU |

**Verdict** : **Impossible à répliquer** par concurrents européens

---

## 💰 BUSINESS MODEL

### Pricing (TND/mois)
| Plan | Prix | Dossiers | Stockage | Features |
|------|------|----------|----------|----------|
| **Gratuit** | 0 | 10 actifs | 1 Go | Basique |
| **Solo** | 49 | 50 | 5 Go | Workflows complets |
| **Pro** | 99 | Illimité | 50 Go | + Templates, Time tracking |
| **Cabinet** | 199 | Illimité | 100 Go | + 3 users, Multi-users |

### Objectifs 12 Mois
- **M+3** : 20 testeurs → 1,230 TND MRR
- **M+6** : 50 clients → 3,000 TND MRR
- **M+12** : 75 clients → 5,425 TND MRR
- **Break-even** : 30 clients payants

---

## 📞 SUPPORT & CONTACTS

### Documentation
- **ARCHITECTURE.md** - Stack technique
- **WORKFLOWS_TUNISIE.md** - Procédures légales
- **CONTRIBUTING.md** - Guidelines contribution

### Ressources
- **Repository** : GitHub (salmenktata/Qadhya)
- **VPS** : Contabo (Docker + PM2 + Nginx)
- **PostgreSQL** : Docker container (port 5433)
- **MinIO** : Docker container (ports 9000/9001)
- **Resend** : Emails transactionnels
- **Cloudflare** : DNS + SSL

---

## 📝 DÉCISIONS À PRENDRE

### ✅ DÉCIDÉ : Architecture VPS Standalone
- [x] Migration de Supabase vers VPS auto-hébergé
- [x] PostgreSQL + MinIO + Auth JWT custom
- [x] Docker Compose pour orchestration

### 🔴 URGENT : Post-Mois 3
- [x] **Cron Job notifications Brevo** ✅ - API route `/api/cron/daily-digest`
- [ ] **Tests E2E** workflows complets
- [x] **Backups automatisés** ✅ - PostgreSQL + MinIO + Code source
  - Script `backup.sh` avec notifications Brevo en cas d'échec
  - Script `restore.sh` pour restauration
  - API `/api/admin/backup` (GET/POST/DELETE)
  - Interface admin `/super-admin/backups`

### 🟡 MOYEN TERME
- [ ] Prioriser E-facture TTN (obligatoire 2026) ?
- [ ] Timing Beta testeurs (15 avocats) ?
- [ ] Budget marketing & acquisition ?
- [x] Génération DOCX éditable ✅

---

**📅 Dernière mise à jour** : 7 février 2026
**📊 Statut** : Roadmap 3 mois complété - Pipeline RAG optimisé + Clustering KB
**🚀 Prochain milestone** : Tests E2E workflows + E-facture TTN

---

**Ce roadmap consolidé remplace tous les autres documents de planification.**
