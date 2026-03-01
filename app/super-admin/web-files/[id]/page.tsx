import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import WebFileDetail from '@/components/super-admin/web-files/WebFileDetail'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getFileDetail(id: string) {
  const result = await db.query(
    `SELECT
      wf.*,
      ws.name as source_name,
      ws.category as source_category,
      wp.url as page_url,
      wp.title as page_title,
      kb.title as kb_title
    FROM web_files wf
    LEFT JOIN web_sources ws ON wf.web_source_id = ws.id
    LEFT JOIN web_pages wp ON wf.web_page_id = wp.id
    LEFT JOIN knowledge_base kb ON wf.knowledge_base_id = kb.id
    WHERE wf.id = $1`,
    [id]
  )

  if (result.rows.length === 0) return null

  const file = result.rows[0]

  let chunks: Array<{ id: string; chunkIndex: number; content: string; tokenCount: number }> = []
  if (file.knowledge_base_id) {
    const chunksResult = await db.query(
      `SELECT id, chunk_index, content, token_count
       FROM knowledge_base_chunks
       WHERE knowledge_base_id = $1
       ORDER BY chunk_index`,
      [file.knowledge_base_id]
    )
    chunks = chunksResult.rows.map((c) => ({
      id: c.id,
      chunkIndex: c.chunk_index,
      content: c.content,
      tokenCount: c.token_count,
    }))
  }

  return {
    file: {
      id: file.id,
      webPageId: file.web_page_id,
      webSourceId: file.web_source_id,
      knowledgeBaseId: file.knowledge_base_id,
      url: file.url,
      filename: file.filename,
      fileType: file.file_type,
      fileSize: file.file_size,
      contentHash: file.content_hash,
      textContent: file.text_content,
      wordCount: file.word_count,
      chunksCount: file.chunks_count,
      extractedTitle: file.extracted_title,
      extractedAuthor: file.extracted_author,
      extractedDate: file.extracted_date,
      pageCount: file.page_count,
      isDownloaded: file.is_downloaded,
      isIndexed: file.is_indexed,
      downloadError: file.download_error,
      parseError: file.parse_error,
      downloadedAt: file.downloaded_at,
      indexedAt: file.indexed_at,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      sourceName: file.source_name,
      sourceCategory: file.source_category,
      pageUrl: file.page_url,
      pageTitle: file.page_title,
      kbTitle: file.kb_title,
      status: (
        file.download_error || file.parse_error
          ? 'error'
          : file.is_indexed
            ? 'indexed'
            : file.is_downloaded
              ? 'downloaded'
              : 'pending'
      ) as 'pending' | 'downloaded' | 'indexed' | 'error',
    },
    chunks,
  }
}

export default async function WebFileDetailPage({ params }: PageProps) {
  const session = await getSession()
  if (!session?.user?.id) {
    return <div className="p-6 text-red-400">Non authentifié</div>
  }

  const { id } = await params
  const data = await getFileDetail(id)

  if (!data) {
    notFound()
  }

  return (
    <div className="p-6">
      <WebFileDetail file={data.file} chunks={data.chunks} />
    </div>
  )
}
