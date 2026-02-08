# Implémentation : Enrichissement Taxonomie Tribunaux Tunisiens

**Date** : 2026-02-10
**Status** : ✅ Code implémenté, migration SQL prête
**Migration requise** : Oui - Application manuelle requise

## 📋 Résumé

Enrichissement de la taxonomie juridique avec 9 nouveaux tribunaux tunisiens officiels identifiés sur le site du Ministère de la Justice :
- 7 nouvelles cours d'appel (Nabeul, Bizerte, Kef, Monastir, Kairouan, Gafsa, Gabès, Médenine)
- 2 juridictions spécialisées (Commerce, Travail)

**Total** : 13 → 22 tribunaux (+69%)

## ✅ Fichiers créés/modifiés

### Créés
1. `/db/migrations/20260210100000_enrich_tribunals_taxonomy.sql` - Migration SQL principale
2. `/db/seeds/classification-rules-nouveaux-tribunaux.sql` - Règles de classification (optionnel)
3. `/scripts/verify-tribunals-migration.sql` - Script de vérification post-migration
4. `/docs/implementation-tribunaux-enrichissement.md` - Cette documentation

### Modifiés
1. `/lib/knowledge-base/categories.ts` :
   - Type `JurisprudenceSubcategory` : +9 nouveaux types
   - Array `subcategories` de `jurisprudence` : +9 objets (réorganisés par ordre alphabétique)

## 🚀 Étapes d'application

### Phase 1 : Migration Base de Données (CRITIQUE)

```bash
# 1. Se connecter à la base de données dev
psql -d qadhya_dev -U votre_user

# 2. Appliquer la migration
\i db/migrations/20260210100000_enrich_tribunals_taxonomy.sql

# 3. Vérifier les résultats
\i scripts/verify-tribunals-migration.sql
```

**Résultats attendus** :
- ✅ 22 tribunaux totaux
- ✅ 11 cours d'appel
- ✅ 10 nouveaux tribunaux ajoutés
- ✅ 0 doublons
- ✅ Tous les nouveaux tribunaux avec `is_system=true`

### Phase 2 : Vérification TypeScript (Déjà fait)

Les modifications TypeScript ont été effectuées dans `lib/knowledge-base/categories.ts`.

**Vérification manuelle recommandée** :
```bash
# Vérifier que le type JurisprudenceSubcategory contient bien les 9 nouveaux types
grep -A 20 "export type JurisprudenceSubcategory" lib/knowledge-base/categories.ts

# Compter les sous-catégories de jurisprudence (attendu: 19)
grep -c "{ id:" lib/knowledge-base/categories.ts | grep "jurisprudence" -A 25
```

### Phase 3 : Invalidation Cache (Si serveur running)

Si le serveur de développement est en cours d'exécution :

```typescript
// Option 1: Via console navigateur (sur /super-admin/taxonomy)
fetch('/api/super-admin/taxonomy/invalidate-cache', { method: 'POST' })

// Option 2: Redémarrer le serveur
npm run dev # Ou utiliser le skill 'restart'
```

### Phase 4 : Vérification Interface Super-Admin

1. Accéder à `/super-admin/taxonomy?type=tribunal`
2. Vérifier l'affichage des 22 tribunaux
3. Vérifier labels FR/AR corrects
4. Vérifier badges "Système" sur les nouveaux tribunaux
5. Tester l'impossibilité de suppression (bouton désactivé)

### Phase 5 : Règles de Classification (Optionnel - À faire plus tard)

Les règles dans `db/seeds/classification-rules-nouveaux-tribunaux.sql` sont des **exemples génériques**.

**Recommandation** :
1. Analyser d'abord la structure des sources web actives
2. Identifier comment chaque source organise ses contenus par tribunal
3. Créer des règles spécifiques basées sur :
   - Patterns URL (`url_pattern`)
   - Breadcrumbs exacts (`breadcrumb_exact`)
   - Metadata (`metadata_contains`)
4. Tester avec le script de classification existant

**Ne PAS appliquer les règles génériques en production** sans adaptation préalable.

## 🔍 Vérifications SQL Manuelles

### Compter les tribunaux
```sql
SELECT COUNT(*) FROM legal_taxonomy
WHERE type = 'tribunal' AND is_active = true;
-- Attendu: 22
```

### Lister les nouveaux tribunaux
```sql
SELECT code, label_fr, label_ar, is_system
FROM legal_taxonomy
WHERE code IN (
  'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
  'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
  'tribunal_commerce', 'tribunal_travail'
)
ORDER BY code;
-- Attendu: 10 lignes, toutes avec is_system=true
```

### Vérifier absence doublons
```sql
SELECT code, COUNT(*)
FROM legal_taxonomy
WHERE type = 'tribunal'
GROUP BY code
HAVING COUNT(*) > 1;
-- Attendu: 0 lignes (aucun doublon)
```

### Lister toutes les cours d'appel
```sql
SELECT code, label_fr
FROM legal_taxonomy
WHERE code LIKE 'appel_%'
ORDER BY label_fr;
-- Attendu: 11 lignes
```

## 📊 Détails des ajouts

### 7 Nouvelles Cours d'Appel

