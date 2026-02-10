#!/usr/bin/env tsx

/**
 * Script pour découvrir tous les articles du Code des Obligations et Contrats
 * sur 9anoun.tn et les insérer dans la base de données pour crawl
 *
 * Usage:
 *   DB_PASSWORD="moncabinet" npx tsx scripts/discover-9anoun-coc-articles.ts
 *
 * Prérequis:
 *   - Tunnel SSH actif : ssh -f -N -L 5434:localhost:5432 root@84.247.165.187
 *   - Variable DB_PASSWORD définie
 */

import { chromium } from 'playwright';
import { Pool } from 'pg';
import crypto from 'crypto';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434, // Tunnel SSH vers prod
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  connectionTimeoutMillis: 10000,
  keepAlive: true,
};

const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'; // ID de 9anoun.tn
const COC_URL = 'https://9anoun.tn/kb/codes/code-obligations-contrats';

interface ArticleLink {
  url: string;
  text: string;
  selector?: string;
}

async function discoverArticles() {
  console.log('\n🔍 Découverte des articles du Code des Obligations et Contrats\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Étape 1 : Lancer Playwright
  console.log('🌐 Lancement du navigateur Playwright...');
  const browser = await chromium.launch({
    headless: false, // Mode visible pour debug
    slowMo: 100, // Ralentir pour observer
  });

  const context = await browser.newContext({
    userAgent: 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  try {
    // Étape 2 : Navigation vers la page COC
    console.log(`📡 Navigation vers ${COC_URL}...`);
    await page.goto(COC_URL, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    console.log('✅ Page chargée (networkidle)\n');

    // Étape 3 : Attendre les scripts AJAX
    console.log('⏳ Attente des scripts AJAX (3 secondes)...');
    await page.waitForTimeout(3000);

    // Étape 4 : Scroll pour forcer le lazy loading
    console.log('📜 Scroll vers le bas pour forcer le lazy loading...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    // Scroll vers le haut pour recharger les éléments du haut
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);

    console.log('✅ Scroll terminé\n');

    // Étape 5 : Extraire les liens vers les articles
    console.log('🔎 Extraction des liens vers les articles...');

    // Stratégie 1 : Liens <a> classiques avec "article" dans l'URL
    const links1 = await page.$$eval('a[href*="code-obligations-contrats"]', links =>
      links
        .map(link => ({
          url: (link as HTMLAnchorElement).href,
          text: link.textContent?.trim() || '',
          selector: 'a[href*="code-obligations-contrats"]'
        }))
        .filter(link => link.url.includes('article') || link.text.match(/article|فصل/i))
    );

    // Stratégie 2 : Tous les éléments avec data-href ou @click
    const links2 = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[data-href], [onclick], [x-on\\:click]'));
      return elements
        .map(el => {
          const dataHref = el.getAttribute('data-href');
          const onclick = el.getAttribute('onclick');
          const text = el.textContent?.trim() || '';

          // Extraire l'URL depuis l'attribut
          const url = dataHref || onclick?.match(/window\.location=['"](.*?)['"]/)?.[1];

          return url ? {
            url: url.startsWith('http') ? url : `https://9anoun.tn${url}`,
            text,
            selector: 'data-href/onclick'
          } : null;
        })
        .filter(Boolean) as Array<{ url: string; text: string; selector: string }>;
    });

    // Stratégie 3 : Parser le contenu pour détecter des patterns d'articles
    const links3 = await page.evaluate(() => {
      // Chercher tous les éléments qui ressemblent à des articles
      const potentialArticles = Array.from(document.querySelectorAll('div, li, article'))
        .filter(el => {
          const text = el.textContent?.trim() || '';
          // Détection arabe : "الفصل X" ou français "Article X"
          return text.match(/(الفصل|article)\s*\d+/i);
        })
        .map(el => {
          const text = el.textContent?.trim() || '';
          const match = text.match(/(الفصل|article)\s*(\d+)/i);
          if (match) {
            const articleNum = match[2];
            return {
              url: `https://9anoun.tn/kb/codes/code-obligations-contrats/code-obligations-contrats-article-${articleNum}`,
              text: text.substring(0, 100),
              selector: 'inferred from content'
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{ url: string; text: string; selector: string }>;

      return potentialArticles;
    });

    // Combiner toutes les stratégies et dédupliquer
    const allLinks = [...links1, ...links2, ...links3];
    const uniqueLinks = Array.from(
      new Map(allLinks.map(link => [link.url, link])).values()
    );

    console.log(`\n📊 Résultats de l'extraction:`);
    console.log(`   Stratégie 1 (liens <a>): ${links1.length} liens`);
    console.log(`   Stratégie 2 (data-href/onclick): ${links2.length} liens`);
    console.log(`   Stratégie 3 (inférence contenu): ${links3.length} liens`);
    console.log(`   Total après déduplication: ${uniqueLinks.length} liens\n`);

    if (uniqueLinks.length === 0) {
      console.log('⚠️  AUCUN lien découvert !');
      console.log('\n💡 Suggestions:');
      console.log('   1. Vérifier manuellement la structure de la page');
      console.log('   2. Le contenu est peut-être dans un iframe');
      console.log('   3. Les articles sont peut-être sur une autre page');
      console.log('\n📸 Capture d\'écran sauvegardée dans ./coc-page-debug.png');
      await page.screenshot({ path: './coc-page-debug.png', fullPage: true });

      // Afficher le HTML pour debug
      const html = await page.content();
      console.log('\n📄 Début du HTML de la page:');
      console.log(html.substring(0, 2000));

      return;
    }

    // Afficher quelques exemples
    console.log('📋 Exemples de liens découverts:\n');
    uniqueLinks.slice(0, 10).forEach((link, i) => {
      console.log(`   ${i + 1}. ${link.text.substring(0, 50)}${link.text.length > 50 ? '...' : ''}`);
      console.log(`      ${link.url}`);
      console.log(`      (via ${link.selector})\n`);
    });

    if (uniqueLinks.length > 10) {
      console.log(`   ... et ${uniqueLinks.length - 10} autres\n`);
    }

    // Étape 6 : Connexion à la base de données
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💾 Connexion à la base de données de production...');

    const pool = new Pool(PROD_DB_CONFIG);

    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Connexion établie\n');

      // Étape 7 : Insertion dans web_pages
      console.log('📥 Insertion des articles dans la base de données...\n');

      let inserted = 0;
      let skipped = 0;
      let errors = 0;

      for (const link of uniqueLinks) {
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
              first_seen_at
            )
            VALUES ($1, $2, $3, 'pending', $4, 1, NOW())
            ON CONFLICT (web_source_id, url_hash)
            DO UPDATE SET
              status = CASE
                WHEN web_pages.status = 'failed' THEN 'pending'
                ELSE web_pages.status
              END,
              updated_at = NOW()
            RETURNING (xmax = 0) as inserted
          `, [SOURCE_ID, link.url, urlHash, link.text.substring(0, 255)]);

          if (result.rows[0].inserted) {
            inserted++;
            console.log(`   ✅ Inséré: ${link.url}`);
          } else {
            skipped++;
            console.log(`   ⏭️  Déjà existe: ${link.url}`);
          }
        } catch (err) {
          errors++;
          console.error(`   ❌ Erreur sur ${link.url}:`, err instanceof Error ? err.message : err);
        }
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📊 Résumé de l\'insertion:\n');
      console.log(`   ✅ Nouveaux articles insérés: ${inserted}`);
      console.log(`   ⏭️  Articles déjà existants: ${skipped}`);
      console.log(`   ❌ Erreurs: ${errors}`);
      console.log(`   📝 Total traité: ${uniqueLinks.length}\n`);

      // Vérifier les pages en attente de crawl
      const pendingQuery = await pool.query(`
        SELECT COUNT(*) as count
        FROM web_pages
        WHERE web_source_id = $1
          AND status = 'pending'
          AND url LIKE '%code-obligations-contrats%'
      `, [SOURCE_ID]);

      const pendingCount = pendingQuery.rows[0].count;
      console.log(`🔄 Pages COC en attente de crawl: ${pendingCount}\n`);

      if (pendingCount > 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🎯 Prochaines étapes:\n');
        console.log('1. Déclencher un crawl manuel via l\'API admin:');
        console.log('   npm run trigger-crawl -- 9anoun.tn\n');
        console.log('2. OU attendre le prochain crawl automatique (cron)');
        console.log('3. OU déclencher via l\'interface admin:\n');
        console.log('   https://qadhya.tn/super-admin/web-sources\n');
        console.log('4. Monitorer le crawl:');
        console.log('   ssh root@84.247.165.187 "docker logs -f qadhya-nextjs | grep COC"\n');
      }

    } finally {
      await pool.end();
      console.log('🔌 Connexion DB fermée\n');
    }

  } catch (error) {
    console.error('\n❌ Erreur lors de la découverte:', error);

    if (error instanceof Error) {
      console.error('   Message:', error.message);

      // Capture d'écran en cas d'erreur
      try {
        await page.screenshot({ path: './coc-page-error.png', fullPage: true });
        console.log('\n📸 Capture d\'écran d\'erreur sauvegardée: ./coc-page-error.png');
      } catch (screenshotErr) {
        console.error('   Impossible de faire une capture d\'écran');
      }
    }

    throw error;
  } finally {
    await browser.close();
    console.log('🌐 Navigateur fermé\n');
  }
}

// Fonction pour vérifier les prérequis
async function checkPrerequisites() {
  console.log('🔍 Vérification des prérequis...\n');

  // Vérifier le tunnel SSH
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  try {
    const { stdout } = await execPromise('ps aux | grep "5434.*84.247.165.187" | grep -v grep');
    if (stdout.trim()) {
      console.log('✅ Tunnel SSH actif\n');
      return true;
    }
  } catch (err) {
    // grep retourne exit code 1 si aucun résultat
  }

  console.log('❌ Tunnel SSH non détecté\n');
  console.log('💡 Créer le tunnel avec:');
  console.log('   ssh -f -N -L 5434:localhost:5432 root@84.247.165.187\n');

  return false;
}

// Point d'entrée
async function main() {
  try {
    const hasSSH = await checkPrerequisites();

    if (!hasSSH) {
      console.log('⚠️  Création du tunnel SSH...');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      try {
        await execPromise('ssh -f -N -L 5434:localhost:5432 root@84.247.165.187');
        console.log('✅ Tunnel SSH créé\n');
        // Attendre que le tunnel soit prêt
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error('❌ Impossible de créer le tunnel SSH');
        console.error('   Veuillez le créer manuellement et relancer le script\n');
        process.exit(1);
      }
    }

    await discoverArticles();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Script terminé avec succès !\n');

  } catch (error) {
    console.error('\n❌ Le script a échoué');
    process.exit(1);
  }
}

main();
