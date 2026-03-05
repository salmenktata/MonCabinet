import { query } from '@/lib/db/postgres'
async function main() {
  const r = await query(`
    SELECT kb.title,
           COUNT(kbc.id) as total,
           SUM(CASE WHEN kbc.embedding IS NOT NULL THEN 1 ELSE 0 END) as ollama_emb,
           SUM(CASE WHEN kbc.embedding_openai IS NOT NULL THEN 1 ELSE 0 END) as openai_emb
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title ILIKE '%الديوانة%'
    GROUP BY kb.title
    ORDER BY total DESC
    LIMIT 5
  `)
  r.rows.forEach(row => console.log(
    row.title?.substring(0,55),
    '| total:', row.total,
    '| ollama:', row.ollama_emb,
    '| openai:', row.openai_emb
  ))
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
