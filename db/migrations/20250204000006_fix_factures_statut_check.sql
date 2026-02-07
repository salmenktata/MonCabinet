-- Corriger le constraint statut pour accepter les majuscules
ALTER TABLE public.factures
DROP CONSTRAINT IF EXISTS factures_statut_check;

ALTER TABLE public.factures
ADD CONSTRAINT factures_statut_check
CHECK (statut = ANY (ARRAY[
  'BROUILLON'::text,
  'brouillon'::text,
  'ENVOYEE'::text,
  'envoyee'::text,
  'PAYEE'::text,
  'payee'::text,
  'IMPAYEE'::text,
  'impayee'::text
]));
