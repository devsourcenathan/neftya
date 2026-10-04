-- Diagnostic des extractions ratées (chantier E, suite).
--
-- Quand le modèle rendait autre chose que du JSON, on stockait `output = NULL`
-- et le texte brut était perdu : impossible de dire si le modèle avait
-- déraillé, si la réponse était tronquée, ou si le fournisseur ignorait
-- `response_format`. `raw_output` garde le brut (tronqué à 4 000 caractères),
-- succès comme échec — c'est le journal de bord, pas une donnée métier.
ALTER TABLE ai_generations ADD COLUMN raw_output text;
