-- Migration: knowledge_gaps
-- Sprint 2 — Missing Knowledge Queue
-- Date: 2026-03-01

-- =============================================================================
-- TABLE: knowledge_gaps
-- Lacunes de connaissances identifiées automatiquement depuis les abstentions RAG
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification du gap
  domain TEXT NOT NULL,              -- Domaine juridique (droit_civil, droit_penal, etc.)
  abstention_count INTEGER NOT NULL, -- Nombre d'abstentions sur la période analysée
  avg_similarity FLOAT,              -- Similarité moyenne des requêtes abstenues (plus bas = pire)

  -- Priorisation
  priority TEXT NOT NULL DEFAULT 'medium',
    -- 'high'   → abstention_count >= 10 OU avg_similarity < 0.20
    -- 'medium' → abstention_count 3-9 OU avg_similarity 0.20-0.30
    -- 'low'    → abstention_count 1-2

  -- Exemples de queries pour comprendre le gap
  example_queries TEXT[],            -- Jusqu'à 5 exemples de questions sans réponse

  -- Sources suggérées pour combler le gap (suggestion heuristique)
  suggested_sources TEXT[],

  -- Workflow
  status TEXT NOT NULL DEFAULT 'open',
    -- 'open'        → identifié, pas encore traité
    -- 'in_progress' → acquisition en cours
    -- 'resolved'    → gap comblé (vérification automatique via chunk count)
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Traçabilité
  analysis_period_days INTEGER DEFAULT 7,  -- Fenêtre d'analyse utilisée
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_domain ON knowledge_gaps(domain);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_priority ON knowledge_gaps(priority);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON knowledge_gaps(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_created ON knowledge_gaps(created_at DESC);

COMMENT ON TABLE knowledge_gaps IS
  'Lacunes KB identifiées depuis les abstentions RAG. '
  'Alimenté automatiquement par le cron gap-analysis (lundi 10h CET).';
