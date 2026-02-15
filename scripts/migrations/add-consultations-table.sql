-- Migration: Add consultations table for consultation history
-- Date: 2026-02-15

CREATE TABLE IF NOT EXISTS consultations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  context TEXT,
  conseil TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  domain TEXT,
  quality_indicator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_user ON consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at DESC);
