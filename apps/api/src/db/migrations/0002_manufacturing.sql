-- Phase 4 — prix saisis et exports figés.

-- Les prix sont saisis par l'utilisateur et mémorisés par organisation. Neftya n'invente
-- aucun tarif : le prix d'un panneau varie fortement selon la région et le fournisseur,
-- et un devis faux est pire que pas de devis.
CREATE TABLE material_prices (
    organization_id uuid        NOT NULL,
    -- `panel:mdf:18`, `edge_banding`, `accessory:screw_4x50`. Une clé stable, jamais un
    -- libellé traduit : le prix se retrouverait perdu au changement de langue.
    reference       text        NOT NULL,
    -- Unités mineures de la devise. Jamais un flottant : un devis qui tombe à un centime
    -- près est un devis faux.
    amount_minor    bigint      NOT NULL,
    -- ISO 4217. Un montant sans devise n'a pas de sens.
    currency        char(3)     NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (organization_id, reference),
    CONSTRAINT material_prices_amount_positive CHECK (amount_minor >= 0)
);

-- L'export est le seul endroit où de la donnée dérivée est stockée, et c'est par nature :
-- un plan parti à l'atelier ne doit pas changer parce que le projet a été modifié depuis.
CREATE TABLE project_exports (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL,
    project_id      uuid        NOT NULL REFERENCES projects (id),
    created_by      uuid        NOT NULL,
    kind            text        NOT NULL,
    -- L'instantané figé : modèle, pièces, placement, nomenclature, coûts, au moment de
    -- l'export. Recalculer plus tard donnerait autre chose, et c'est bien le problème.
    snapshot        jsonb       NOT NULL,
    -- L'objet Storage de la plateforme, quand le dépôt a réussi. NULL sinon : un export
    -- reste consultable même si Storage était indisponible.
    storage_object_id text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT project_exports_kind CHECK (kind IN ('pdf', 'csv'))
);

CREATE INDEX project_exports_organization_idx
    ON project_exports (organization_id, created_at DESC);

CREATE INDEX project_exports_project_idx
    ON project_exports (organization_id, project_id, created_at DESC);
