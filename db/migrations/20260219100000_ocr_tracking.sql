-- Migration: Ajouter le tracking OCR dans knowledge_base
-- Permet de filtrer/re-traiter les documents OCR de faible qualité

-- Colonne ocr_applied sur knowledge_base
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS ocr_applied BOOLEAN DEFAULT false;

-- Index pour requêtes de maintenance (trouver les docs OCR)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_ocr_applied
ON knowledge_base (ocr_applied) WHERE ocr_applied = true;

-- Note: ocr_confidence est stocké dans knowledge_base_chunks.metadata.ocr_confidence
-- Pas besoin de colonne dédiée — le JSONB metadata est plus flexible
