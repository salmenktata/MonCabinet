-- Migration : Intégration Messaging Webhooks (WhatsApp Business)
-- Date : 2026-02-05
-- Description : Tables configuration messaging, documents en attente, fonction normalisation téléphone

-- =====================================================
-- 1. TABLE CONFIGURATION MESSAGING WEBHOOKS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.messaging_webhooks_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp')),

  -- Configuration WhatsApp Business
  enabled BOOLEAN DEFAULT true NOT NULL,
  phone_number TEXT NOT NULL, -- Numéro WhatsApp Business
  phone_number_id TEXT NOT NULL, -- Phone Number ID (Meta API)
  business_account_id TEXT NOT NULL, -- Business Account ID (Meta API)
  webhook_verify_token TEXT NOT NULL, -- Token vérification webhook
  access_token TEXT NOT NULL, -- Access Token Meta API

  -- Paramètres automatisation
  auto_attach_documents BOOLEAN DEFAULT true NOT NULL,
  require_confirmation BOOLEAN DEFAULT false NOT NULL,
  send_confirmation BOOLEAN DEFAULT true NOT NULL,
  allowed_senders JSONB DEFAULT '[]'::jsonb, -- Liste numéros autorisés (vide = tous)

  -- Métadonnées
  last_message_at TIMESTAMP WITH TIME ZONE,
  total_messages_received INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  UNIQUE(user_id, platform)
);

-- Index
CREATE INDEX idx_messaging_webhooks_user_id ON public.messaging_webhooks_config(user_id);
CREATE INDEX idx_messaging_webhooks_phone ON public.messaging_webhooks_config(phone_number);
CREATE INDEX idx_messaging_webhooks_enabled ON public.messaging_webhooks_config(enabled) WHERE enabled = true;

-- RLS Policies
ALTER TABLE public.messaging_webhooks_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own messaging configs"
  ON public.messaging_webhooks_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger auto-update updated_at
CREATE TRIGGER update_messaging_webhooks_config_updated_at
  BEFORE UPDATE ON public.messaging_webhooks_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. TABLE DOCUMENTS EN ATTENTE DE RATTACHEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pending_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Informations document
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER CHECK (file_size > 0),
  storage_provider TEXT NOT NULL DEFAULT 'google_drive' CHECK (storage_provider = 'google_drive'),
  external_file_id TEXT, -- ID fichier temporaire dans Google Drive

  -- Source
  source_type TEXT NOT NULL CHECK (source_type IN ('whatsapp')),
  sender_phone TEXT NOT NULL, -- Téléphone expéditeur (format E.164)
  sender_name TEXT, -- Nom expéditeur WhatsApp
  message_id TEXT, -- ID message WhatsApp
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- État
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'attached', 'rejected', 'expired')) NOT NULL,
  attached_to_dossier_id UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,

  -- Métadonnées
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index
CREATE INDEX idx_pending_documents_user_id ON public.pending_documents(user_id);
CREATE INDEX idx_pending_documents_client_id ON public.pending_documents(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_pending_documents_status ON public.pending_documents(status) WHERE status = 'pending';
CREATE INDEX idx_pending_documents_sender_phone ON public.pending_documents(sender_phone);

-- RLS Policies
ALTER TABLE public.pending_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pending documents"
  ON public.pending_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending documents"
  ON public.pending_documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert pending documents"
  ON public.pending_documents FOR INSERT
  WITH CHECK (true); -- Webhooks insèrent sans auth

-- Trigger auto-update updated_at
CREATE TRIGGER update_pending_documents_updated_at
  BEFORE UPDATE ON public.pending_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. FONCTION NORMALISATION TÉLÉPHONE TUNISIEN
-- =====================================================

CREATE OR REPLACE FUNCTION normalize_phone_tn(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Retourner NULL si input NULL ou vide
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Supprimer espaces, tirets, parenthèses, points
  phone := REGEXP_REPLACE(phone, '[^0-9+]', '', 'g');

  -- Convertir format local vers E.164
  -- Format local tunisien : 8 chiffres commençant par 2-9 (ex: 20123456, 98765432)
  IF phone ~ '^[2-9][0-9]{7}$' THEN
    RETURN '+216' || phone;

  -- Format E.164 déjà correct : +216 + 8 chiffres
  ELSIF phone ~ '^\+216[2-9][0-9]{7}$' THEN
    RETURN phone;

  -- Format international 00 : 00216 + 8 chiffres
  ELSIF phone ~ '^00216[2-9][0-9]{7}$' THEN
    RETURN '+' || SUBSTRING(phone FROM 3);

  -- Format avec indicatif 216 sans + : 216 + 8 chiffres
  ELSIF phone ~ '^216[2-9][0-9]{7}$' THEN
    RETURN '+' || phone;

  -- Format invalide : retourner tel quel pour debug
  ELSE
    RETURN phone;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 4. TRIGGER AUTO-NORMALISATION TÉLÉPHONE CLIENTS
-- =====================================================

CREATE OR REPLACE FUNCTION auto_normalize_client_phone()
RETURNS TRIGGER AS $$
BEGIN
  -- Normaliser téléphone principal
  IF NEW.telephone IS NOT NULL THEN
    NEW.telephone_normalized := normalize_phone_tn(NEW.telephone);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_client_phone_trigger
  BEFORE INSERT OR UPDATE OF telephone ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION auto_normalize_client_phone();

-- =====================================================
-- 5. NORMALISER DONNÉES EXISTANTES
-- =====================================================

-- Normaliser téléphones clients existants
UPDATE public.clients
SET telephone_normalized = normalize_phone_tn(telephone)
WHERE telephone IS NOT NULL AND telephone_normalized IS NULL;

-- =====================================================
-- 6. COMMENTAIRES
-- =====================================================

COMMENT ON TABLE public.messaging_webhooks_config IS 'Configuration webhooks messagerie (WhatsApp Business pour MVP)';
COMMENT ON COLUMN public.messaging_webhooks_config.platform IS 'Plateforme messagerie : whatsapp uniquement pour MVP';
COMMENT ON COLUMN public.messaging_webhooks_config.phone_number_id IS 'Phone Number ID Meta API (WhatsApp Business)';
COMMENT ON COLUMN public.messaging_webhooks_config.auto_attach_documents IS 'Rattachement automatique si 1 seul dossier actif pour le client';
COMMENT ON COLUMN public.messaging_webhooks_config.require_confirmation IS 'Demander confirmation avocat avant rattachement automatique';
COMMENT ON COLUMN public.messaging_webhooks_config.send_confirmation IS 'Envoyer message confirmation WhatsApp au client après réception';

COMMENT ON TABLE public.pending_documents IS 'Documents reçus par messagerie en attente de rattachement manuel à un dossier';
COMMENT ON COLUMN public.pending_documents.status IS 'État : pending (en attente), attached (rattaché), rejected (rejeté), expired (expiré après 30 jours)';
COMMENT ON COLUMN public.pending_documents.sender_phone IS 'Téléphone expéditeur format E.164 (+21612345678)';
COMMENT ON COLUMN public.pending_documents.external_file_id IS 'ID fichier temporaire dans Google Drive (dossier "Documents non classés/")';

COMMENT ON FUNCTION normalize_phone_tn IS 'Normalise numéro téléphone tunisien vers format E.164 (+21612345678)';
