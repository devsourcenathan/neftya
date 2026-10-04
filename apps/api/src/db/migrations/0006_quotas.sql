-- Quotas locaux par organisation.
--
-- Billing publiait les plafonds dans le jeton ; en local, ils vivent ici et
-- sont recopiés dans le jeton à chaque ouverture de session (login, refresh,
-- switch). Un changement prend donc effet au plus tard au prochain
-- rafraîchissement — comme une hausse de plan côté plateforme.
--
-- Trois états, comme avant (SEKUU.md §5) : pas de ligne = pas couvert, ne pas
-- plafonner ; NULL = illimité ; entier = plafond, 0 bloque tout.

CREATE TABLE organization_quotas (
    organization_id uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
    projects_max    integer,
    ai_month_max    integer,
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT organization_quotas_projects_max
        CHECK (projects_max IS NULL OR projects_max >= 0),
    CONSTRAINT organization_quotas_ai_month_max
        CHECK (ai_month_max IS NULL OR ai_month_max >= 0)
);
