# Audit Crawl Code des Obligations et Contrats (9anoun.tn)

**Date**: 10 février 2026
**Source**: 9anoun.tn
**Base de données**: Production (qadhya)

---

## 🎯 Résumé Exécutif

**PROBLÈME IDENTIFIÉ**: Seule la page principale du Code des Obligations et Contrats a été crawlée. Les articles individuels (ex: article-1, article-2, etc.) n'ont **JAMAIS été découverts ou crawlés**.

---

## 📊 État Actuel

### Page Principale COC

✅ **Crawlée et indexée**

- **URL**: `https://9anoun.tn/kb/codes/code-obligations-contrats`
- **Titre**: مجلة الالتزامات والعقود - قانون 🇹🇳
- **Statut**: `unchanged` (crawlée, contenu inchangé)
- **Mots**: 26 (TRÈS PEU ⚠️)
- **Indexée**: ✅ OUI
- **Dernier crawl**: 2026-02-08 19:45:39

### Articles Individuels

❌ **AUCUN article crawlé**

Recherche effectuée pour :
- `https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1`
- `https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-*`
- Toute URL contenant "code-obligations-contrats-article"

**Résultat**: 0 page trouvée dans la base de données.

---

## 📈 Statistiques Globales 9anoun.tn

| Métrique | Valeur |
|----------|--------|
| Total pages | 237 |
| Crawlées | 38 |
| Inchangées | 197 |
| Échouées | 1 |
| **Indexées** | **192 (81%)** |
| Total mots | 34 388 |
| Pages découvertes (dernier crawl) | 35 |

---

## ⚙️ Configuration Crawler 9anoun.tn

| Paramètre | Valeur | Commentaire |
|-----------|--------|-------------|
| `requires_javascript` | `true` | ✅ Correct (SPA Livewire) |
| `follow_links` | `true` | ✅ Activé |
| `max_depth` | `3` | ✅ Suffisant |
| `max_pages` | `200` | ✅ Suffisant |
| `use_sitemap` | `false` | ⚠️ Pas de sitemap |
| `url_patterns` | `[]` | ✅ Accepte tout |
| `excluded_patterns` | `[]` | ✅ N'exclut rien |
| `health_status` | `healthy` | ✅ |
| `is_active` | `true` | ✅ |

---

## 🔍 Analyse du Problème

### Cause Racine Probable

Le crawler ne découvre pas les liens vers les articles COC pour l'une des raisons suivantes :

1. **Chargement AJAX différé**
   - Les articles sont chargés via des requêtes AJAX après le rendu initial
   - Playwright ne détecte pas ces liens dynamiques

2. **Router client-side**
   - Le site utilise un router JavaScript (Vue/React) qui ne génère pas de liens HTML `<a href="...">`
   - Les liens sont gérés par des événements `@click` sans attribut `href`

3. **Contenu dans iframes ou web components**
   - Les articles peuvent être encapsulés dans des composants isolés

4. **Pagination/Scroll infini**
   - Les articles ne s'affichent qu'après un scroll ou un clic sur "charger plus"

### Preuve

- **26 mots seulement** sur la page principale → probablement juste le titre et la navigation
- **35 pages découvertes** au dernier crawl → très peu par rapport aux 237 pages totales
- **1 seule page COC** dans toute la base de données

---

## 💡 Solutions Recommandées

### Option 1: Script de découverte manuel (RAPIDE ⚡)

Créer un script qui :
1. Se connecte à 9anoun.tn avec Playwright
2. Navigue vers la page COC
3. Attend le chargement complet (networkidle + timeout)
4. Scroll jusqu'au bas de la page pour forcer le lazy loading
5. Extrait tous les liens visibles vers les articles
6. Insère ces URLs dans `web_pages` avec statut `pending`
7. Lance un crawl manuel sur ces URLs

**Avantages**:
- Rapide à implémenter (1-2h)
- Découvre tous les articles d'un coup
- Peut être réutilisé pour d'autres codes

**Inconvénients**:
- Nécessite maintenance si structure du site change
- Pas automatique (à relancer manuellement)

### Option 2: Améliorer le crawler Playwright (MOYEN 🔧)

Modifier `lib/web-scraper/scraper-service.ts` pour :
1. Ajouter un `page.evaluate()` qui scroll jusqu'au bas
2. Attendre 2-3 secondes après networkidle pour laisser les scripts AJAX terminer
3. Extraire les liens via `page.$$eval('a[href]', ...)`
4. Détecter les liens générés dynamiquement (data-href, @click, etc.)

**Avantages**:
- Automatique pour tous les futurs crawls
- Fonctionne pour tous les sites SPA
- Pas besoin de maintenance

**Inconvénients**:
- Plus complexe (2-4h de dev)
- Peut ralentir le crawl global
- Risque de bugs sur certains sites