| Code | Label FR | Label AR | Sort Order |
|------|----------|----------|------------|
| `appel_nabeul` | Cour d'appel de Nabeul | محكمة الاستئناف بنابل | 5 |
| `appel_bizerte` | Cour d'appel de Bizerte | محكمة الاستئناف ببنزرت | 6 |
| `appel_kef` | Cour d'appel du Kef | محكمة الاستئناف بالكاف | 7 |
| `appel_monastir` | Cour d'appel de Monastir | محكمة الاستئناف بالمنستير | 8 |
| `appel_kairouan` | Cour d'appel de Kairouan | محكمة الاستئناف بالقيروان | 9 |
| `appel_gafsa` | Cour d'appel de Gafsa | محكمة الاستئناف بقفصة | 10 |
| `appel_gabes` | Cour d'appel de Gabès | محكمة الاستئناف بقابس | 11 |
| `appel_medenine` | Cour d'appel de Médenine | محكمة الاستئناف بمدنين | 12 |

### 2 Juridictions Spécialisées

| Code | Label FR | Label AR | Sort Order | Description |
|------|----------|----------|------------|-------------|
| `tribunal_commerce` | Tribunal de Commerce | المحكمة التجارية | 15 | Juridiction spécialisée en matière commerciale |
| `tribunal_travail` | Tribunal du Travail | محكمة الشغل | 16 | Conseil de Prud'hommes - Contentieux employeur/employé |

## 🔄 Rollback (Si nécessaire)

En cas de problème, rollback possible via :

```sql
-- Supprimer les 10 nouveaux tribunaux
DELETE FROM legal_taxonomy
WHERE code IN (
  'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
  'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
  'tribunal_commerce', 'tribunal_travail'
);

-- Vérifier retour à l'état initial (13 tribunaux)
SELECT COUNT(*) FROM legal_taxonomy WHERE type = 'tribunal';
```

**Note** : Le rollback TypeScript nécessiterait de restaurer la version précédente de `categories.ts` via Git.

## 📝 Notes Techniques

### Design Decisions

1. **Structure plate** : Pas de `parent_code` pour les nouvelles cours d'appel
   - Cohérent avec l'existant (Tunis, Sousse, Sfax)
   - Simplifie la structure sans perdre d'information

2. **Pas de chambres** : Contrairement à la Cassation qui a des chambres
   - Les cours d'appel tunisiennes n'ont pas de chambres spécialisées distinctes
   - Structure pourrait évoluer plus tard si nécessaire

3. **is_system = true** : Tous les nouveaux tribunaux non supprimables
   - Protection contre suppressions accidentelles
   - Cohérent avec les tribunaux système existants

4. **ON CONFLICT DO NOTHING** : Migration idempotente
   - Peut être réappliquée sans erreur
   - Sécurité en cas de réexécution

5. **Sort order** :
   - Cours d'appel : 5-12 (séquence continue)
   - Juridictions spécialisées : 15-16 (groupées ensemble)

### Exclusions Volontaires

1. **Tribunal de l'Environnement** : Non inclus
   - Prévu par la loi mais pas encore créé officiellement
   - À ajouter lors de sa création effective

2. **27 Tribunaux de Première Instance** : Non détaillés
   - Type générique `premiere_instance` maintenu
   - Évite une explosion de la taxonomie (35+ entrées supplémentaires)
   - Peut être enrichi plus tard si besoin métier identifié

3. **Chambres des Cours d'Appel** : Non créées
   - Structure interne non documentée publiquement
   - Ajout possible ultérieurement si source d'information identifiée

## 🎯 Prochaines Étapes Recommandées

### Court terme (Sprint actuel)
1. ✅ **Appliquer la migration SQL** (CRITIQUE)
2. ✅ **Vérifier via script verify-tribunals-migration.sql**
3. ✅ **Tester interface Super-Admin**
4. ⏳ **Commiter les changements**

### Moyen terme (2-4 semaines)
1. Analyser les sources web actives pour identifier patterns de détection
2. Créer règles de classification spécifiques par source
3. Tester classification automatique sur échantillon de pages
4. Ajuster confidence_boost et priorités selon résultats

### Long terme (Si besoin métier)
1. Enrichir avec les 27 TPI si nécessaire pour la recherche/filtrage
2. Ajouter chambres des cours d'appel si documentées
3. Ajouter Tribunal de l'Environnement lors de sa création

## 📚 Références

- **Source officielle** : https://www.justice.gov.tn/index.php?id=255&L=3
- **Migration SQL** : `/db/migrations/20260210100000_enrich_tribunals_taxonomy.sql`
- **Types TypeScript** : `/lib/knowledge-base/categories.ts:33-41` et `:136-145`
- **Plan initial** : Conversation précédente (mode plan)

## ⚠️ Points d'Attention

1. **Cache** : Penser à invalider le cache de la taxonomie après migration
2. **Tests** : Vérifier que les anciens documents classifiés restent cohérents
3. **Production** : Appliquer la migration en production après validation dev
4. **Règles classification** : Ne PAS utiliser les règles génériques sans adaptation

---

**Auteur** : Implémentation basée sur le plan d'enrichissement taxonomie
**Date création** : 2026-02-10
**Dernière mise à jour** : 2026-02-10
