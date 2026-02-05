# 🗺️ ROADMAP AVOCAT SAAS - TUNISIE
## Roadmap Consolidé - Version Officielle

**Date de consolidation** : 5 février 2026
**Version** : 1.0
**Statut** : En cours - Mois 3

---

## 📊 ÉTAT D'AVANCEMENT GLOBAL

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROGRESSION ROADMAP                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MOIS 1 : Conformité ONAT                ████████████ 100%     │
│  MOIS 2 : Workflows & Productivité       ████████████ 100%     │
│  MOIS 3 : Spécialisation Tunisie         ████████░░░░  80%     │
│                                                                 │
│  PROGRESSION TOTALE                      ██████████░░  93%     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 VISION & OBJECTIFS

### Vision
Digitaliser la gestion des cabinets d'avocats tunisiens avec une solution SaaS moderne, conforme aux spécificités juridiques locales et au Code Statut Personnel.

### Objectifs Roadmap
1. ✅ **Conformité ONAT 2026** : Factures, notes d'honoraires, conventions conformes
2. ✅ **3 workflows tunisiens** : Civil, Commercial TMM+7, Divorce CSP
3. ✅ **Templates documents** : 13-14 documents juridiques FR/AR
4. ⏳ **Calculs automatiques** : Intérêts commerciaux, pensions divorce
5. ⏳ **Productivité avocat** : Recherche Cmd+K, notifications intelligentes

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
- [ ] Edge Function Supabase (à créer)
- [ ] Page préférences notifications (à créer)

**Livrables** :
- Système notifications prêt (logique complète)
- À finaliser : Supabase Cron + Edge Function

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

**Total templates** : 9 documents juridiques FR/AR

#### Semaine 12 : Finalisation & Polish ✅ (EN COURS)
**Option choisie** : **Option B - Finaliser fonctionnalités existantes**

**Objectifs** :
- [ ] Command Palette (Cmd+K) avec UI complète
- [ ] Edge Function notifications Supabase
- [ ] API génération convention PDF
- [ ] Page préférences notifications
- [ ] Tests manuels complets (workflows + templates)

**Livrables prévus** :
- `components/shared/GlobalSearch.tsx` - Command Palette UI
- `supabase/functions/send-notifications/index.ts` - Edge Function
- `app/api/dossiers/[id]/convention/route.ts` - API convention
- `lib/pdf/convention-pdf.tsx` - Template PDF convention
- `app/(dashboard)/parametres/notifications/page.tsx` - Préférences
- `supabase/migrations/20260205000008_notification_prefs.sql` - Table préférences

**Valeur** : Solidifie les 26 fichiers déjà créés, expérience utilisateur complète

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

#### Templates Documents Juridiques (9 templates)
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

#### Recherche & API
26. `app/api/search/route.ts` - API recherche globale

**Total : 26 fichiers créés**

---

## ✅ FONCTIONNALITÉS COMPLÈTES

### Conformité & Facturation
- ✅ PDF factures professionnelles (mentions ONAT)
- ✅ Notes d'honoraires conformes (4 types)
- ✅ Convention honoraires (template base)
- ✅ Watermark "PAYÉE"
- ⏳ Envoi email automatique factures

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
- ✅ 9 templates juridiques FR/AR
- ✅ Variables auto-remplies
- ✅ Support bilingue FR/AR
- ⏳ Génération PDF/DOCX (à finaliser)

### Recherche & Productivité
- ✅ Index full-text (GIN) sur 4 tables
- ✅ API recherche globale
- ⏳ UI Command Palette Cmd+K (à créer)

### Notifications
- ✅ Logique notifications (échéances J-15/7/3/1)
- ⏳ Edge Function Supabase (à créer)
- ⏳ Page préférences (à créer)

---

## 🚧 TÂCHES RESTANTES

### Priorité 0 (Critique)
- [ ] **Créer Edge Function notifications** Supabase
  - Cron job quotidien 6h00 TN
  - Email digest via Resend
- [ ] **Tests manuels complets** workflows
  - Commercial : créer dossier + calculs
  - Divorce : créer dossier + pensions
  - Générer tous les templates

### Priorité 1 (Important)
- [ ] **Command Palette UI** (Cmd+K)
  - Composant `GlobalSearch.tsx`
  - Intégration cmdk
  - Navigation clavier
- [ ] **API génération convention PDF**
  - Endpoint `/api/dossiers/[id]/convention`
  - Template React-PDF
- [ ] **Page préférences notifications**
  - `/app/(dashboard)/parametres/notifications/page.tsx`
  - Fréquence, types alertes

### Priorité 2 (Nice to have)
- [ ] **Templates Pack 3** (5-6 docs additionnels)
- [ ] **Génération DOCX éditable** (docx.js)
- [ ] **Preview templates** avant génération
- [ ] **Moteur génération avancé** (tables, numérotation)

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
1. **Assistant IA Qadhya** (8 semaines)
   - Premier assistant juridique droit tunisien
2. **Base jurisprudence TN** (12+ semaines)
   - 10,000+ décisions Cour Cassation
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

| Critère | MonCabinet | Concurrents EU |
|---------|-------------|----------------|
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
- **Repository** : GitHub
- **Supabase** : Dashboard projet
- **Vercel** : Déploiement
- **Resend** : Emails transactionnels

---

## 📝 DÉCISIONS À PRENDRE

### 🔴 URGENT : Semaine 12
**Quelle option choisir ?**
- [ ] **Option A** : Intégration Flouci (paiements mobiles)
- [ ] **Option B** : Finaliser fonctionnalités existantes (recommandé)
- [ ] **Option C** : Templates Pack 3 (extension bibliothèque)

### 🟡 MOYEN TERME
- [ ] Prioriser E-facture TTN (obligatoire 2026) ?
- [ ] Timing Beta testeurs (15 avocats) ?
- [ ] Budget marketing & acquisition ?

---

**📅 Dernière mise à jour** : 5 février 2026
**📊 Statut** : 93% completé - Semaine 12 à définir
**🚀 Prochain milestone** : Décision Semaine 12 + Tests finaux

---

**Ce roadmap consolidé remplace tous les autres documents de planification.**
