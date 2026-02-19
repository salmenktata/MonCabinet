-- Sprint 4: Ajouter le cron drift-detection hebdomadaire
-- Détecte automatiquement la dégradation silencieuse du RAG

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, is_enabled, is_active)
VALUES (
  'drift-detection',
  'Drift Detection RAG',
  'Détection hebdomadaire de drift RAG (similarité, abstention, hallucination, satisfaction)',
  '0 9 * * 1',
  true,
  true
)
ON CONFLICT (cron_name) DO NOTHING;
