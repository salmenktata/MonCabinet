# Guide Maintenance Post-Déploiement

## 🎯 Tâches à Exécuter (Via Interface Web)

### 1. Réindexer Documents Longs (106 docs)

**URL** : https://qadhya.tn/super-admin/web-sources/546d11c8-b3fd-4559-977b-c3572aede0e4

**Navigation** :
1. Se connecter en tant que super_admin
2. Aller dans "Super Admin" → "Web Sources"
3. Cliquer sur "Drive - Qadhya KB"
4. Onglet "Maintenance"
5. Action : "Reindex Long Documents"
6. Limite : **106** documents
7. Dry Run : **false** (mode réel)
8. → Cliquer "Execute"

**Résultat attendu** :
- ✅ 106 documents découpés en sections
- ✅ ~300-400 sections créées
- ✅ ~900-1200 chunks générés
- ⏱️ Durée estimée : 30-45 minutes

---

### 2. Continuer Analyse Qualité (4,478 docs)

**Option A - Via Script Bash** :
```bash
# SSH vers prod
ssh root@84.247.165.187

# Lancer analyse (20 batches = 1000 docs)
cd /opt/moncabinet
bash scripts/analyze-kb-quality-prod.sh 50 20

# Ou tout analyser (90 batches = 4500 docs, ~3h)
bash scripts/analyze-kb-quality-prod.sh 50 90
```

**Option B - Via Interface Web** :
1. https://qadhya.tn/super-admin/monitoring?tab=kb-quality
2. Bouton "Analyze Quality Batch"
3. Batch size : 50
4. Repeat : 20 fois

**Résultat attendu** :
- ✅ 1000-4500 documents analysés
- ✅ Score moyen ~80/100
- ⏱️ Durée : 2-3h pour 1000 docs

---

### 3. Nettoyer Documents "Removed" (184 docs)

**URL** : https://qadhya.tn/super-admin/web-sources/546d11c8-b3fd-4559-977b-c3572aede0e4

**Navigation** :
1. Onglet "Maintenance"
2. Action : "Cleanup Removed Files"
3. → Cliquer "Execute"

**Résultat attendu** :
- ✅ 184 documents temporaires archivés
- ✅ Base de données nettoyée

---

## 📊 Vérification Post-Maintenance

### Vérifier Statistiques :
```sql
-- SSH + PostgreSQL
ssh root@84.247.165.187
docker exec 275ce01791bf_qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT
    COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'removed') as removed,
    COUNT(*) FILTER (WHERE quality_score IS NOT NULL) as with_quality,
    ROUND(AVG(quality_score)) as avg_score
  FROM web_pages
  WHERE web_source_id = '546d11c8-b3fd-4559-977b-c3572aede0e4'
"
```

**Résultats attendus après maintenance** :
- Indexed : ~623 (était 517)
- Failed : 0 (était 106)
- Removed : 0 (était 184)
- With quality : ~5000+ (était 4257)
- Avg score : ~80

---

## ⚠️ Notes Importantes

1. **Réindexation docs longs** : Peut prendre 30-45 min, laisser tourner
2. **Analyse qualité** : Consomme budget OpenAI (~$2-3 pour 1000 docs)
3. **Cleanup removed** : Irréversible, vérifier avant d'exécuter
4. **Monitoring** : Surveiller logs pendant les opérations

---

## 🚀 Ordre d'Exécution Recommandé

1. **D'abord** : Réindexer docs longs (débloque contenu critique)
2. **Ensuite** : Analyser qualité (améliore scoring RAG)
3. **Enfin** : Cleanup removed (maintenance DB)

**Durée totale estimée** : 4-5 heures pour tout
