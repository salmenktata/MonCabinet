#!/usr/bin/env tsx

/**
 * Script pour découvrir TOUS les codes du droit tunisien sur 9anoun.tn
 * et tous leurs articles, puis les insérer dans la base de données
 *
 * URL cible: https://9anoun.tn/kb/codes
 *
 * Usage:
 *   DB_PASSWORD="moncabinet" npx tsx scripts/discover-9anoun-all-codes.ts
 *
 * Prérequis:
 *   - Tunnel SSH actif : ssh -f -N -L 5434:localhost:5432 root@84.247.165.187
 *   - Variable DB_PASSWORD définie
 */

import { chromium, Page } from 'playwright';
import { Pool } from 'pg';
import crypto from 'crypto';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  connectionTimeoutMillis: 10000,
  keepAlive: true,
};

const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'; // ID de 9anoun.tn
const CODES_BASE_URL = 'https://9anoun.tn/kb/codes';

interface CodeLink {
  url: string;
  title: string;
  slug: string;
}

interface ArticleLink {
  url: string;
  text: string;
  articleNumber?: string;
  codeName: string;
}

async function scrollAndWait(page: Page) {
  // Scroll progressif pour forcer le lazy loading
  await page.evaluate(async () => {
    const scrollHeight = document.body.scrollHeight;
    const step = 500;
    for (let i = 0; i < scrollHeight; i += step) {
      window.scrollTo(0, i);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });
  await page.waitForTimeout(2000);
}

async function discoverCodes(page: Page): Promise<CodeLink[]> {
  console.log('📚 Découverte des codes disponibles...\n');

  await page.goto(CODES_BASE_URL, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  await page.waitForTimeout(3000);
  await scrollAndWait(page);

  // Stratégie 1 : Liens <a> vers les codes
  const codeLinks = await page.$$eval('a[href*="/kb/codes/"]', links =>
    links
      .map(link => {
        const href = (link as HTMLAnchorElement).href;
        const title = link.textContent?.trim() || '';

        // Filtrer uniquement les liens vers des codes spécifiques (pas la page racine)
        if (href.endsWith('/kb/codes') || href.endsWith('/kb/codes/')) {
          return null;
        }

        const match = href.match(/\/kb\/codes\/([^/?#]+)/);
        if (!match) return null;

        return {
          url: href.split('?')[0].split('#')[0], // Nettoyer les query strings et ancres
          title,
          slug: match[1]
        };
      })
      .filter(Boolean) as CodeLink[]
  );

  // Dédupliquer par slug
  const uniqueCodes = Array.from(
    new Map(codeLinks.map(code => [code.slug, code])).values()
  );

  console.log(`✅ ${uniqueCodes.length} codes découverts:\n`);
  uniqueCodes.forEach((code, i) => {
    console.log(`   ${i + 1}. ${code.title}`);
    console.log(`      ${code.url}\n`);
  });

  return uniqueCodes;
}

async function discoverArticlesForCode(
  page: Page,
  code: CodeLink
): Promise<ArticleLink[]> {
  console.log(`\n🔍 Découverte des articles pour: ${code.title}`);
  console.log(`   URL: ${code.url}\n`);

  try {
    await page.goto(code.url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    await page.waitForTimeout(3000);
    await scrollAndWait(page);

    // Stratégie 1 : Liens <a> directs vers les articles
    const directLinks = await page.$$eval(
      `a[href*="${code.slug}"][href*="article"], a[href*="${code.slug}-article"]`,
      (links, codeName) =>
        links.map(link => {
          const href = (link as HTMLAnchorElement).href;
          const text = link.textContent?.trim() || '';
          const articleMatch = href.match(/article[-_]?(\d+)/i);

          return {
            url: href.split('?')[0].split('#')[0],
            text,
            articleNumber: articleMatch?.[1],
            codeName
          };
        }),
      code.title
    );

    // Stratégie 2 : Inférence depuis le contenu
    const inferredLinks = await page.evaluate((codeData) => {
      const potentialArticles: Array<{
        url: string;
        text: string;
        articleNumber: string;
        codeName: string;
      }> = [];

      // Chercher des patterns "الفصل X" ou "Article X"
      const textNodes = document.evaluate(
        "//text()[contains(., 'الفصل') or contains(., 'Article') or contains(., 'article')]",
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < Math.min(textNodes.snapshotLength, 1000); i++) {
        const node = textNodes.snapshotItem(i);
        const text = node?.textContent?.trim() || '';

        // Chercher les numéros d'articles
        const matches = text.matchAll(/(الفصل|article)\s*(\d+)/gi);
        for (const match of matches) {
          const articleNum = match[2];
          // Construire l'URL attendue
          const url = `${codeData.url}/${codeData.slug}-article-${articleNum}`;
          potentialArticles.push({
            url,
            text: text.substring(0, 100),
            articleNumber: articleNum,
            codeName: codeData.title
          });
        }
      }

      return potentialArticles;
    }, code);

    // Stratégie 3 : Pattern séquentiel (si on détecte qu'il y a des articles 1, 2, 3...)
    const sequentialLinks: ArticleLink[] = [];
    const discoveredNumbers = [
      ...directLinks,
      ...inferredLinks
    ]
      .map(l => l.articleNumber)
      .filter(Boolean)
      .map(n => parseInt(n!))
      .sort((a, b) => a - b);

    if (discoveredNumbers.length >= 3) {
      // Si on a au moins 3 articles, supposer une séquence continue
      const min = discoveredNumbers[0];
      const max = Math.max(...discoveredNumbers);

      console.log(`   💡 Détection séquentielle: articles ${min} à ${max}`);

      // Limiter à 500 articles max pour éviter les abus
      const limit = Math.min(max, min + 500);

      for (let i = min; i <= limit; i++) {
        const url = `${code.url}/${code.slug}-article-${i}`;
        sequentialLinks.push({
          url,
          text: `Article ${i}`,
          articleNumber: i.toString(),
          codeName: code.title
        });
      }
    }

    // Combiner et dédupliquer
    const allLinks = [
      ...directLinks,
      ...inferredLinks,
      ...sequentialLinks
    ];

    const uniqueLinks = Array.from(
      new Map(allLinks.map(link => [link.url, link])).values()
    );

    console.log(`   ✅ ${uniqueLinks.length} articles découverts`);
    console.log(`      Directs: ${directLinks.length}, Inférés: ${inferredLinks.length}, Séquentiels: ${sequentialLinks.length}\n`);

    return uniqueLinks;

  } catch (error) {
    console.error(`   ❌ Erreur lors de la découverte des articles:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function insertLinks(pool: Pool, links: ArticleLink[]) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const link of links) {
    try {
      const urlHash = crypto.createHash('md5').update(link.url).digest('hex');

      const result = await pool.query(`
        INSERT INTO web_pages (
          web_source_id,
          url,
          url_hash,
          status,
          title,
          crawl_depth,
          first_seen_at,
          quality_score,
          relevance_score,
          legal_domain,
          processing_status,
          site_structure
        )
        VALUES (
          $1, $2, $3, 'pending', $4, 2, NOW(),
          95, -- quality_score élevé (95/100) pour les codes officiels
          0.95, -- relevance_score élevé (0.95/1.0) pour les codes
          'legislation', -- legal_domain = legislation
          'validated', -- processing_status = validated (confiance haute)
          jsonb_build_object(
            'source_type', 'code',
            'source_authority', '9anoun.tn',
            'confidence', 'high',
            'auto_classified', true,
            'code_name', $5
          )
        )
        ON CONFLICT (web_source_id, url_hash)
        DO UPDATE SET
          status = CASE
            WHEN web_pages.status = 'failed' THEN 'pending'
            ELSE web_pages.status
          END,
          quality_score = COALESCE(web_pages.quality_score, 95),
          relevance_score = COALESCE(web_pages.relevance_score, 0.95),
          legal_domain = COALESCE(web_pages.legal_domain, 'legislation'),
          processing_status = CASE
            WHEN web_pages.processing_status = 'pending' THEN 'validated'
            ELSE web_pages.processing_status
          END,
          updated_at = NOW()
        RETURNING (xmax = 0) as inserted
      `, [
        SOURCE_ID,
        link.url,
        urlHash,
        `${link.codeName} - ${link.text}`.substring(0, 255),
        link.codeName
      ]);

      if (result.rows[0].inserted) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`   ❌ Erreur: ${link.url}`, err instanceof Error ? err.message : err);
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  console.log('\n🏛️  Découverte COMPLÈTE des Codes du Droit Tunisien\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    userAgent: 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();
  const pool = new Pool(PROD_DB_CONFIG);

  try {
    // Connexion DB
    await pool.query('SELECT NOW()');
    console.log('✅ Connexion DB établie\n');

    // Étape 1 : Découvrir tous les codes
    const codes = await discoverCodes(page);

    if (codes.length === 0) {
      console.log('❌ Aucun code découvert !');
      await page.screenshot({ path: './9anoun-codes-debug.png', fullPage: true });
      return;
    }

    // Étape 2 : Insérer les pages principales des codes
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📥 Insertion des pages principales des codes...\n');

    const codeLinks: ArticleLink[] = codes.map(code => ({
      url: code.url,
      text: code.title,
      codeName: code.title
    }));

    const codeStats = await insertLinks(pool, codeLinks);
    console.log(`✅ Codes: ${codeStats.inserted} insérés, ${codeStats.skipped} déjà existants\n`);

    // Étape 3 : Découvrir les articles pour chaque code
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📑 Découverte des articles pour chaque code...\n');

    let totalArticles = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const code of codes) {
      const articles = await discoverArticlesForCode(page, code);
      totalArticles += articles.length;

      if (articles.length > 0) {
        console.log(`   💾 Insertion de ${articles.length} articles...`);
        const stats = await insertLinks(pool, articles);
        totalInserted += stats.inserted;
        totalSkipped += stats.skipped;
        totalErrors += stats.errors;
        console.log(`   ✅ ${stats.inserted} insérés, ${stats.skipped} existants, ${stats.errors} erreurs\n`);
      }

      // Pause entre chaque code pour éviter de surcharger
      await page.waitForTimeout(1000);
    }

    // Résumé final
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎉 RÉSUMÉ FINAL\n');
    console.log(`📚 Codes découverts: ${codes.length}`);
    console.log(`   ✅ Nouveaux: ${codeStats.inserted}`);
    console.log(`   ⏭️  Existants: ${codeStats.skipped}\n`);
    console.log(`📑 Articles découverts: ${totalArticles}`);
    console.log(`   ✅ Nouveaux: ${totalInserted}`);
    console.log(`   ⏭️  Existants: ${totalSkipped}`);
    console.log(`   ❌ Erreurs: ${totalErrors}\n`);
    console.log(`📊 TOTAL: ${codes.length + totalArticles} pages`);
    console.log(`   Nouvelles: ${codeStats.inserted + totalInserted}`);
    console.log(`   À crawler: ${codeStats.inserted + totalInserted}\n`);

    // Vérifier les pages en attente
    const pendingQuery = await pool.query(`
      SELECT COUNT(*) as count
      FROM web_pages
      WHERE web_source_id = $1
        AND status = 'pending'
        AND url LIKE '%/kb/codes/%'
    `, [SOURCE_ID]);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`🔄 Pages en attente de crawl: ${pendingQuery.rows[0].count}\n`);

    console.log('🎯 Prochaines étapes:\n');
    console.log('1. Déclencher le crawl:');
    console.log('   npm run trigger-crawl\n');
    console.log('2. Monitorer le crawl:');
    console.log('   ssh root@84.247.165.187 "docker logs -f qadhya-nextjs | grep -E \'codes|articles\'"\n');
    console.log('3. Vérifier l\'indexation:');
    console.log('   SELECT COUNT(*) FROM web_pages WHERE url LIKE \'%/kb/codes/%\' AND is_indexed = true;\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error);
    await page.screenshot({ path: './9anoun-codes-error.png', fullPage: true });
    throw error;
  } finally {
    await browser.close();
    await pool.end();
    console.log('🔌 Ressources libérées\n');
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
