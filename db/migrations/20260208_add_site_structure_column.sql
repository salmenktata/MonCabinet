-- Migration: Ajout de la colonne site_structure à web_pages
-- Date: 2026-02-08
-- Description: Ajoute une colonne JSONB pour stocker la structure du site
--              (breadcrumbs, navigation, metadata) pour améliorer la classification

-- Ajouter la colonne site_structure
ALTER TABLE web_pages
ADD COLUMN IF NOT EXISTS site_structure JSONB DEFAULT NULL;

-- Index GIN pour recherche dans la structure
CREATE INDEX IF NOT EXISTS idx_web_pages_site_structure
ON web_pages USING gin(site_structure);

-- Commentaire sur la colonne
COMMENT ON COLUMN web_pages.site_structure IS 'Structure du site (breadcrumbs, navigation, metadata) en JSON';
