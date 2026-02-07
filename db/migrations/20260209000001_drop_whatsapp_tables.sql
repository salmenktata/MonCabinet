-- Migration: Suppression des tables WhatsApp
-- Description: Supprime toutes les tables, fonctions et vues liées à WhatsApp Business

-- =============================================================================
-- SUPPRESSION DES VUES
-- =============================================================================

DROP VIEW IF EXISTS whatsapp_media_expired CASCADE;
DROP VIEW IF EXISTS whatsapp_stats_30d CASCADE;

-- =============================================================================
-- SUPPRESSION DES FONCTIONS
-- =============================================================================

DROP FUNCTION IF EXISTS cleanup_old_whatsapp_messages(integer) CASCADE;
DROP FUNCTION IF EXISTS mark_media_as_expired() CASCADE;
DROP FUNCTION IF EXISTS normalize_phone_tn(text) CASCADE;
DROP FUNCTION IF EXISTS auto_normalize_client_phone() CASCADE;

-- =============================================================================
-- SUPPRESSION DES TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_auto_normalize_client_phone ON clients;
DROP TRIGGER IF EXISTS trigger_mark_media_expired ON whatsapp_media_cache;

-- =============================================================================
-- SUPPRESSION DES TABLES
-- =============================================================================

DROP TABLE IF EXISTS whatsapp_media_cache CASCADE;
DROP TABLE IF EXISTS whatsapp_messages CASCADE;
DROP TABLE IF EXISTS pending_documents CASCADE;
DROP TABLE IF EXISTS messaging_webhooks_config CASCADE;

-- =============================================================================
-- NETTOYAGE DES CONFIGURATIONS
-- =============================================================================

-- Supprimer les configurations WhatsApp de la table platform_config
DELETE FROM platform_config WHERE key IN (
  'WHATSAPP_ENABLED',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_PHONE_NUMBER'
);

-- =============================================================================
-- NETTOYAGE DES COLONNES RÉSIDUELLES
-- =============================================================================

-- Supprimer la colonne notification_sent des documents si elle existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'notification_sent'
  ) THEN
    ALTER TABLE documents DROP COLUMN notification_sent;
  END IF;
END $$;

-- Supprimer la colonne source des documents si elle contient des valeurs whatsapp
-- (on garde la colonne mais on nettoie les données)
UPDATE documents SET source = 'manual' WHERE source = 'whatsapp';
