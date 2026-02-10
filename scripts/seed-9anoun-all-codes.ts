#!/usr/bin/env tsx

/**
 * Script seed pour insérer les 50 codes du droit tunisien depuis 9anoun.tn
 *
 * Source: https://9anoun.tn/kb/codes
 *
 * Usage:
 *   DB_PASSWORD="prod_secure_password_2026" npx tsx scripts/seed-9anoun-all-codes.ts
 */

import { Pool } from 'pg';
import crypto from 'crypto';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'prod_secure_password_2026',
  connectionTimeoutMillis: 10000,
  keepAlive: true,
};

const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'; // ID de 9anoun.tn

interface Code {
  titleAr: string;
  titleFr: string;
  slug: string;
}

/**
 * Liste complète des 50 codes disponibles sur 9anoun.tn
 * Source: Page https://9anoun.tn/kb/codes (février 2026)
 */
const ALL_CODES: Code[] = [
  {
    titleAr: 'Projet du Code des Changes 2024',
    titleFr: 'Projet du Code des Changes 2024',
    slug: 'projet-code-des-changes-2024'
  },
  {
    titleAr: 'مشروع قانون يتعلق بتنظيم عقود الشغل ومنع المناولة',
    titleFr: 'Projet de loi sur les contrats de travail',
    slug: 'code-travail-proposition-amendements-2025'
  },
  {
    titleAr: 'مجلة الديوانة',
    titleFr: 'Code des Douanes',
    slug: 'code-douanes'
  },
  {
    titleAr: 'مجلة الجماعات المحلية',
    titleFr: 'Code des Collectivités Locales',
    slug: 'code-collectivites-locales'
  },
  {
    titleAr: 'المجلة التجارية',
    titleFr: 'Code de Commerce',
    slug: 'code-commerce'
  },
  {
    titleAr: 'مجلة التجارة البحرية',
    titleFr: 'Code de Commerce Maritime',
    slug: 'code-commerce-maritime'
  },
  {
    titleAr: 'مجلة المحاسبة العمومية',
    titleFr: 'Code de Comptabilité Publique',
    slug: 'code-comptabilite-publique'
  },
  {
    titleAr: 'مجلة القانون الدولي الخاص',
    titleFr: 'Code de Droit International Privé',
    slug: 'code-droit-international-prive'
  },
  {
    titleAr: 'مجلة الحقوق العينية',
    titleFr: 'Code des Droits Réels',
    slug: 'code-droits-reels'
  },
  {
    titleAr: 'مجلة الضريبة على دخل الأشخاص الطبيعيين والضريبة على الشركات',
    titleFr: 'Code de l\'Impôt sur le Revenu et sur les Sociétés',
    slug: 'code-impot-sur-revenu-personnes-physiques-impot-sur-les-societes'
  },
  {
    titleAr: 'مجلة الالتزامات والعقود',
    titleFr: 'Code des Obligations et des Contrats',
    slug: 'code-obligations-contrats'
  },
  {
    titleAr: 'مجلة المرافعات المدنية والتجارية',
    titleFr: 'Code de Procédure Civile et Commerciale',
    slug: 'code-procedure-civile-commerciale'
  },
  {
    titleAr: 'مجلة الإجراءات الجزائية',
    titleFr: 'Code de Procédure Pénale',
    slug: 'code-procedure-penale'
  },
  {
    titleAr: 'مجلة حماية الطفل',
    titleFr: 'Code de Protection de l\'Enfant',
    slug: 'code-protection-enfant'
  },
  {
    titleAr: 'مجلة الطرقات',
    titleFr: 'Code de la Route',
    slug: 'code-route'
  },
  {
    titleAr: 'مجلة الشركات التجارية',
    titleFr: 'Code des Sociétés Commerciales',
    slug: 'code-societes-commerciales'
  },
  {
    titleAr: 'مجلة الأحوال الشخصية',
    titleFr: 'Code du Statut Personnel',
    slug: 'code-statut-personnel'
  },
  {
    titleAr: 'مجلة الأداء على القيمة المضافة',
    titleFr: 'Code de la TVA',
    slug: 'code-tva'
  },
  {
    titleAr: 'مجلة الشغل',
    titleFr: 'Code du Travail',
    slug: 'code-travail'
  },
  {
    titleAr: 'مجلة واجبات الطبيب البيطرى',
    titleFr: 'Code de Déontologie Vétérinaire',
    slug: 'code-deontologie-veterinaire'
  },
  {
    titleAr: 'مجلة واجبات الطبيب',
    titleFr: 'Code de Déontologie Médicale',
    slug: 'code-deontologie-medicale'
  },
  {
    titleAr: 'مجلة الغابات',
    titleFr: 'Code Forestier',
    slug: 'code-forestier'
  },
  {
    titleAr: 'مجلة المرافعات والعقوبات العسكرية',
    titleFr: 'Code de Justice Militaire',
    slug: 'code-justice-militaire'
  },
  {
    titleAr: 'مجلة حماية التراث الأثرى و التاريخى و الفنون التقليدية',
    titleFr: 'Code du Patrimoine',
    slug: 'code-patrimoine'
  },
  {
    titleAr: 'مجلة الاتصالات',
    titleFr: 'Code des Télécommunications',
    slug: 'code-telecommunications'
  },
  {
    titleAr: 'مجلة السلامة والوقاية من أخطار الحريق والانفجار والفزع بالبنايات',
    titleFr: 'Code de Prévention des Incendies',
    slug: 'code-prevention-incendies'
  },
  {
    titleAr: 'مجلة إسداء الخدمات المالية لغير المقيمين',
    titleFr: 'Code des Services Financiers aux Non-Résidents',
    slug: 'code-services-financiers-non-residents'
  },
  {
    titleAr: 'مجلة الموانئ البحرية',
    titleFr: 'Code des Ports Maritimes',
    slug: 'code-ports-maritimes'
  },
  {
    titleAr: 'مجلة التهيئة الترابية والتعمير',
    titleFr: 'Code de l\'Aménagement du Territoire et de l\'Urbanisme',
    slug: 'code-amenagement-territoire-urbanisme'
  },
  {
    titleAr: 'مجلة التحكيم',
    titleFr: 'Code de l\'Arbitrage',
    slug: 'code-arbitrage'
  },
  {
    titleAr: 'مجلة التأمين',
    titleFr: 'Code des Assurances',
    slug: 'code-assurances'
  },
  {
    titleAr: 'مجلة الصرف و التجارة الخارجية',
    titleFr: 'Code des Changes et du Commerce Extérieur',
    slug: 'code-changes-commerce-exterieur'
  },
  {
    titleAr: 'مجلة معاليم التسجيل والطابع الجبائي',
    titleFr: 'Code de l\'Enregistrement et du Timbre Fiscal',
    slug: 'code-enregistrement-timbre-fiscal'
  },
  {
    titleAr: 'مجلة الحقوق والإجراءات الجبائية',
    titleFr: 'Code des Droits et Procédures Fiscales',
    slug: 'code-droits-procedures-fiscales'
  },
  {
    titleAr: 'مجلة المياه',
    titleFr: 'Code des Eaux',
    slug: 'code-eaux'
  },
  {
    titleAr: 'مجلة الجباية المحلية',
    titleFr: 'Code de la Fiscalité Locale',
    slug: 'code-fiscalite-locale'
  },
  {
    titleAr: 'مجلة تشجيع الإستثمارات',
    titleFr: 'Code des Investissements',
    slug: 'code-investissements'
  },
  {
    titleAr: 'مجلة الجنسية',
    titleFr: 'Code de la Nationalité',
    slug: 'code-nationalite'
  },
  {
    titleAr: 'المجلة الجزائية',
    titleFr: 'Code Pénal',
    slug: 'code-penal'
  },
  {
    titleAr: 'مجلة الشغل البحري',
    titleFr: 'Code du Travail Maritime',
    slug: 'code-travail-maritime'
  },
  {
    titleAr: 'مجلة الطيران المدني',
    titleFr: 'Code de l\'Aviation Civile',
    slug: 'code-aviation-civile'
  },
  {
    titleAr: 'مجلة الأوسمة',
    titleFr: 'Code des Décorations',
    slug: 'code-decorations'
  },
  {
    titleAr: 'مجلة الواجبات المهنية للمهندسين المعماريين',
    titleFr: 'Code de Déontologie des Architectes',
    slug: 'code-deontologie-architectes'
  },
  {
    titleAr: 'المجلة التأديبية والجزائية البحرية',
    titleFr: 'Code Disciplinaire et Pénal Maritime',
    slug: 'code-disciplinaire-penal-maritime'
  },
  {
    titleAr: 'مجلة المحروقات',
    titleFr: 'Code des Hydrocarbures',
    slug: 'code-hydrocarbures'
  },
  {
    titleAr: 'مجلة تنطيم الصناعة السينمائية',
    titleFr: 'Code du Cinéma',
    slug: 'code-cinema'
  },
  {
    titleAr: 'مجلة المناجم',
    titleFr: 'Code Minier',
    slug: 'code-minier'
  },
  {
    titleAr: 'مجلة مؤسسات التوظيف الجماعي',
    titleFr: 'Code des Organismes de Placement Collectif',
    slug: 'code-opcvm'
  },
  {
    titleAr: 'مجلة الصياد البحري',
    titleFr: 'Code de la Pêche Maritime',
    slug: 'code-peche-maritime'
  },
  {
    titleAr: 'مجلة التنظيم الإداري للملاحة البحرية',
    titleFr: 'Code de l\'Organisation Administrative de la Navigation Maritime',
    slug: 'code-organisation-navigation-maritime'
  },
  {
    titleAr: 'مجلة البريد',
    titleFr: 'Code Postal',
    slug: 'code-postal'
  },
  {
    titleAr: 'مجلة الصحافة',
    titleFr: 'Code de la Presse',
    slug: 'code-presse'
  }
];

