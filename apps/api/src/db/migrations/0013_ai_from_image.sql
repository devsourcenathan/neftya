-- Ce qui dit qu'une génération vient d'une image.
--
-- La relecture le déduisait de la présence d'une largeur : une génération qui en portait une
-- venait d'une photo, les autres d'une description. C'était vrai tant que la largeur était
-- exigée avec l'image.
--
-- Depuis le 6 octobre, elle ne l'est plus — le modèle en propose une quand on n'en donne pas,
-- parce que refuser laissait l'utilisateur devant un écran vide. Une image sans largeur
-- donnée serait donc relue comme une description, et ses proportions lues comme des cotes
-- absentes : « inutilisable » pour un résultat parfaitement bon.
--
-- Un drapeau dit ce qu'il en est, au lieu de le faire deviner à une colonne qui parlait
-- d'autre chose.

ALTER TABLE ai_generations
    ADD COLUMN IF NOT EXISTS from_image boolean NOT NULL DEFAULT false;

-- `false` par défaut, et c'est juste pour l'existant : avant cette migration, toute
-- génération venait d'une description écrite. Les quelques-unes nées d'une image portaient
-- forcément une largeur, et gardent le bon comportement par le rattrapage ci-dessous.
UPDATE ai_generations
SET from_image = true
WHERE width_mm IS NOT NULL;
