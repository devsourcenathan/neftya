-- Authentification locale Neftya.
--
-- Sekuu Platform n'étant pas disponible, Neftya porte sa propre identité :
-- comptes, organisations, appartenances, sessions. Le jour où la plateforme
-- revient, ces tables restent : ce sont les données locales du produit.
--
-- Règles :
-- - `organization_id` reste la frontière d'isolation, lue du jeton local.
-- - Les mots de passe ne sont jamais stockés : seul un condensat scrypt l'est.
-- - Les jetons de rafraîchissement sont opaques ; seul leur condensat SHA-256
--   est stocké. Le rejouement d'un jeton déjà tourné révoque la session
--   (détection de vol, comme la plateforme).
-- - `users` est ici une table d'identité locale, pas une copie de Sekuu :
--   elle détient le mot de passe, donc elle est la source, pas un doublon.
--
-- Pas d'extension `citext` : chaque fichier de test rejoue les migrations
-- dans son propre schéma, et une extension installée dans un schéma n'est
-- pas visible des autres. L'insensibilité à la casse est un index sur
-- `lower(email)`, et les contrats normalisent déjà en minuscules.

CREATE TABLE users (
    id            uuid PRIMARY KEY,
    email         text NOT NULL,
    password_hash text NOT NULL,
    first_name    text NOT NULL,
    last_name     text NOT NULL,
    language      text NOT NULL DEFAULT 'fr',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_email_not_blank CHECK (length(btrim(email)) > 0),
    CONSTRAINT users_first_name_not_blank CHECK (length(btrim(first_name)) > 0),
    CONSTRAINT users_last_name_not_blank CHECK (length(btrim(last_name)) > 0)
);

-- Un compte par adresse, quelle que soit la casse saisie.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE organizations (
    id         uuid PRIMARY KEY,
    name       text NOT NULL,
    slug       text NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT organizations_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Qui appartient à quoi, avec quel rôle. Un seul `owner` par organisation :
-- celui qui l'a créée. Le transfert explicite est une route, pas un UPDATE.
CREATE TABLE memberships (
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (organization_id, user_id),
    CONSTRAINT memberships_role CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE UNIQUE INDEX memberships_single_owner_idx
    ON memberships (organization_id)
    WHERE role = 'owner';

-- Sessions : un jeton de rafraîchissement opaque par ligne. Le secret n'est
-- jamais stocké : seul son condensat SHA-256 hexadécimal l'est.
CREATE TABLE refresh_sessions (
    id                uuid PRIMARY KEY,
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    organization_id   uuid REFERENCES organizations (id) ON DELETE CASCADE,
    token_hash        text NOT NULL UNIQUE,
    expires_at        timestamptz NOT NULL,
    revoked_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_sessions_user_idx ON refresh_sessions (user_id);

-- Invitations : un jeton opaque à usage unique, expirant. Le rôle invité ne
-- peut jamais être `owner` : la propriété ne s'invite pas, elle se transfère.
CREATE TABLE invitations (
    id              uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email           text NOT NULL,
    role            text NOT NULL,
    token_hash      text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    accepted_at     timestamptz,
    created_by      uuid NOT NULL REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT invitations_role CHECK (role IN ('admin', 'member'))
);

CREATE INDEX invitations_organization_idx ON invitations (organization_id);
