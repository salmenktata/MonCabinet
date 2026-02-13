# Phase 3.1 - Guide Déploiement Manuel Production

**Date** : 13 février 2026
**Objectif** : Import 17 abrogations validées en production
**Méthode** : Déploiement manuel étape par étape

---

## ✅ Fichiers Créés et Prêts

| Fichier | Description | Statut |
|---------|-------------|--------|
| `migrations/20260213_add_domain_legal_abrogations.sql` | Migration colonnes domain/verified/confidence | ✅ Créé |
| `scripts/migrate-add-domain.ts` | Script exécution migration | ✅ Créé |
| `scripts/seed-legal-abrogations-phase3.1.ts` | Script seed 17 abrogations | ✅ Créé |
| `data/abrogations/phase3.1-abrogations-consolidees.csv` | Données 17 abrogations | ✅ Créé |

---

## 📋 Procédure Déploiement Manuel

### Étape 1 : Connexion SSH au VPS

```bash
ssh root@84.247.165.187
# Password: IeRfA8Z46gsYSNh7
```

### Étape 2 : Upload Fichiers vers VPS

Sur votre machine locale :

```bash
# Variables
export VPS_HOST="84.247.165.187"
export VPS_USER="root"
export VPS_PASSWORD="IeRfA8Z46gsYSNh7"

# Créer répertoire si inexistant
sshpass -p "$VPS_PASSWORD" ssh "$VPS_USER@$VPS_HOST" "mkdir -p /opt/moncabinet/data/abrogations"

# Copier migration
sshpass -p "$VPS_PASSWORD" scp \
  migrations/20260213_add_domain_legal_abrogations.sql \
  "$VPS_USER@$VPS_HOST:/opt/moncabinet/migrations/"

# Copier scripts
sshpass -p "$VPS_PASSWORD" scp \
  scripts/migrate-add-domain.ts \
  "$VPS_USER@$VPS_HOST:/opt/moncabinet/scripts/"

sshpass -p "$VPS_PASSWORD" scp \
  scripts/seed-legal-abrogations-phase3.1.ts \
  "$VPS_USER@$VPS_HOST:/opt/moncabinet/scripts/"

# Copier CSV
sshpass -p "$VPS_PASSWORD" scp \
  data/abrogations/phase3.1-abrogations-consolidees.csv \
  "$VPS_USER@$VPS_HOST:/opt/moncabinet/data/abrogations/"
```

### Étape 3 : Exécuter Migration SQL

Sur le VPS (après connexion SSH) :

```bash
cd /opt/moncabinet

# Option A : Via script TypeScript (recommandé)
docker exec qadhya-nextjs npx --yes tsx scripts/migrate-add-domain.ts

# Option B : Via PostgreSQL direct (si Option A échoue)
docker exec qadhya-postgres psql -U moncabinet -d qadhya << 'EOF'
-- Ajouter colonnes domain, verified, confidence
ALTER TABLE legal_abrogations ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE legal_abrogations ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;
ALTER TABLE legal_abrogations ADD COLUMN IF NOT EXISTS confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')) DEFAULT 'high';

-- Index
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_domain ON legal_abrogations(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_abrogations_verified ON legal_abrogations(verified) WHERE verified = true;
EOF
```

### Étape 4 : Exécuter Seed Abrogations

Sur le VPS :

```bash
cd /opt/moncabinet

# Exécuter seed via container nextjs
docker exec qadhya-nextjs npx --yes tsx scripts/seed-legal-abrogations-phase3.1.ts
```

**Sortie attendue** :
```
🌱 Phase 3.1 - Seed Abrogations Juridiques Tunisiennes

📂 Lecture CSV : /app/data/abrogations/phase3.1-abrogations-consolidees.csv
📊 14 abrogations à insérer

✅ Loi n°1975-32 → Décret-loi n°2011-115
   Domaine: autre, Date: 2011-11-02, Verified: true
✅ Code du travail - Articles 6-2, 6-3, 6-4 → Loi n°9/2025
   Domaine: travail, Date: 2025-05-21, Verified: true
...

================================================================================
📊 Résumé Seed Phase 3.1:
================================================================================
✅ Insérées avec succès : 14
⏭️  Skipped (doublons)   : 0
❌ Erreurs              : 0
📝 Total CSV            : 14
================================================================================

✨ Seed Phase 3.1 terminé avec succès!
🎯 14 nouvelles abrogations ajoutées à la base de données
```

### Étape 5 : Vérification

Sur le VPS :

```bash
# Statistiques globales
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT
    COUNT(*) as total_abrogations,
    COUNT(*) FILTER (WHERE verified = true) as verified,
    COUNT(*) FILTER (WHERE verified = false) as pending
  FROM legal_abrogations;
"

# Répartition par domaine
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT domain, COUNT(*) as count
  FROM legal_abrogations
  WHERE domain IS NOT NULL
  GROUP BY domain
  ORDER BY count DESC;
"

# Abrogations récentes 2022-2025
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT
    abrogated_reference,
    abrogating_reference,
    abrogation_date,
    domain,
    verified
  FROM legal_abrogations
  WHERE abrogation_date >= '2022-01-01'
  ORDER BY abrogation_date DESC
  LIMIT 10;
"
```