### Option 3: Sitemap + Seed URLs (SIMPLE ✅)

Si 9anoun.tn a un sitemap pour les codes :
1. Activer `use_sitemap: true`
2. Trouver le sitemap pour les codes (ex: `/sitemap-codes.xml`)
3. Configurer dans `sitemap_url`

OU ajouter manuellement des seed URLs :
```sql
UPDATE web_sources
SET seed_urls = ARRAY[
  'https://9anoun.tn/kb/codes/code-obligations-contrats',
  'https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-1',
  'https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-2',
  -- ... etc pour tous les articles
]
WHERE base_url LIKE '%9anoun.tn%';
```

**Avantages**:
- Très simple
- Garantit que les URLs sont crawlées
- Pas de modification du code

**Inconvénients**:
- Nécessite de connaître toutes les URLs à l'avance
- Pas automatique pour les nouveaux articles

---

## 🎬 Actions Immédiates Recommandées

### 1. Vérifier manuellement le site (5 min)

Visiter `https://9anoun.tn/kb/codes/code-obligations-contrats` et :
- Noter comment les articles sont affichés (liste, accordéon, pagination ?)
- Vérifier si les liens sont des `<a href>` ou des boutons JavaScript
- Tester si un sitemap existe : `/sitemap.xml`, `/sitemap-codes.xml`
- Inspecter le HTML pour voir la structure réelle

### 2. Créer un script de découverte (Option 1)

Fichier : `scripts/discover-9anoun-coc-articles.ts`

```typescript
/**
 * Script pour découvrir tous les articles du Code des Obligations et Contrats
 * sur 9anoun.tn et les insérer dans la base de données pour crawl
 */

import { chromium } from 'playwright';
import { Pool } from 'pg';

async function discoverCOCArticles() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('📡 Navigation vers la page COC...');
    await page.goto('https://9anoun.tn/kb/codes/code-obligations-contrats', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Attendre 3s pour les scripts AJAX
    await page.waitForTimeout(3000);

    // Scroll jusqu'au bas pour lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    // Extraire tous les liens vers les articles
    const articleLinks = await page.$$eval('a[href*="code-obligations-contrats-article"]', links =>
      links.map(link => ({
        url: link.href,
        text: link.textContent?.trim() || ''
      }))
    );

    console.log(`✅ ${articleLinks.length} articles découverts`);

    // Insérer dans la base de données
    const pool = new Pool({
      host: 'localhost',
      port: 5434, // Tunnel SSH
      database: 'qadhya',
      user: 'moncabinet',
      password: process.env.DB_PASSWORD
    });

    const sourceId = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'; // ID de 9anoun.tn

    for (const article of articleLinks) {
      await pool.query(`
        INSERT INTO web_pages (web_source_id, url, url_hash, status, title)
        VALUES ($1, $2, MD5($2), 'pending', $3)
        ON CONFLICT (web_source_id, url_hash) DO NOTHING
      `, [sourceId, article.url, article.text]);
    }

    await pool.end();
    console.log('✅ Articles insérés dans la base de données');

  } finally {
    await browser.close();
  }
}

discoverCOCArticles();
```

### 3. Déclencher un crawl manuel (après le script)

```bash
# Via l'API admin
curl -X POST https://qadhya.tn/api/admin/web-sources/4319d2d1-569c-4107-8f52-d71e2a2e9fe9/crawl \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 📋 Checklist de Vérification

- [ ] Visiter manuellement la page COC pour comprendre la structure
- [ ] Vérifier si un sitemap existe
- [ ] Créer le script de découverte
- [ ] Exécuter le script localement (mode headless: false pour debug)
- [ ] Vérifier que les URLs sont insérées dans `web_pages`
- [ ] Déclencher un crawl manuel
- [ ] Monitorer le crawl (logs, errors)
- [ ] Vérifier que les articles sont crawlés et indexés
- [ ] Valider le contenu dans la base de connaissances

---

## 📝 Notes Complémentaires

### Contenu de la page principale

La page principale COC ne contient que **26 mots**, ce qui suggère :
- Soit un problème d'extraction du contenu
- Soit la page est vraiment vide et sert juste de hub de navigation

Si après crawl des articles individuels, ceux-ci ne contiennent pas de texte non plus, il faudra :
1. Revoir les sélecteurs CSS dans `extraction_config`
2. Vérifier si le contenu est dans un shadow DOM
3. Tester l'extraction manuellement avec Playwright

### Priorisation

Le Code des Obligations et Contrats est **un code fondamental du droit tunisien** (équivalent au Code Civil français). Son absence dans la base de connaissances est un **handicap majeur** pour la pertinence juridique du système RAG.

**Priorité**: 🔥 HAUTE
