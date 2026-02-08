# 🚀 Classification RAG - Démarrage Rapide

Guide de démarrage rapide pour le système de classification juridique automatique.

---

## ⚡ Installation (5 minutes)

### 1. Installer les dépendances
```bash
npm install node-cron @types/node-cron
```

### 2. Appliquer les migrations
```bash
# Toutes les migrations en une commande
for file in db/migrations/20260208_*.sql; do
  docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet < "$file"
done

# Seed des règles pour 9anoun.tn
docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet < db/seeds/classification-rules-9anoun.sql
```

### 3. Configuration (optionnel)
```bash
# Ajouter au .env si vous voulez personnaliser
echo "LEARNING_CYCLE_CRON=0 2 * * *" >> .env
echo "DISABLE_CRON=false" >> .env
```

✅ **C'est tout ! Le système est prêt.**

---

## 🧪 Test Rapide

```bash
# Tester la classification
npx tsx scripts/test-page-classification.ts

# Devrait afficher:
# ✅ Classification: legislation / civil / loi
# ✅ Confiance: 70%+
# ✅ Règles matchées: 1
# ✅ Mots-clés: code, obligation, ...
```

---

## 📊 Accéder au Dashboard

```bash
# Démarrer le serveur Next.js
npm run dev

# Ouvrir dans le navigateur
open http://localhost:3000/super-admin/classification/metrics
```

Vous verrez :
- 📈 KPIs en temps réel
- 📊 Graphiques de distribution
- 📋 Efficacité des règles
- 🔄 Bouton pour lancer l'apprentissage

---

## 🤖 Apprentissage Automatique

### Option 1: Cron Système (Production)
```bash
# 1. Copier et personnaliser
cp crontab.example crontab.local
nano crontab.local  # Éditer le chemin absolu

# 2. Installer
crontab crontab.local

# 3. Vérifier
crontab -l
```

### Option 2: Manuel (Dev/Test)
```bash
# Lancer manuellement
npx tsx scripts/run-learning-cycle.ts

# Ou via API
curl -X POST http://localhost:3000/api/super-admin/learning \
  -H "Content-Type: application/json" \
  -d '{"action": "run-cycle"}'
```

### Option 3: Node-cron (Simple)
Dans votre `app/layout.tsx` (server component) :
```typescript
import { initializeCronJobs } from '@/lib/cron/learning-scheduler'

// Dans un useEffect ou au niveau serveur
if (process.env.NODE_ENV === 'production') {
  initializeCronJobs()
}
```

---

## 📖 Usage Basique

### Classifier une page
```typescript
import { classifyLegalContent } from '@/lib/web-scraper/legal-classifier-service'

const result = await classifyLegalContent(pageId)

console.log(result)
// {
//   primaryCategory: 'legislation',
//   domain: 'civil',
//   documentNature: 'loi',
//   confidenceScore: 0.85,
//   legalKeywords: ['contrat', 'obligation', ...],
//   signalsUsed: [...],
//   requiresValidation: false
// }
```

### Valider une classification
```typescript
import { validateClassification } from '@/lib/web-scraper/legal-classifier-service'
import { learnFromValidation } from '@/lib/web-scraper/classification-learning-service'

// 1. Valider
await validateClassification(classificationId, userId, {
  primaryCategory: 'legislation',
  domain: 'commercial',  // Correction
  documentNature: 'decret'
})

// 2. Apprendre (génère automatiquement une règle après 3+ corrections similaires)
await learnFromValidation(pageId, {
  primaryCategory: 'legislation',
  domain: 'commercial',
  documentType: 'decret'
}, userId)
```

### Voir les statistiques
```typescript
import { getLearningStats } from '@/lib/web-scraper/classification-learning-service'
import { getClassificationStats } from '@/lib/web-scraper/legal-classifier-service'

const learningStats = await getLearningStats()
const classificationStats = await getClassificationStats()

console.log({
  total: classificationStats.total,
  avgConfidence: classificationStats.avgConfidence,
  rulesGenerated: learningStats.rulesGenerated,
  pendingValidation: classificationStats.pendingValidation
})
```

---

## 🎯 Workflow Typique

### 1. Crawler Initial
```bash
# Crawler une source (ex: 9anoun.tn)
# Les pages sont automatiquement classées lors de l'ingestion
```

### 2. Validation (Optionnel)
```
1. Aller sur /super-admin/classification/metrics
2. Voir les pages à faible confiance (< 70%)
3. Valider 10-20 pages par semaine
4. Le système apprend automatiquement
```

