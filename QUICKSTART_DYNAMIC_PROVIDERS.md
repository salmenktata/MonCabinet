# ⚡ Quickstart - Gestion Dynamique Providers

**5 minutes pour tester en local, 1h pour déployer en prod**

---

## 🚀 Tests Locaux (5 minutes)

### Option A: Script Automatique ✨ **RECOMMANDÉ**

```bash
# 1. Exécuter script setup (configure env + guide migration)
bash scripts/test-local-setup.sh

# 2. Appliquer migration manuellement (si Docker)
docker exec -i qadhya-postgres psql -U postgres -d qadhya_dev < migrations/20260215_create_operation_provider_configs.sql

# 3. Démarrer serveur
npm run dev

# 4. Ouvrir UI
open http://localhost:7002/super-admin/settings?tab=ai-architecture
```

### Option B: Manuel

```bash
# 1. Migration SQL
psql -U postgres -d qadhya_dev -f migrations/20260215_create_operation_provider_configs.sql

# 2. Vérifier 6 rows
psql -U postgres -d qadhya_dev -c "SELECT COUNT(*) FROM operation_provider_configs;"
# Attendu: 6

# 3. Feature flag
echo "DYNAMIC_OPERATION_CONFIG=true" >> .env.local

# 4. Démarrer
npm run dev

# 5. Tester UI
open http://localhost:7002/super-admin/settings?tab=ai-architecture
```

---

## ✅ Checklist Validation UI

**Ce que vous devriez voir:**

- [ ] Colonne "Operations Actives" dans table providers (en haut)
- [ ] Panel "Configuration par Opération" (en bas)
- [ ] Stats "6 Opérations configurées"
- [ ] Accordion avec 6 items
- [ ] Expand "Assistant IA" fonctionne
- [ ] Liste 4 providers affichée (Groq, Gemini, DeepSeek, Ollama)
- [ ] Toggle switch fonctionne (ON/OFF)
- [ ] Up/down arrows fonctionnent
- [ ] Modifier timeout → unsaved changes bar apparaît (sticky bottom jaune)
- [ ] Click "Enregistrer tout" → toast vert success
- [ ] Click "Tester tous" → toasts latency (292ms, etc.)
- [ ] Reload page → modifications persistées

**Si problème:**
- Vérifier console navigateur (F12) pour errors
- Vérifier migration appliquée: `SELECT * FROM operation_provider_configs;`
- Vérifier feature flag: `cat .env.local | grep DYNAMIC`

---

## 🧪 Tests (15 minutes)

### Tests Unitaires

```bash
# Run 40+ tests
npm run test lib/config/__tests__/operations-config-service.test.ts

# Attendu: ✅ 40+ tests pass
```

### Tests E2E (Playwright)

```bash
# Installer Playwright si pas déjà fait
npx playwright install

# Run tests E2E
npm run test:e2e tests/e2e/operations-config-ui.spec.ts

# Attendu: 30+ tests pass
```

### Tests API (Manuel - Postman/curl)

```bash
# GET list
curl http://localhost:7002/api/admin/operations-config | jq '.operations | length'
# Attendu: 6

# GET one
curl http://localhost:7002/api/admin/operations-config/assistant-ia | jq '.operation.primaryProvider'
# Attendu: "groq"

# Test provider
curl -X POST http://localhost:7002/api/admin/operations-config/test-provider \
  -H "Content-Type: application/json" \
  -d '{"provider":"groq","testType":"chat"}' \
  | jq '.result.latencyMs'
# Attendu: ~300ms
```

---

## 📦 Commit & Push (5 minutes)

