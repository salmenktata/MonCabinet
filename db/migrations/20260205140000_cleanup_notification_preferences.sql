-- Migration: Nettoyage préférences notifications
-- Date: 2026-02-05
-- Description: Supprime la colonne JSONB obsolète notification_preferences de profiles
--              La table dédiée notification_preferences est maintenant utilisée

-- Supprimer la colonne JSONB obsolète de profiles si elle existe
ALTER TABLE profiles DROP COLUMN IF EXISTS notification_preferences;

-- Note: La table notification_preferences (migration 20260205000008) est la source de vérité
-- pour les préférences de notifications utilisateur
