-- Migration: Index full-text search pour recherche globale
-- Date: 2026-02-05
-- Description: Index GIN pour recherche rapide clients, dossiers, factures, documents

-- Index full-text clients
CREATE INDEX IF NOT EXISTS idx_clients_fulltext ON clients
USING GIN (
  to_tsvector('french',
    coalesce(nom, '') || ' ' ||
    coalesce(prenom, '') || ' ' ||
    coalesce(denomination, '') || ' ' ||
    coalesce(cin, '') || ' ' ||
    coalesce(telephone, '') || ' ' ||
    coalesce(email, '')
  )
);

-- Index full-text dossiers
CREATE INDEX IF NOT EXISTS idx_dossiers_fulltext ON dossiers
USING GIN (
  to_tsvector('french',
    coalesce(numero_dossier, '') || ' ' ||
    coalesce(objet, '') || ' ' ||
    coalesce(partie_adverse, '')
  )
);

-- Index full-text factures
CREATE INDEX IF NOT EXISTS idx_factures_fulltext ON factures
USING GIN (
  to_tsvector('french',
    coalesce(numero_facture, '') || ' ' ||
    coalesce(objet, '')
  )
);

-- Index full-text documents
CREATE INDEX IF NOT EXISTS idx_documents_fulltext ON documents
USING GIN (
  to_tsvector('french',
    coalesce(nom_fichier, '') || ' ' ||
    coalesce(type_fichier, '')
  )
);

COMMENT ON INDEX idx_clients_fulltext IS 'Index full-text pour recherche rapide clients (nom, prenom, CIN, email, etc.)';
COMMENT ON INDEX idx_dossiers_fulltext IS 'Index full-text pour recherche rapide dossiers (numéro, objet, partie adverse)';
COMMENT ON INDEX idx_factures_fulltext IS 'Index full-text pour recherche rapide factures (numéro, objet)';
COMMENT ON INDEX idx_documents_fulltext IS 'Index full-text pour recherche rapide documents (nom fichier, type)';
