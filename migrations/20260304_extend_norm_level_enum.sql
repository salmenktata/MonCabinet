-- Migration : Étendre l'ENUM norm_level avec marsoum et ordre_reglementaire
-- Context : Le code norm-levels.ts attend ces valeurs mais elles n'existent pas en DB
-- Les docs "decret_presidentiel" (أمر حكومي/أمر) seront migrés vers ordre_reglementaire
-- Les مرسوم IORT seront correctement supportés avec la valeur marsoum

-- 1. Ajouter les nouvelles valeurs ENUM (après loi_ordinaire selon hiérarchie)
ALTER TYPE norm_level ADD VALUE IF NOT EXISTS 'marsoum' AFTER 'loi_ordinaire';
ALTER TYPE norm_level ADD VALUE IF NOT EXISTS 'ordre_reglementaire' AFTER 'marsoum';

-- Note: PostgreSQL requiert un COMMIT entre ADD VALUE et son utilisation dans UPDATE
-- Cette migration ne fait que l'ALTER TYPE. Le script _fix-norm-levels.ts gère les UPDATEs.