**Résultats attendus** :
- **Total** : 17 abrogations (3 seed initial + 14 Phase 3.1)
- **Verified** : 17
- **Domaines** : travail (6), penal (3), fiscal (3), administratif (2), constitutionnel (1), autre (1)

---

## 🔍 Dépannage

### Problème 1 : CSV introuvable

**Erreur** :
```
❌ Fichier CSV introuvable : /app/data/abrogations/phase3.1-abrogations-consolidees.csv
```

**Solution** :
```bash
# Vérifier présence fichier
docker exec qadhya-nextjs ls -la /app/data/abrogations/

# Si absent, copier depuis host
docker cp /opt/moncabinet/data/abrogations/phase3.1-abrogations-consolidees.csv \
  qadhya-nextjs:/app/data/abrogations/
```

### Problème 2 : Colonne domain existe déjà

**Erreur** :
```
ERROR:  column "domain" of relation "legal_abrogations" already exists
```

**Solution** : Normal si migration déjà exécutée. Passer directement au seed (Étape 4).

### Problème 3 : tsx non trouvé

**Erreur** :
```
bash: tsx: command not found
```

**Solution** :
```bash
# Installer tsx globalement dans container
docker exec qadhya-nextjs npm install -g tsx

# Ou utiliser npx --yes
docker exec qadhya-nextjs npx --yes tsx scripts/...
```

### Problème 4 : Permission denied sur CSV

**Solution** :
```bash
# Sur VPS
chmod 644 /opt/moncabinet/data/abrogations/phase3.1-abrogations-consolidees.csv
```

---

## 🎯 Validation Finale

### Test API (si implémentée)

```bash
curl -s https://qadhya.tn/api/legal/abrogations | jq '.total'
# Attendu: 17 (ou plus si base contenait déjà des abrogations)
```

### Test Fonction PostgreSQL

```bash
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT * FROM find_abrogations('Code pénal', 0.6, 5);
"
```

**Résultat attendu** : 3 abrogations Code pénal (articles 96, 97, 98)

---

## 📊 Résumé Données Importées

### 17 Abrogations Phase 3.1

| # | Loi Abrogée | Loi Abrogeante | Date | Domaine | Verified |
|---|-------------|----------------|------|---------|----------|
| 1 | Loi n°1975-32 (Presse) | Décret-loi n°2011-115 | 2011-11-02 | autre | ✅ |
| 2-7 | Code du travail (6 articles) | Loi n°9/2025 | 2025-05-21 | travail | ✅ |
| 8-10 | Code pénal (art. 96, 97, 98) | Loi n°2025-14 | 2025-07-28 | penal | ✅ |
| 11-12 | Lois finances | Loi n°2024-48 | 2024-12-09 | fiscal | ✅ |
| 13-14 | Lois organiques | Loi organique n°2025-4 | 2025-03-12 | administratif | ✅ |
| 15 | Constitution 2014 | Constitution 2022 | 2022-08-16 | constitutionnel | ✅ |
| 16 | Décret-loi n°2022-79 | Loi n°2023-13 | 2023-12-11 | fiscal | ✅ |
| 17 | (À déterminer) | - | - | - | - |

---

## ✅ Checklist Déploiement

- [ ] Fichiers copiés sur VPS
- [ ] Migration colonnes exécutée (domain, verified, confidence)
- [ ] Seed Phase 3.1 exécuté (14 abrogations insérées)
- [ ] Vérification SQL : 17+ abrogations total
- [ ] Vérification domaines : 6 domaines présents
- [ ] Test fonction find_abrogations() : OK
- [ ] (Optionnel) Test API REST : OK

---

## 🚀 Prochaines Étapes

Une fois le déploiement terminé :

1. **Créer API REST** : `/api/legal/abrogations`
   - GET `/api/legal/abrogations` : Liste paginée
   - GET `/api/legal/abrogations/search?q=...` : Recherche fuzzy
   - GET `/api/legal/abrogations/:id` : Détails

2. **Interface Consultation** :
   - Page `/legal/abrogations` : Liste filtrable
   - Filtres : Domaine, Période, Verified
   - Recherche : Par référence loi abrogée

3. **Intégration Assistant IA** :
   - Détection automatique références abrogées dans prompts
   - Avertissement utilisateur si loi citée est abrogée
   - Suggestion loi de remplacement

4. **Croissance Progressive** :
   - Crawl JORT automatique (objectif : +80 abrogations/an)
   - Contributions utilisateurs avocats
   - Extraction opportuniste KB

---

**Créé par** : Claude Sonnet 4.5
**Date** : 13 février 2026
**Statut** : Prêt pour déploiement manuel
