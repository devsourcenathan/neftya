-- Les modèles d'une organisation.
--
-- Le catalogue livré avec Neftya vit dans le code : il est versionné, testé, et le même
-- partout. Cette table ne porte que ce qu'une organisation crée elle-même — c'est le poste
-- du §6 d'I18N.md qui manquait, et sans lequel personne ne pouvait ajouter son propre
-- meuble type.

CREATE TABLE templates (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL,
    created_by      uuid        NOT NULL,

    -- Le nom est **traduit**, parce qu'il est de la donnée : aucun fichier de locale ne
    -- connaîtra « Établi de Jean ». Le français est obligatoire — c'est la langue de
    -- référence, celle sur laquelle on retombe.
    name            jsonb       NOT NULL,

    -- L'entrée du moteur, comme pour un projet.
    model           jsonb       NOT NULL,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,

    CONSTRAINT templates_name_has_french
        CHECK (name ? 'fr' AND length(btrim(name ->> 'fr')) > 0)
);

CREATE INDEX templates_organization_idx
    ON templates (organization_id, updated_at DESC)
    WHERE deleted_at IS NULL;
