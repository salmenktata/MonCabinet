-- =============================================================================
-- Migration: Table web_files pour les fichiers téléchargés et indexés
-- =============================================================================

-- Table pour stocker les métadonnées des fichiers (PDF, DOCX) téléchargés
CREATE TABLE IF NOT EXISTS web_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
  web_source_id UUID NOT NULL REFERENCES web_sources(id) ON DELETE CASCADE,
  knowledge_base_id UUID REFERENCES knowledge_base(id) ON DELETE SET NULL,

  -- Identification
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- pdf, docx, doc, etc.

  -- Stockage
  minio_path TEXT,
  file_size BIGINT DEFAULT 0,
  content_hash TEXT, -- SHA256 pour déduplication

  -- Contenu extrait
  text_content TEXT, -- Texte extrait (limité pour stockage)
  word_count INTEGER DEFAULT 0,
  chunks_count INTEGER DEFAULT 0,

  -- Métadonnées extraites
  extracted_title TEXT,
  extracted_author TEXT,
  extracted_date TIMESTAMPTZ,
  page_count INTEGER,

  -- État
  is_downloaded BOOLEAN DEFAULT false,
  is_indexed BOOLEAN DEFAULT false,
  download_error TEXT,
  parse_error TEXT,

  -- Timestamps
  downloaded_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contrainte d'unicité
  CONSTRAINT unique_page_file_url UNIQUE (web_page_id, url)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_web_files_source ON web_files(web_source_id);
CREATE INDEX IF NOT EXISTS idx_web_files_page ON web_files(web_page_id);
CREATE INDEX IF NOT EXISTS idx_web_files_kb ON web_files(knowledge_base_id) WHERE knowledge_base_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_files_pending ON web_files(web_source_id, is_downloaded, is_indexed)
  WHERE is_downloaded = false OR is_indexed = false;
CREATE INDEX IF NOT EXISTS idx_web_files_type ON web_files(file_type);

-- Commentaires
COMMENT ON TABLE web_files IS 'Fichiers (PDF, DOCX) téléchargés depuis les pages web et indexés dans le RAG';
COMMENT ON COLUMN web_files.minio_path IS 'Chemin du fichier dans MinIO (bucket web-files)';
COMMENT ON COLUMN web_files.text_content IS 'Texte extrait du fichier (limité à 10000 caractères pour stockage)';

-- =============================================================================
-- Initialisation du bucket MinIO pour les fichiers web
-- Note: À exécuter manuellement ou via script d'initialisation
-- =============================================================================

-- Fonction pour obtenir les stats des fichiers d'une source
CREATE OR REPLACE FUNCTION get_web_source_files_stats(p_source_id UUID)
RETURNS TABLE (
  total_files BIGINT,
  downloaded_files BIGINT,
  indexed_files BIGINT,
  failed_files BIGINT,
  total_size_bytes BIGINT,
  total_chunks BIGINT,
  by_type JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_files,
    COUNT(*) FILTER (WHERE is_downloaded = true)::BIGINT as downloaded_files,
    COUNT(*) FILTER (WHERE is_indexed = true)::BIGINT as indexed_files,
    COUNT(*) FILTER (WHERE download_error IS NOT NULL OR parse_error IS NOT NULL)::BIGINT as failed_files,
    COALESCE(SUM(file_size), 0)::BIGINT as total_size_bytes,
    COALESCE(SUM(chunks_count), 0)::BIGINT as total_chunks,
    jsonb_object_agg(
      COALESCE(wf.file_type, 'unknown'),
      type_count
    ) as by_type
  FROM web_files wf
  LEFT JOIN LATERAL (
    SELECT file_type, COUNT(*) as type_count
    FROM web_files
    WHERE web_source_id = p_source_id
    GROUP BY file_type
  ) type_stats ON wf.file_type = type_stats.file_type
  WHERE wf.web_source_id = p_source_id;
END;
$$ LANGUAGE plpgsql;
