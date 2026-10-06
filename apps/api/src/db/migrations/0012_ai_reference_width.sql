-- L'échelle d'une interprétation faite à partir d'une image.
--
-- Une photo ne porte aucune cote. Le modèle rend des **proportions**, et l'utilisateur
-- fournit une seule mesure : la largeur hors-tout. Les deux autres cotes s'en déduisent.
--
-- Cette largeur appartient donc à la génération, pas à l'appel qui la relit : sans elle,
-- `GET /v1/assistant/interpretations/{id}` saurait lire des rapports sans savoir par quoi
-- les multiplier, et rendrait « inutilisable » un résultat parfaitement bon.
--
-- `NULL` pour une description écrite, qui porte ses millimètres elle-même. C'est aussi ce
-- qui dit à la relecture quelle composition appliquer — mesurée, ou mise à l'échelle.

ALTER TABLE ai_generations
    ADD COLUMN IF NOT EXISTS width_mm integer;

-- La profondeur, quand l'utilisateur la donne.
--
-- Une vue de face ne montre pas la profondeur : le modèle rend `null`, honnêtement, et
-- refuser là-dessus rendrait inutilisable le cas le plus courant — la photo prise en face.
-- Elle est donc **demandée** plutôt que devinée, et facultative : une vue de trois quarts
-- permet au modèle de la proposer.
ALTER TABLE ai_generations
    ADD COLUMN IF NOT EXISTS depth_mm integer;

-- Même borne que celle du moteur côté application : une largeur hors de cet intervalle
-- n'est pas un meuble, et la laisser entrer rendrait une proportion juste en cote absurde.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_generations_reference_mm'
          AND conrelid = 'ai_generations'::regclass
    ) THEN
        ALTER TABLE ai_generations
            ADD CONSTRAINT ai_generations_reference_mm
            CHECK (
                (width_mm IS NULL OR (width_mm >= 100 AND width_mm <= 4000))
                AND (depth_mm IS NULL OR (depth_mm >= 100 AND depth_mm <= 4000))
            );
    END IF;
END $$;
