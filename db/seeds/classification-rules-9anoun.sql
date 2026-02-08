-- ============================================================================
-- Règles de Classification pour 9anoun.tn
-- ============================================================================
-- Ces règles permettent de classifier automatiquement les pages de 9anoun.tn
-- avec une haute confiance sans faire appel au LLM

-- Récupérer l'ID de la source 9anoun.tn
DO $$
DECLARE
  source_id UUID;
BEGIN
  SELECT id INTO source_id FROM web_sources WHERE base_url LIKE '%9anoun.tn%' LIMIT 1;

  IF source_id IS NULL THEN
    RAISE NOTICE 'Source 9anoun.tn non trouvée - règles non créées';
  ELSE
    RAISE NOTICE 'Source 9anoun.tn trouvée: %', source_id;

    -- ========================================================================
    -- LÉGISLATION
    -- ========================================================================

    -- Règle 1: Articles de codes juridiques
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Articles de codes juridiques',
      'Articles numérotés dans les codes (obligations, commerce, procédure, etc.)',
      '[
        {"type": "url_contains", "value": "/kb/codes/"},
        {"type": "url_pattern", "value": "article-\\d+$"}
      ]'::jsonb,
      'legislation',
      NULL, -- Déterminé par règles plus spécifiques
      'loi',
      100, -- Priorité haute
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 2: Code des Obligations et Contrats → Droit Civil
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code des Obligations et Contrats',
      'Articles du COC tunisien - Droit civil',
      '[
        {"type": "url_contains", "value": "/code-obligations-contrats/"}
      ]'::jsonb,
      'legislation',
      'civil',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 3: Code de Commerce → Droit Commercial
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code de Commerce',
      'Articles du Code de Commerce tunisien',
      '[
        {"type": "url_contains", "value": "/code-commerce/"}
      ]'::jsonb,
      'legislation',
      'commercial',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 4: Code Pénal → Droit Pénal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code Pénal',
      'Articles du Code Pénal tunisien',
      '[
        {"type": "url_contains", "value": "/code-penal/"}
      ]'::jsonb,
      'legislation',
      'penal',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 5: Code de Procédure Civile et Commerciale
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code de Procédure Civile et Commerciale',
      'CPCC - Procédure',
      '[
        {"type": "url_contains", "value": "/code-procedure-civile-commerciale/"}
      ]'::jsonb,
      'legislation',
      'civil',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 6: Code du Statut Personnel → Droit de la Famille
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code du Statut Personnel',
      'CSP - Droit de la famille',
      '[
        {"type": "url_contains", "value": "/code-statut-personnel/"}
      ]'::jsonb,
      'legislation',
      'famille',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 7: Code du Travail → Droit Social
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code du Travail',
      'Législation du travail tunisienne',
      '[
        {"type": "url_contains", "value": "/code-travail/"}
      ]'::jsonb,
      'legislation',
      'social',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 8: Code Foncier → Droit Immobilier
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Code Foncier',
      'Législation foncière et immobilière',
      '[
        {"type": "url_contains", "value": "/code-foncier/"}
      ]'::jsonb,
      'legislation',
      'immobilier',
      'loi',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- JURISPRUDENCE
    -- ========================================================================

    -- Règle 9: Décisions de jurisprudence
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Décisions de jurisprudence',
      'Arrêts et jugements des tribunaux tunisiens',
      '[
        {"type": "url_contains", "value": "/kb/jurisprudence/"}
      ]'::jsonb,
      'jurisprudence',
      NULL,
      'arret',
      90,
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 10: Cour de Cassation
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Arrêts Cour de Cassation',
      'Arrêts de la Cour de Cassation tunisienne',
      '[
        {"type": "breadcrumb_contains", "value": "Cour de Cassation"},
        {"type": "url_contains", "value": "/jurisprudence/"}
      ]'::jsonb,
      'jurisprudence',
      NULL,
      'arret',
      95,
      0.30,
      true
    ) ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- JORT (Journal Officiel)
    -- ========================================================================

    -- Règle 11: Journal Officiel
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Journal Officiel (JORT)',
      'Publications du Journal Officiel de la République Tunisienne',
      '[
        {"type": "url_contains", "value": "/jort/"}
      ]'::jsonb,
      'jort',
      NULL,
      NULL,
      90,
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- MODÈLES ET FORMULAIRES
    -- ========================================================================

    -- Règle 12: Modèles de documents
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Modèles de documents',
      'Modèles de contrats, actes, etc.',
      '[
        {"type": "url_contains", "value": "/modeles/"}
      ]'::jsonb,
      'modeles',
      NULL,
      'modele_contrat',
      90,
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    -- Règle 13: Formulaires administratifs
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Formulaires administratifs',
      'Formulaires et demandes administratives',
      '[
        {"type": "url_contains", "value": "/formulaires/"}
      ]'::jsonb,
      'formulaires',
      NULL,
      'formulaire',
      90,
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- DOCTRINE
    -- ========================================================================

    -- Règle 14: Articles de doctrine
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id,
      'Articles de doctrine',
      'Analyses et commentaires doctrinaux',
      '[
        {"type": "url_contains", "value": "/doctrine/"}
      ]'::jsonb,
      'doctrine',
      NULL,
      'article_doctrine',
      90,
      0.25,
      true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ 14 règles de classification créées pour 9anoun.tn';
  END IF;
END $$;
