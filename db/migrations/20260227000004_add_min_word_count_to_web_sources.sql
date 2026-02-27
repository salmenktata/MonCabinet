-- Migration: Add min_word_count to web_sources
-- Date: 2026-02-27
-- Purpose: Allow per-source minimum word count threshold for indexation
-- Default 30 words (global threshold) but some sources (e.g. iort.gov.tn) have
-- legitimate short documents (appointment decrees ~18-20 words)

ALTER TABLE web_sources
ADD COLUMN IF NOT EXISTS min_word_count INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN web_sources.min_word_count IS
  'Nombre minimum de mots requis pour indexer une page. Défaut 30. '
  'Mettre à une valeur plus basse pour les sources avec des documents courts légitimes (ex: JORT décrets).';
