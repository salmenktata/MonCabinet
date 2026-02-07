-- Migration: WhatsApp Messages et Media Cache
-- Date: 2026-02-05
-- Description: Historique messages WhatsApp et cache médias avec expiration 30 jours

-- Table whatsapp_messages : Historique complet des messages WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identifiants WhatsApp
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,

  -- Client lié (peut être NULL si numéro inconnu)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenu message
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document')),
  message_body TEXT,

  -- Média (si applicable)
  media_id TEXT,
  media_mime_type TEXT,
  media_file_name TEXT,
  media_file_size INTEGER,
  media_url TEXT, -- URL Supabase Storage
  media_expires_at TIMESTAMPTZ, -- Expiration URL WhatsApp (30 jours)

  -- Document créé (si média sauvegardé)
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  pending_document_id UUID REFERENCES pending_documents(id) ON DELETE SET NULL,

  -- Statut traitement
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'media_downloaded', 'document_created', 'client_not_found', 'error')),
  error_message TEXT,

  -- Audit
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour performances
CREATE INDEX idx_whatsapp_messages_client_id ON whatsapp_messages(client_id);
CREATE INDEX idx_whatsapp_messages_user_id ON whatsapp_messages(user_id);
CREATE INDEX idx_whatsapp_messages_from_phone ON whatsapp_messages(from_phone);
CREATE INDEX idx_whatsapp_messages_received_at ON whatsapp_messages(received_at DESC);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(processing_status);
CREATE INDEX idx_whatsapp_messages_media_expires ON whatsapp_messages(media_expires_at)
  WHERE media_expires_at IS NOT NULL;

-- Commentaires
COMMENT ON TABLE whatsapp_messages IS 'Historique complet des messages WhatsApp reçus via webhook';
COMMENT ON COLUMN whatsapp_messages.media_expires_at IS 'Date expiration URL WhatsApp originale (30 jours). Après expiration, utiliser media_url (Supabase Storage)';
COMMENT ON COLUMN whatsapp_messages.processing_status IS 'Statut traitement: received, media_downloaded, document_created, client_not_found, error';

-- RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateur voit ses propres messages
CREATE POLICY "Users can view own whatsapp messages"
ON whatsapp_messages
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System peut créer/update messages (webhook)
CREATE POLICY "System can manage whatsapp messages"
ON whatsapp_messages
FOR ALL
USING (true)
WITH CHECK (true);

---

-- Table whatsapp_media_cache : Cache médias téléchargés (éviter re-téléchargement)
CREATE TABLE IF NOT EXISTS whatsapp_media_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identifiant média WhatsApp
  media_id TEXT NOT NULL UNIQUE,
  whatsapp_message_id TEXT REFERENCES whatsapp_messages(whatsapp_message_id) ON DELETE CASCADE,

  -- Métadonnées
  mime_type TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,

  -- Stockage Supabase
  storage_bucket TEXT NOT NULL DEFAULT 'documents',
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,

  -- Expiration
  whatsapp_url_expires_at TIMESTAMPTZ NOT NULL, -- URL WhatsApp expire après 30 jours
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cache status
  is_expired BOOLEAN GENERATED ALWAYS AS (whatsapp_url_expires_at < now()) STORED,
  last_accessed_at TIMESTAMPTZ DEFAULT now(),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_whatsapp_media_cache_media_id ON whatsapp_media_cache(media_id);
CREATE INDEX idx_whatsapp_media_cache_expires_at ON whatsapp_media_cache(whatsapp_url_expires_at);
CREATE INDEX idx_whatsapp_media_cache_expired ON whatsapp_media_cache(is_expired);

-- Commentaires
COMMENT ON TABLE whatsapp_media_cache IS 'Cache des médias WhatsApp téléchargés. Évite re-téléchargement si URL WhatsApp expirée.';
COMMENT ON COLUMN whatsapp_media_cache.whatsapp_url_expires_at IS 'Date expiration URL WhatsApp (30 jours après réception message)';
COMMENT ON COLUMN whatsapp_media_cache.is_expired IS 'Calculé automatiquement: true si URL WhatsApp expirée';

-- RLS
ALTER TABLE whatsapp_media_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Lecture publique (utilisé par webhook)
CREATE POLICY "Anyone can read media cache"
ON whatsapp_media_cache
FOR SELECT
USING (true);

-- Policy: System peut gérer cache
CREATE POLICY "System can manage media cache"
ON whatsapp_media_cache
FOR ALL
USING (true)
WITH CHECK (true);

---

-- Vue : Médias expirés nécessitant nettoyage
CREATE OR REPLACE VIEW whatsapp_media_expired AS
SELECT
  wmc.*,
  wm.client_id,
  wm.user_id,
  EXTRACT(DAY FROM (now() - wmc.whatsapp_url_expires_at)) AS days_since_expired
