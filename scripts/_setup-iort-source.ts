import 'dotenv/config'
import { db } from '../lib/db/postgres'

async function main() {
  const existing = await db.query(
    "SELECT id, name, base_url FROM web_sources WHERE base_url ILIKE '%iort%'",
  )
  if (existing.rows.length > 0) {
    console.log('Source IORT:', existing.rows[0])
    process.exit(0)
  }
  const adminResult = await db.query(
    "SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1",
  )
  const adminId = adminResult.rows[0]?.id
  const result = await db.query(
    `INSERT INTO web_sources (name, base_url, description, category, language, priority,
      crawl_frequency, max_depth, max_pages, requires_javascript,
      css_selectors, url_patterns, excluded_patterns,
      sitemap_url, rss_feed_url, use_sitemap, download_files,
      respect_robots_txt, rate_limit_ms, custom_headers,
      created_by, next_crawl_at, ignore_ssl_errors,
      seed_urls, form_crawl_config, auto_index_files, allowed_pdf_domains, drive_config
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::interval,$8,$9,$10,
      $11,$12::text[],$13::text[],$14,$15,$16,$17,$18,$19,$20,
      $21,NOW(),$22,$23::text[],$24,$25,$26::text[],$27) RETURNING id,name`,
    ['IORT - Journal Officiel de la République Tunisienne','http://www.iort.gov.tn',
     "Site officiel IORT",'jort','ar',9,'7 days',3,5000,true,
     '{}','{}','{}',null,null,false,true,false,5000,'{}',adminId,false,'{}',null,true,'{}',null]
  )
  console.log('Créé:', result.rows[0])
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
