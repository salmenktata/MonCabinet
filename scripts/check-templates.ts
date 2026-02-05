import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
})

async function checkTemplates() {
  try {
    console.log('📊 Vérification des templates dans PostgreSQL\n')

    const result = await pool.query(`
      SELECT
        id,
        titre,
        type_document,
        est_public,
        user_id
      FROM templates
      ORDER BY titre
    `)

    const templates = result.rows

    console.log(`✅ Total templates: ${templates.length}\n`)

    // Grouper par type
    const parType: Record<string, any[]> = {}
    templates.forEach(t => {
      if (!parType[t.type_document]) parType[t.type_document] = []
      parType[t.type_document].push(t)
    })

    console.log('📋 Par type de document:\n')
    Object.keys(parType).sort().forEach(type => {
      console.log(`  ${type} (${parType[type].length}):`)
      parType[type].forEach(t => {
        const lang = /[\u0600-\u06FF]/.test(t.titre) ? '🇹🇳 AR' : '🇫🇷 FR'
        const vis = t.est_public ? '🌐' : '🔒'
        const owner = t.user_id ? '👤' : '🏢'
        console.log(`    ${lang} ${vis} ${owner} ${t.titre}`)
      })
      console.log()
    })

    // Statistiques langue
    const fr = templates.filter(t => !/[\u0600-\u06FF]/.test(t.titre)).length
    const ar = templates.filter(t => /[\u0600-\u06FF]/.test(t.titre)).length
    const publics = templates.filter(t => t.est_public).length

    console.log('📈 Statistiques:')
    console.log(`  - Français: ${fr}`)
    console.log(`  - Arabe: ${ar}`)
    console.log(`  - Publics: ${publics}`)
    console.log(`  - Utilisateur: ${templates.length - publics}`)

    await pool.end()
  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  }
}

checkTemplates()