async function seedCodes() {
  console.log('\n📚 Seed des 50 Codes du Droit Tunisien (9anoun.tn)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const pool = new Pool(PROD_DB_CONFIG);

  try {
    // Connexion DB
    await pool.query('SELECT NOW()');
    console.log('✅ Connexion DB établie\n');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('📥 Insertion des codes...\n');

    for (const code of ALL_CODES) {
      const url = `https://9anoun.tn/kb/codes/${code.slug}`;
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      const title = `${code.titleAr} - قانون 🇹🇳`;

      try {
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
            $1, $2, $3, 'pending', $4, 1, NOW(),
            95, -- Confiance élevée pour codes officiels
            0.95, -- Pertinence élevée
            'legislation', -- Domaine juridique
            'validated', -- Statut validé (skip analyse)
            jsonb_build_object(
              'source_type', 'code',
              'source_authority', '9anoun.tn',
              'confidence', 'high',
              'auto_classified', true,
              'code_name_ar', $5::text,
              'code_name_fr', $6::text,
              'code_slug', $7::text
            )
          )
          ON CONFLICT (web_source_id, url_hash)
          DO UPDATE SET
            status = CASE
              WHEN web_pages.status = 'failed' THEN 'pending'
              WHEN web_pages.status = 'pending' THEN 'pending'
              ELSE web_pages.status
            END,
            title = COALESCE(web_pages.title, $4),
            quality_score = COALESCE(web_pages.quality_score, 95),
            relevance_score = COALESCE(web_pages.relevance_score, 0.95),
            legal_domain = COALESCE(web_pages.legal_domain, 'legislation'),
            processing_status = CASE
              WHEN web_pages.processing_status = 'pending' THEN 'validated'
              ELSE web_pages.processing_status
            END,
            site_structure = COALESCE(
              web_pages.site_structure,
              jsonb_build_object(
                'source_type', 'code',
                'source_authority', '9anoun.tn',
                'confidence', 'high',
                'auto_classified', true,
                'code_name_ar', $5::text,
                'code_name_fr', $6::text,
                'code_slug', $7::text
              )
            ),
            updated_at = NOW()
          RETURNING (xmax = 0) as is_new_insert
        `, [
          SOURCE_ID,
          url,
          urlHash,
          title,
          code.titleAr,
          code.titleFr,
          code.slug
        ]);

        if (result.rows[0].is_new_insert) {
          inserted++;
          console.log(`   ✅ Nouveau: ${code.titleAr}`);
        } else {
          // Vérifier si on a mis à jour ou juste skipped
          const wasUpdated = (result.rowCount ?? 0) > 0;
          if (wasUpdated) {
            updated++;
            console.log(`   🔄 Mis à jour: ${code.titleAr}`);
          } else {
            skipped++;
            console.log(`   ⏭️  Inchangé: ${code.titleAr}`);
          }
        }
      } catch (err) {
        errors++;
        console.error(`   ❌ Erreur: ${code.titleAr}`, err instanceof Error ? err.message : err);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 RÉSUMÉ\n');
    console.log(`   Total codes: ${ALL_CODES.length}`);
    console.log(`   ✅ Nouveaux: ${inserted}`);
    console.log(`   🔄 Mis à jour: ${updated}`);
    console.log(`   ⏭️  Inchangés: ${skipped}`);
    console.log(`   ❌ Erreurs: ${errors}\n`);

    // Vérifier l'état final
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status IN ('crawled', 'unchanged')) as crawled,
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
        COUNT(*) FILTER (WHERE quality_score >= 90) as high_quality,
        COUNT(*) FILTER (WHERE processing_status = 'validated') as validated
      FROM web_pages
      WHERE web_source_id = $1
        AND url LIKE '%/kb/codes/%'
        AND url ~ '/kb/codes/[^/]+$'
    `, [SOURCE_ID]);

    const stats = statsQuery.rows[0];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📈 ÉTAT DE LA BASE\n');
    console.log(`   Total codes (pages principales): ${stats.total}`);
    console.log(`   En attente de crawl: ${stats.pending}`);
    console.log(`   Déjà crawlés: ${stats.crawled}`);
    console.log(`   Indexés: ${stats.indexed}`);
    console.log(`   Haute qualité (score ≥90): ${stats.high_quality}`);
    console.log(`   Validés (skip analyse): ${stats.validated}\n`);

    if (parseInt(stats.pending) > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🎯 PROCHAINES ÉTAPES\n');
      console.log('1. Déclencher le crawl pour récupérer le contenu des codes:');
      console.log('   npm run trigger:crawl\n');
      console.log('2. Monitorer le crawl:');
      console.log('   ssh root@84.247.165.187 "docker logs -f qadhya-nextjs | grep -E \'codes|9anoun\'"\n');
      console.log('3. Après crawl, découvrir les articles de chaque code:');
      console.log('   npm run discover:codes\n');
      console.log('   (Cette commande va extraire les liens vers tous les articles)\n');
    }

  } catch (error) {
    console.error('\n❌ Erreur:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('🔌 Connexion fermée\n');
  }
}

// Point d'entrée
async function main() {
  try {
    await seedCodes();
    console.log('✅ Seed terminé avec succès !\n');
  } catch (error) {
    console.error('\n❌ Le script a échoué');
    process.exit(1);
  }
}

main();
