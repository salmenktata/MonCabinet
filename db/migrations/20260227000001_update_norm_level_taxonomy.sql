-- Migration : Mise à jour taxonomie norm_level (Circulaire n°8/2017)
-- Distinction mرسوم (Fsl.70, force de loi) vs أوامر (Fsl.94, pouvoir réglementaire)
--
-- Avant : 7 niveaux (constitution ... decret_presidentiel ... arrete_ministeriel ... acte_local)
-- Après : 8 niveaux (... marsoum ... ordre_reglementaire ... arrete_ministeriel ... acte_local)
--
-- Basé sur la Circulaire n°8/2017 du Gouvernement Tunisien :
--   - مرسوم (niveau 5) : délégation législative exceptionnelle (Fsl.70), force de loi
--   - أوامر حكومية/رئاسية (niveau 6) : pouvoir réglementaire ordinaire (Fsl.94)
--
-- Appliqué en prod : 2026-02-27

-- Transaction 1 : modifications de l'ENUM (COMMIT obligatoire avant d'utiliser les nouvelles valeurs)
BEGIN;

-- ============================================================
-- 1. Renommer 'decret_presidentiel' → 'marsoum' dans l'ENUM
--    PostgreSQL 10+ supporte ALTER TYPE ... RENAME VALUE
-- ============================================================
ALTER TYPE norm_level RENAME VALUE 'decret_presidentiel' TO 'marsoum';

-- ============================================================
-- 2. Ajouter 'ordre_reglementaire' entre marsoum et arrete_ministeriel
--    ATTENTION : La nouvelle valeur ne peut être utilisée qu'après COMMIT
-- ============================================================
ALTER TYPE norm_level ADD VALUE IF NOT EXISTS 'ordre_reglementaire' AFTER 'marsoum';

COMMIT;

-- Transaction 2 : mise à jour des données (après COMMIT du ENUM)
BEGIN;

-- ============================================================
-- 3. Mettre à jour knowledge_base :
--    Titres أمر حكومي / أمر رئاسي / application → ordre_reglementaire
--    (les مرسوم restent marsoum par défaut depuis le rename)
-- ============================================================
UPDATE knowledge_base
SET norm_level = 'ordre_reglementaire'
WHERE norm_level = 'marsoum'
  AND (
    title ILIKE '%أمر حكومي%'
    OR title ILIKE '%أمر رئاسي%'
    OR title ILIKE '%Décret gouvernemental%'
    OR subcategory IN ('decret_gouvernemental', 'ordre_presidentiel', 'decret_application', 'arrete_application')
  );

-- ============================================================
-- 4. Sync colonne norm_level → metadata JSONB (knowledge_base)
-- ============================================================
UPDATE knowledge_base
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{norm_level}',
  to_jsonb(norm_level::text)
)
WHERE norm_level IN ('marsoum', 'ordre_reglementaire');

-- ============================================================
-- 5. Propager aux chunks (knowledge_base_chunks.metadata)
-- ============================================================
UPDATE knowledge_base_chunks kbc
SET metadata = jsonb_set(
  COALESCE(kbc.metadata, '{}'::jsonb),
  '{norm_level}',
  to_jsonb(kb.norm_level::text)
)
FROM knowledge_base kb
WHERE kbc.knowledge_base_id = kb.id
  AND kb.norm_level IN ('marsoum', 'ordre_reglementaire');

COMMIT;

-- ============================================================
-- Vérification post-migration
-- ============================================================
-- SELECT norm_level, COUNT(*) FROM knowledge_base GROUP BY norm_level ORDER BY norm_level;
-- SELECT enum_range(NULL::norm_level);
