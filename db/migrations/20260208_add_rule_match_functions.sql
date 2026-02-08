-- Migration: Fonctions pour le tracking des règles de classification
-- Date: 2026-02-08
-- Description: Fonctions pour incrémenter les compteurs de match et de correction

-- Fonction pour incrémenter le compteur de match d'une règle
CREATE OR REPLACE FUNCTION increment_rule_match(
  p_rule_id UUID,
  p_is_correct BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE source_classification_rules
  SET
    times_matched = times_matched + 1,
    times_correct = CASE
      WHEN p_is_correct = true THEN times_correct + 1
      ELSE times_correct
    END,
    last_matched_at = NOW(),
    updated_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_rule_match IS 'Incrémente le compteur de match d''une règle de classification';