```bash
# 1. Vérifier fichiers créés/modifiés
git status

# Attendu: 18+ fichiers (16 créés + 2 modifiés)

# 2. Add tous fichiers
git add migrations/20260215_create_operation_provider_configs.sql
git add lib/types/ai-config.types.ts
git add lib/validations/operations-config-schemas.ts
git add lib/config/operations-config-service.ts
git add lib/config/__tests__/operations-config-service.test.ts
git add app/api/admin/operations-config/
git add components/super-admin/settings/OperationsConfigPanel.tsx
git add components/super-admin/settings/OperationConfigCard.tsx
git add lib/hooks/useOperationsConfig.ts
git add lib/hooks/useProviderStatus.ts
git add docs/DYNAMIC_PROVIDERS_*.md
git add CHANGELOG_DYNAMIC_PROVIDERS.md
git add IMPLEMENTATION_COMPLETE.md
git add QUICKSTART_DYNAMIC_PROVIDERS.md
git add scripts/test-local-setup.sh
git add scripts/deploy-dynamic-providers-prod.sh
git add tests/e2e/operations-config-ui.spec.ts
git add app/super-admin/settings/page.tsx
git add components/super-admin/settings/ProviderConfigTable.tsx

# 3. Commit
git commit -m "feat(qadhya-ia): Gestion dynamique providers par opération

- Migration SQL: 2 tables (operation_provider_configs, ai_config_change_history)
- Service layer: CRUD config + cache 2-min + validation (700 lignes)
- API REST: 5 endpoints (list, get, update, reset, test)
- UI: Accordion 6 opérations + enhanced ProviderConfigTable
- Tests: 40+ unitaires + 30+ E2E Playwright
- Docs: 1400+ lignes documentation complète
- Scripts: Setup local + deploy production

Features:
✅ Enable/disable providers par opération
✅ Set primary + reorder fallback chain
✅ Configure timeouts (3 inputs)
✅ Test providers temps réel (latency)
✅ Validation real-time (errors inline)
✅ Unsaved changes warning
✅ Audit trail complet
✅ Colonne Operations Actives
✅ 100% backward compatible

Phases complétées: 1-5 (Core fonctionnel)
Tests: 70+ (40 unitaires + 30 E2E)
Documentation: 4 guides complets

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 4. Push
git push origin main
```

---

## 🚀 Déploiement Production (1h)

### Option A: Script Automatique ✨ **RECOMMANDÉ**

```bash
# Exécuter script complet avec tous checks
bash scripts/deploy-dynamic-providers-prod.sh

# Le script va:
# 1. Vérifier pre-flight checks (migration, SSH, git, tests)
# 2. Demander confirmation
# 3. Upload migration SQL
# 4. Backup DB production
# 5. Appliquer migration
# 6. Vérifier 6 rows insérées
# 7. Activer feature flag
# 8. Trigger GitHub Actions (Tier 2)
# 9. Guider health check post-déploiement
```

### Option B: Manuel (étapes détaillées)

#### Étape 1: SSH VPS

```bash
ssh root@84.247.165.187
```

#### Étape 2: Backup DB

```bash
pg_dump -U moncabinet -d qadhya > /opt/backups/qadhya_pre_dynamic_providers_$(date +%Y%m%d_%H%M%S).sql

# Vérifier backup créé
ls -lh /opt/backups/qadhya_pre_*.sql
```

#### Étape 3: Appliquer Migration

```bash
cd /opt/qadhya
psql -U moncabinet -d qadhya -f migrations/20260215_create_operation_provider_configs.sql
```

#### Étape 4: Vérifier Tables

```bash
# Vérifier 6 rows
psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM operation_provider_configs;"
# Attendu: 6

# Vérifier colonnes
psql -U moncabinet -d qadhya -c "\d operation_provider_configs"
```

#### Étape 5: Activer Feature Flag

```bash
echo "" >> /opt/qadhya/.env.production.local
echo "# Gestion Dynamique Providers (Feb 2026)" >> /opt/qadhya/.env.production.local
echo "DYNAMIC_OPERATION_CONFIG=true" >> /opt/qadhya/.env.production.local

# Vérifier
cat /opt/qadhya/.env.production.local | grep DYNAMIC
```

#### Étape 6: Exit SSH

```bash
exit
```

#### Étape 7: Trigger GitHub Actions (Tier 2)

