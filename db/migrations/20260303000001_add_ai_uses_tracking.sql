-- Migration: Ajout colonnes ai_uses_this_month et ai_uses_reset_at sur users
-- Date: 2026-03-03
-- Contexte: Page /abonnement queryait ces colonnes absentes → erreur DB prod

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_uses_this_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_uses_reset_at timestamptz DEFAULT NULL;