### 3. Apprentissage Automatique
```
• Cron quotidien à 2h du matin
• Génère des règles si ≥3 corrections similaires
• Analyse l'efficacité des règles existantes
• Suggère de nouveaux types de taxonomie
```

### 4. Amélioration Continue
```
• Confiance moyenne augmente
• Moins de validations manuelles nécessaires
• Nouvelles règles ajoutées automatiquement
• Précision des règles trackée
```

---

## 📋 Checklist de Déploiement Production

- [ ] Migrations appliquées
- [ ] Règles initiales créées (9anoun.tn)
- [ ] Cron job configuré
- [ ] Logs créés (`/var/log/moncabinet/`)
- [ ] Dashboard accessible
- [ ] API testée (`/api/super-admin/learning`)
- [ ] Variables d'environnement configurées
- [ ] Monitoring en place
- [ ] Rotation de logs configurée (optionnel)

---

## 🐛 Debug Rapide

### Problème: Règles ne matchent pas
```bash
# Vérifier les règles existantes
docker exec moncabinet-postgres psql -U moncabinet -d moncabinet \
  -c "SELECT name, conditions, is_active FROM source_classification_rules WHERE is_active = true;"

# Tester une URL spécifique
npx tsx scripts/test-page-classification.ts
```

### Problème: Confiance trop basse
**Solutions** :
1. Ajouter des règles spécifiques pour votre source
2. Valider quelques pages manuellement
3. Laisser le système apprendre (3+ validations similaires)

### Problème: Apprentissage ne génère pas de règles
**Causes** :
- Pas assez de corrections (< 3)
- Patterns trop variés
- Corrections déjà utilisées

**Solution** :
```bash
# Voir les corrections disponibles
curl http://localhost:3000/api/super-admin/learning?action=corrections

# Forcer un cycle
npx tsx scripts/run-learning-cycle.ts
```

---

## 📚 Documentation Complète

| Document | Description |
|----------|-------------|
| `quick-wins-implemented.md` | Guide des 3 Quick Wins (règles, mots-clés, apprentissage) |
| `phase-2-complete.md` | Guide Phase 2 (cron, dashboard, contexte) |
| `optimisations-classification-rag.md` | Plan complet avec toutes les optimisations possibles |
| `CLASSIFICATION_QUICKSTART.md` | Ce document |

---

## 🎓 Concepts Clés

### Multi-Signaux
Le système combine plusieurs sources d'information :
- **Structure** (30%) : Breadcrumbs, URL, navigation
- **Règles** (40%) : Patterns configurés
- **Mots-clés** (15%) : Termes juridiques AR/FR
- **Contexte** (10%) : Pages voisines
- **LLM** (30%) : Intelligence artificielle (fallback)

### Apprentissage Automatique
1. Admin valide/corrige une classification
2. Système enregistre la correction
3. Si ≥3 corrections similaires → génère une règle automatiquement
4. Règle utilisée pour futures classifications
5. Efficacité trackée (% correct)

### Confiance
- **> 85%** : Excellente, pas de validation
- **70-85%** : Bonne, validation optionnelle
- **< 70%** : Faible, validation recommandée

---

## 💡 Tips & Best Practices

### Pour de meilleurs résultats :

1. **Validez 50-100 pages initialement**
   - Aide le système à apprendre les patterns
   - Génère les premières règles automatiques

2. **Créez des règles spécifiques**
   - Une règle par code juridique
   - Patterns d'URL précis
   - Priorités élevées (90-100)

3. **Surveillez le dashboard**
   - Confiance moyenne devrait augmenter
   - Règles inefficaces (< 70%) à revoir
   - Anomalies à investiguer

4. **Laissez le système apprendre**
   - Patience : 1-2 mois pour convergence
   - Ne pas sur-valider (laissez l'auto-amélioration)
   - Cibler les faibles confiances

---

## 🚀 Next Steps

Une fois le système en place :

1. **Semaine 1** : Crawler 1000 pages, valider 50
2. **Semaine 2-4** : Laisser apprendre, surveiller dashboard
3. **Mois 2** : Ajouter nouvelles sources avec règles
4. **Mois 3** : Analyser ROI, ajuster stratégie

---

## ❓ Support

Des questions ? Consultez :
- Documentation complète dans `/docs/`
- Code source commenté
- Dashboard de métriques
- Logs du cron job

---

**🎉 Félicitations ! Votre système de classification intelligente est opérationnel.**
