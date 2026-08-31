-- Phase 2 — projets et réglages d'organisation.
--
-- Les identifiants sont des UUID : « les identifiants auto-incrémentés ne doivent jamais
-- être exposés » (Sekuu api-guidelines §7). UUIDv7 est généré côté application, pour
-- l'ordre temporel et la localité d'index.
--
-- Il n'y a pas de table `users`. Ce n'est pas un oubli.

CREATE TABLE projects (
    id              uuid PRIMARY KEY,
    -- La frontière d'isolation. Vient du jeton, jamais de la requête.
    organization_id uuid        NOT NULL,
    -- Le `sub` de la plateforme. Référence logique : aucune clé étrangère ne peut
    -- pointer vers une table qui n'existe pas ici, et c'est le but.
    created_by      uuid        NOT NULL,
    name            text        NOT NULL,
    -- L'entrée du moteur. Structure évolutive, pas un schéma relationnel.
    model           jsonb       NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    -- Les suppressions de données commerciales sont exceptionnelles.
    deleted_at      timestamptz,

    CONSTRAINT projects_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- Toute lecture est filtrée par organisation : l'index la porte en tête.
CREATE INDEX projects_organization_id_idx
    ON projects (organization_id)
    WHERE deleted_at IS NULL;

CREATE INDEX projects_organization_updated_idx
    ON projects (organization_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE organization_settings (
    organization_id uuid PRIMARY KEY,
    -- NULL = suivre la plateforme. Voir docs/I18N.md §3.
    country         char(2),
    currency        char(3),
    unit_system     text        NOT NULL DEFAULT 'metric',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT organization_settings_unit_system
        CHECK (unit_system IN ('metric', 'imperial'))
);
