-- ============================================================================
-- Regles de Classification v2 pour 9anoun.tn
-- ============================================================================
-- Version 2 : Couverture complete des 50+ codes + sections /kb/
-- Idempotent : toutes les insertions utilisent ON CONFLICT DO NOTHING
-- Sert de backup/audit pour le fast-path TypeScript

DO $$
DECLARE
  source_id UUID;
BEGIN
  SELECT id INTO source_id FROM web_sources WHERE base_url LIKE '%9anoun.tn%' LIMIT 1;

  IF source_id IS NULL THEN
    RAISE NOTICE 'Source 9anoun.tn non trouvee - regles non creees';
  ELSE
    RAISE NOTICE 'Source 9anoun.tn trouvee: %', source_id;

    -- ========================================================================
    -- MISE A JOUR : Augmenter confidence_boost des 7 regles existantes
    -- ========================================================================
    UPDATE source_classification_rules
    SET confidence_boost = 0.60
    WHERE web_source_id = source_id
      AND name IN (
        'Code des Obligations et Contrats',
        'Code de Commerce',
        'Code Penal',
        'Code de Procedure Civile et Commerciale',
        'Code du Statut Personnel',
        'Code du Travail',
        'Code Foncier'
      );

    -- ========================================================================
    -- NOUVEAUX CODES : 43+ regles specifiques par domaine
    -- ========================================================================

    -- Nationalite -> Civil
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la Nationalite', 'Droit civil - nationalite',
      '[{"type": "url_contains", "value": "/code-nationalite/"}]'::jsonb,
      'legislation', 'civil', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Protection Enfant -> Famille
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Protection de l''Enfant', 'Droit de la famille',
      '[{"type": "url_contains", "value": "/code-protection-enfant/"}]'::jsonb,
      'legislation', 'famille', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Societes Commerciales -> Societes
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Societes Commerciales', 'Droit des societes',
      '[{"type": "url_contains", "value": "/code-societes-commerciales/"}]'::jsonb,
      'legislation', 'societes', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Changes et Commerce Exterieur -> Commercial
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Changes et Commerce Exterieur', 'Droit commercial',
      '[{"type": "url_contains", "value": "/code-changes-commerce-exterieur/"}]'::jsonb,
      'legislation', 'commercial', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Projet Code des Changes 2024 -> Commercial
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Projet Code des Changes 2024', 'Projet de loi commercial',
      '[{"type": "url_contains", "value": "/projet-code-des-changes-2024/"}]'::jsonb,
      'legislation', 'commercial', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Commerce Maritime -> Maritime
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Commerce Maritime', 'Droit maritime',
      '[{"type": "url_contains", "value": "/code-commerce-maritime/"}]'::jsonb,
      'legislation', 'maritime', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Justice Militaire -> Penal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Justice Militaire', 'Droit penal militaire',
      '[{"type": "url_contains", "value": "/code-justice-militaire/"}]'::jsonb,
      'legislation', 'penal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Disciplinaire Penal Maritime -> Penal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Disciplinaire et Penal Maritime', 'Droit penal maritime',
      '[{"type": "url_contains", "value": "/code-disciplinaire-penal-maritime/"}]'::jsonb,
      'legislation', 'penal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Procedure Civile et Commerciale -> Procedure Civile
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Procedure Civile et Commerciale v2', 'Procedure civile',
      '[{"type": "url_contains", "value": "/code-procedure-civile-commerciale/"}]'::jsonb,
      'legislation', 'procedure_civile', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Procedure Penale -> Procedure Penale
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Procedure Penale v2', 'Procedure penale',
      '[{"type": "url_contains", "value": "/code-procedure-penale/"}]'::jsonb,
      'legislation', 'procedure_penale', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Arbitrage -> Arbitrage
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de l''Arbitrage', 'Arbitrage',
      '[{"type": "url_contains", "value": "/code-arbitrage/"}]'::jsonb,
      'legislation', 'arbitrage', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Travail Maritime -> Social
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code du Travail Maritime', 'Droit social maritime',
      '[{"type": "url_contains", "value": "/code-travail-maritime/"}]'::jsonb,
      'legislation', 'social', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Proposition Amendements Travail 2025 -> Social
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Projet Amendements Code Travail 2025', 'Projet social',
      '[{"type": "url_contains", "value": "/code-travail-proposition-amendements-2025/"}]'::jsonb,
      'legislation', 'social', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- IRPP/IS -> Fiscal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code IRPP/IS', 'Fiscalite - impot sur le revenu et societes',
      '[{"type": "url_contains", "value": "/code-impot-sur-revenu-personnes-physiques-impot-sur-les-societes/"}]'::jsonb,
      'legislation', 'fiscal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- TVA -> Fiscal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la TVA', 'Fiscalite - TVA',
      '[{"type": "url_contains", "value": "/code-tva/"}]'::jsonb,
      'legislation', 'fiscal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Droits et Procedures Fiscales -> Fiscal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Droits et Procedures Fiscales', 'Procedures fiscales',
      '[{"type": "url_contains", "value": "/code-droits-procedures-fiscales/"}]'::jsonb,
      'legislation', 'fiscal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Enregistrement Timbre Fiscal -> Fiscal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Enregistrement et Timbre Fiscal', 'Fiscalite - enregistrement',
      '[{"type": "url_contains", "value": "/code-enregistrement-timbre-fiscal/"}]'::jsonb,
      'legislation', 'fiscal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Fiscalite Locale -> Fiscal
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la Fiscalite Locale', 'Fiscalite locale',
      '[{"type": "url_contains", "value": "/code-fiscalite-locale/"}]'::jsonb,
      'legislation', 'fiscal', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Douanes -> Douanier
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Douanes v2', 'Droit douanier',
      '[{"type": "url_contains", "value": "/code-douanes/"}]'::jsonb,
      'legislation', 'douanier', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Comptabilite Publique -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Comptabilite Publique v2', 'Administratif - finances publiques',
      '[{"type": "url_contains", "value": "/code-comptabilite-publique/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Collectivites Locales -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Collectivites Locales v2', 'Administratif - collectivites',
      '[{"type": "url_contains", "value": "/code-collectivites-locales/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Amenagement Territoire -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Amenagement Territoire et Urbanisme', 'Administratif - urbanisme',
      '[{"type": "url_contains", "value": "/code-amenagement-territoire-urbanisme/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Decorations -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Decorations', 'Administratif - decorations',
      '[{"type": "url_contains", "value": "/code-decorations/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Presse -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la Presse', 'Administratif - presse',
      '[{"type": "url_contains", "value": "/code-presse/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Patrimoine -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code du Patrimoine', 'Administratif - patrimoine',
      '[{"type": "url_contains", "value": "/code-patrimoine/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Cinema -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code du Cinema', 'Administratif - cinema',
      '[{"type": "url_contains", "value": "/code-cinema/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Route -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la Route', 'Administratif - route',
      '[{"type": "url_contains", "value": "/code-route/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Postal -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Postal', 'Administratif - poste',
      '[{"type": "url_contains", "value": "/code-postal/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Deontologie Medicale -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Deontologie Medicale', 'Administratif - sante',
      '[{"type": "url_contains", "value": "/code-deontologie-medicale/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Deontologie Veterinaire -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Deontologie Veterinaire', 'Administratif - veterinaire',
      '[{"type": "url_contains", "value": "/code-deontologie-veterinaire/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Deontologie Architectes -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Deontologie des Architectes', 'Administratif - architectes',
      '[{"type": "url_contains", "value": "/code-deontologie-architectes/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Prevention Incendies -> Administratif
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Prevention des Incendies', 'Administratif - securite',
      '[{"type": "url_contains", "value": "/code-prevention-incendies/"}]'::jsonb,
      'legislation', 'administratif', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Assurances -> Assurance
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Assurances', 'Droit des assurances',
      '[{"type": "url_contains", "value": "/code-assurances/"}]'::jsonb,
      'legislation', 'assurance', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Droit International Prive
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de Droit International Prive v2', 'DIP',
      '[{"type": "url_contains", "value": "/code-droit-international-prive/"}]'::jsonb,
      'legislation', 'international_prive', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Services Financiers Non-Residents -> Bancaire
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Services Financiers Non-Residents', 'Bancaire - offshore',
      '[{"type": "url_contains", "value": "/code-services-financiers-non-residents/"}]'::jsonb,
      'legislation', 'bancaire', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- OPCVM -> Bancaire
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des OPCVM', 'Bancaire - placements collectifs',
      '[{"type": "url_contains", "value": "/code-opcvm/"}]'::jsonb,
      'legislation', 'bancaire', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Investissements -> Bancaire
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Investissements', 'Bancaire - investissements',
      '[{"type": "url_contains", "value": "/code-investissements/"}]'::jsonb,
      'legislation', 'bancaire', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Forestier -> Environnement
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Forestier', 'Environnement - forets',
      '[{"type": "url_contains", "value": "/code-forestier/"}]'::jsonb,
      'legislation', 'environnement', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Eaux -> Environnement
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Eaux', 'Environnement - eau',
      '[{"type": "url_contains", "value": "/code-eaux/"}]'::jsonb,
      'legislation', 'environnement', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Minier -> Energie
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Minier', 'Energie - mines',
      '[{"type": "url_contains", "value": "/code-minier/"}]'::jsonb,
      'legislation', 'energie', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Hydrocarbures -> Energie
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Hydrocarbures', 'Energie - hydrocarbures',
      '[{"type": "url_contains", "value": "/code-hydrocarbures/"}]'::jsonb,
      'legislation', 'energie', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Ports Maritimes -> Maritime
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Ports Maritimes', 'Maritime - ports',
      '[{"type": "url_contains", "value": "/code-ports-maritimes/"}]'::jsonb,
      'legislation', 'maritime', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Navigation Maritime -> Maritime
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code Organisation Navigation Maritime', 'Maritime - navigation',
      '[{"type": "url_contains", "value": "/code-organisation-navigation-maritime/"}]'::jsonb,
      'legislation', 'maritime', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Peche Maritime -> Maritime
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de la Peche Maritime', 'Maritime - peche',
      '[{"type": "url_contains", "value": "/code-peche-maritime/"}]'::jsonb,
      'legislation', 'maritime', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Aviation Civile -> Aerien
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code de l''Aviation Civile', 'Droit aerien',
      '[{"type": "url_contains", "value": "/code-aviation-civile/"}]'::jsonb,
      'legislation', 'aerien', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Telecommunications -> Numerique
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Telecommunications', 'Numerique - telecoms',
      '[{"type": "url_contains", "value": "/code-telecommunications/"}]'::jsonb,
      'legislation', 'numerique', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Droits Reels -> Immobilier
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Code des Droits Reels v2', 'Immobilier - droits reels',
      '[{"type": "url_contains", "value": "/code-droits-reels/"}]'::jsonb,
      'legislation', 'immobilier', 'loi', 95, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- SECTIONS /KB/ MANQUANTES
    -- ========================================================================

    -- Constitutions -> Constitutionnel
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Constitutions', 'Droit constitutionnel',
      '[{"type": "url_contains", "value": "/kb/constitutions/"}]'::jsonb,
      'legislation', 'constitutionnel', 'constitution', 90, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Conventions internationales
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Conventions internationales', 'Conventions et traites',
      '[{"type": "url_contains", "value": "/kb/conventions/"}]'::jsonb,
      'legislation', 'international_public', 'convention', 90, 0.60, true
    ) ON CONFLICT DO NOTHING;

    -- Lois generales
    INSERT INTO source_classification_rules (
      web_source_id, name, description,
      conditions, target_category, target_domain, target_document_type,
      priority, confidence_boost, is_active
    ) VALUES (
      source_id, 'Lois generales', 'Textes legislatifs divers',
      '[{"type": "url_contains", "value": "/kb/lois/"}]'::jsonb,
      'legislation', NULL, 'loi', 90, 0.60, true
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Regles v2 creees/mises a jour pour 9anoun.tn';
  END IF;
END $$;
