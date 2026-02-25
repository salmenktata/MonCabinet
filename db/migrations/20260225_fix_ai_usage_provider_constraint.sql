-- Migration : Fix contrainte CHECK sur ai_usage_logs.provider
-- Ajoute groq, deepseek, gemini, ollama, local au lieu de seulement openai/anthropic
--
-- Contexte : migration Feb 2026 vers Groq/DeepSeek — les nouveaux providers
-- étaient rejetés par la contrainte CHECK de la table ai_usage_logs.

ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_provider_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'ollama', 'local'));