```bash
# Rebuild Docker complet
gh workflow run "Deploy to VPS Contabo" -f force_docker=true

# Suivre progression
gh run watch
```

#### Étape 8: Health Check (après 8-10 min)

```bash
# Test API
curl https://qadhya.tn/api/admin/operations-config | jq '.operations | length'
# Attendu: 6

# Test health
curl https://qadhya.tn/api/health | jq '.status'
# Attendu: "healthy"

# Test UI
open https://qadhya.tn/super-admin/settings?tab=ai-architecture
# Vérifier panel visible
```

---

## 🆘 Rollback (si problème)

### Option 1: Désactiver Feature Flag (< 5 min)

```bash
ssh root@84.247.165.187

# Désactiver
sed -i 's/DYNAMIC_OPERATION_CONFIG=true/DYNAMIC_OPERATION_CONFIG=false/' /opt/qadhya/.env.production.local

# Restart
docker compose restart nextjs

# Vérifier
curl https://qadhya.tn/api/health | jq '.status'
```

### Option 2: Restore Backup DB (< 15 min)

```bash
ssh root@84.247.165.187

# Trouver backup
ls -lht /opt/backups/qadhya_pre_*.sql | head -1

# Restore
psql -U moncabinet -d qadhya < /opt/backups/qadhya_pre_dynamic_providers_YYYYMMDD_HHMMSS.sql

# Restart
docker compose restart nextjs
```

---

## 📚 Documentation

| Document | Utilité |
|----------|---------|
| `QUICKSTART_DYNAMIC_PROVIDERS.md` | **Ce fichier** - Commandes essentielles |
| `docs/DYNAMIC_PROVIDERS_README.md` | Guide utilisateur complet + troubleshooting |
| `docs/DYNAMIC_PROVIDERS_IMPLEMENTATION.md` | Plan technique détaillé + architecture |
| `CHANGELOG_DYNAMIC_PROVIDERS.md` | Changelog + breaking changes |
| `IMPLEMENTATION_COMPLETE.md` | Résumé exécutif + checklist |

---

## 💡 Tips Rapides

### Tip #1: Vérifier Migration Appliquée

```bash
# Local
psql -U postgres -d qadhya_dev -c "\dt operation*"

# Prod
ssh root@84.247.165.187 "psql -U moncabinet -d qadhya -c '\dt operation*'"

# Attendu: 2 tables
```

### Tip #2: Clear Cache

```bash
# UI: F5 (refresh page)
# API: Automatique après 2-min TTL
# Force clear: Modifier n'importe quelle config → auto-invalidate
```

### Tip #3: Déboguer API

```bash
# Logs serveur local
npm run dev
# Puis chercher "[OperationsConfigService]" dans output

# Logs production
ssh root@84.247.165.187 "docker logs qadhya-nextjs -f | grep OperationsConfig"
```

### Tip #4: Test Rapide Provider

```bash
# Via UI
# 1. Aller sur /super-admin/settings?tab=ai-architecture
# 2. Expand n'importe quelle opération
# 3. Click "Tester tous"
# → Résultats en 5-10s

# Via API
curl -X POST https://qadhya.tn/api/admin/operations-config/test-provider \
  -H "Content-Type: application/json" \
  -d '{"provider":"groq","testType":"chat"}'
```

---

## 🎉 Résumé 1-Minute

```bash
# LOCAL (5 min)
bash scripts/test-local-setup.sh
docker exec -i qadhya-postgres psql -U postgres -d qadhya_dev < migrations/20260215_create_operation_provider_configs.sql
npm run dev
open http://localhost:7002/super-admin/settings?tab=ai-architecture

# PRODUCTION (1h)
bash scripts/deploy-dynamic-providers-prod.sh
# Suivre instructions + attendre 10min
open https://qadhya.tn/super-admin/settings?tab=ai-architecture
```

**C'est tout!** 🚀

---

**Questions?** → `docs/DYNAMIC_PROVIDERS_README.md`

**Problème?** → Section Troubleshooting du README

**Happy configuring!** ✨
