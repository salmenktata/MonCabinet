-- Migration: Ajouter le support de bypass SSL pour les sources web
-- Nécessaire pour les sites gouvernementaux avec certificats invalides (ex: cassation.tn)

ALTER TABLE web_sources ADD COLUMN IF NOT EXISTS ignore_ssl_errors BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN web_sources.ignore_ssl_errors IS 'Ignorer les erreurs de certificat SSL (sites gouvernementaux avec certificats invalides)';