FROM whatsapp_media_cache wmc
LEFT JOIN whatsapp_messages wm ON wmc.whatsapp_message_id = wm.whatsapp_message_id
WHERE wmc.is_expired = true
ORDER BY wmc.whatsapp_url_expires_at ASC;

COMMENT ON VIEW whatsapp_media_expired IS 'Liste des médias WhatsApp dont l''URL originale a expiré (>30 jours). Utiliser storage_url à la place.';

---

-- Vue : Statistiques messages WhatsApp (30 jours)
CREATE OR REPLACE VIEW whatsapp_stats_30d AS
SELECT
  user_id,
  COUNT(*) AS total_messages,
  COUNT(CASE WHEN message_type = 'text' THEN 1 END) AS text_messages,
  COUNT(CASE WHEN message_type IN ('image', 'video', 'audio', 'document') THEN 1 END) AS media_messages,
  COUNT(CASE WHEN processing_status = 'document_created' THEN 1 END) AS documents_created,
  COUNT(CASE WHEN processing_status = 'client_not_found' THEN 1 END) AS unknown_clients,
  COUNT(CASE WHEN processing_status = 'error' THEN 1 END) AS errors,
  COUNT(DISTINCT from_phone) AS unique_senders,
  MAX(received_at) AS last_message_at
FROM whatsapp_messages
WHERE received_at > (now() - INTERVAL '30 days')
GROUP BY user_id;

COMMENT ON VIEW whatsapp_stats_30d IS 'Statistiques messages WhatsApp par utilisateur sur 30 derniers jours';

---

-- Fonction : Nettoyer vieux messages (garder 90 jours, configurable)
CREATE OR REPLACE FUNCTION cleanup_old_whatsapp_messages(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Supprimer messages anciens
  DELETE FROM whatsapp_messages
  WHERE received_at < (now() - (retention_days || ' days')::INTERVAL)
  RETURNING id INTO deleted_count;

  -- Supprimer cache médias orphelins
  DELETE FROM whatsapp_media_cache
  WHERE whatsapp_message_id NOT IN (SELECT whatsapp_message_id FROM whatsapp_messages);

  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION cleanup_old_whatsapp_messages IS 'Supprime les messages WhatsApp de plus de X jours (défaut 90). Retourne nombre supprimé.';

---

-- Fonction : Marquer média comme expiré et logger
CREATE OR REPLACE FUNCTION mark_media_as_expired()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_expired = true AND OLD.is_expired = false THEN
    -- Logger expiration
    RAISE NOTICE 'Media % expired. Use Supabase Storage URL: %', NEW.media_id, NEW.storage_url;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_media_expiration
AFTER UPDATE ON whatsapp_media_cache
FOR EACH ROW
WHEN (NEW.is_expired = true AND OLD.is_expired = false)
EXECUTE FUNCTION mark_media_as_expired();

COMMENT ON TRIGGER trigger_media_expiration ON whatsapp_media_cache IS 'Log automatique quand URL WhatsApp expire';

---

-- Instructions
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables WhatsApp Messages et Media Cache créées !';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables ajoutées :';
  RAISE NOTICE '  - whatsapp_messages : Historique messages reçus';
  RAISE NOTICE '  - whatsapp_media_cache : Cache médias (évite re-téléchargement)';
  RAISE NOTICE '';
  RAISE NOTICE 'Vues ajoutées :';
  RAISE NOTICE '  - whatsapp_media_expired : Médias dont URL WhatsApp expirée';
  RAISE NOTICE '  - whatsapp_stats_30d : Stats messages 30 jours';
  RAISE NOTICE '';
  RAISE NOTICE 'Fonctions ajoutées :';
  RAISE NOTICE '  - cleanup_old_whatsapp_messages(days) : Nettoie messages > X jours';
  RAISE NOTICE '  - mark_media_as_expired() : Trigger auto sur expiration';
  RAISE NOTICE '';
  RAISE NOTICE 'Configuration recommandée :';
  RAISE NOTICE '  - Cron cleanup : hebdomadaire (garder 90 jours)';
  RAISE NOTICE '  - Monitoring : whatsapp_media_expired (URLs expirées)';
  RAISE NOTICE '';
  RAISE NOTICE 'Expiration médias WhatsApp :';
  RAISE NOTICE '  - URL WhatsApp originale : 30 jours';
  RAISE NOTICE '  - Après expiration : utiliser storage_url (Supabase permanent)';
  RAISE NOTICE '';
  RAISE NOTICE 'Requêtes utiles :';
  RAISE NOTICE '  SELECT * FROM whatsapp_media_expired;';
  RAISE NOTICE '  SELECT * FROM whatsapp_stats_30d WHERE user_id = ''xxx'';';
  RAISE NOTICE '  SELECT cleanup_old_whatsapp_messages(90);';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
