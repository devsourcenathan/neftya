-- Fichiers déposés localement (chantier D).
--
-- Tant que Sekuu Storage servait, les octets appartenaient à la plateforme et
-- la base ne portait que l'identifiant distant. En local, les deux vivent
-- ici : la table pour l'index, `NEFTYA_DATA_DIR` pour les octets.
--
-- Le chemin sur disque n'est jamais une entrée : `{dataDir}/{org}/{fileId}`.
-- `organization_id` borne la relecture comme l'écriture.

CREATE TABLE files (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL,
    owner_id        uuid        NOT NULL,
    name            text        NOT NULL,
    mime_type       text        NOT NULL,
    size_bytes      integer     NOT NULL,
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT files_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT files_size_not_negative CHECK (size_bytes >= 0)
);

CREATE INDEX files_organization_idx ON files (organization_id);
