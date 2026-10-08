-- Les offres, leurs prix, et ce qu'une organisation a payé.
--
-- Trois tables et une règle : **l'accès a une date de fin, et une seule.**
-- Stripe renouvelle tout seul, le mobile money se prépaie par période — deux
-- façons de remplir `current_period_end`, jamais deux façons de le lire. Deux
-- colonnes de fin d'accès auraient fini par se contredire, et c'est le client
-- qui l'aurait découvert, coupé alors qu'il avait payé.

-- Le catalogue.
--
-- En base et non dans le code : une offre change de plafond ou de prix sans
-- qu'on redéploie, et les plafonds doivent se joindre aux quotas. `free` y
-- figure comme les autres — sans elle, « l'organisation sans abonnement » et
-- « l'organisation au plan gratuit » seraient deux cas au lieu d'un.
CREATE TABLE plans (
    code         text PRIMARY KEY,
    -- `NULL` vaut illimité, comme dans organization_quotas : c'est la même
    -- convention à trois états, et en introduire une seconde ici obligerait à
    -- traduire à chaque lecture.
    projects_max integer,
    ai_month_max integer,
    members_max  integer,
    -- L'ordre d'affichage, et l'ordre tout court : on ne « descend » pas vers
    -- une offre de rang supérieur.
    rank         integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT plans_projects_max CHECK (projects_max IS NULL OR projects_max >= 0),
    CONSTRAINT plans_ai_month_max CHECK (ai_month_max IS NULL OR ai_month_max >= 0),
    CONSTRAINT plans_members_max  CHECK (members_max  IS NULL OR members_max  >= 0)
);

-- Un prix par offre, par devise et par période.
--
-- **Une offre sans prix dans une devise ne s'y vend pas.** C'est la règle qui
-- remplace une conversion : convertir 29 € en francs CFA au taux du jour
-- donnerait un prix que personne n'a décidé, qui bouge tout seul, et qu'il
-- faudrait expliquer à un client. L'absence de ligne est une réponse.
CREATE TABLE plan_prices (
    plan_code    text    NOT NULL REFERENCES plans (code) ON DELETE CASCADE,
    currency     text    NOT NULL,
    period       text    NOT NULL,
    -- En unité mineure, comme partout ailleurs dans le produit. Le franc CFA
    -- n'a pas de décimale : son unité mineure est le franc.
    amount_minor integer NOT NULL,

    PRIMARY KEY (plan_code, currency, period),

    CONSTRAINT plan_prices_period CHECK (period IN ('monthly', 'yearly')),
    CONSTRAINT plan_prices_amount CHECK (amount_minor > 0),
    CONSTRAINT plan_prices_currency CHECK (currency ~ '^[A-Z]{3}$')
);

-- Ce qu'une organisation a payé, et jusqu'à quand.
--
-- Une ligne par organisation : il n'y a pas deux abonnements en cours, et
-- l'unicité est portée par la clé plutôt que par une règle applicative qu'un
-- webhook concurrent pourrait franchir.
CREATE TABLE subscriptions (
    organization_id     uuid PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
    plan_code           text NOT NULL REFERENCES plans (code),
    status              text NOT NULL,
    period              text NOT NULL,
    /*
     * La fin de l'accès. **Le seul endroit où elle est écrite.**
     *
     * `NULL` pour le plan gratuit, qui ne finit pas. Pour tout le reste, une
     * date : posée par Stripe au fil de ses renouvellements, posée par nous à
     * l'encaissement d'une période de mobile money.
     */
    current_period_end  timestamptz,
    /*
     * D'où vient l'argent. Nul pour le gratuit.
     *
     * Conservé même après résiliation : c'est par là qu'on retrouve la trace
     * d'un paiement contesté des mois plus tard.
     */
    provider            text,
    /* L'identifiant chez le fournisseur — `sub_...` chez Stripe. */
    provider_ref        text,
    /*
     * Vrai quand le client a résilié mais a payé jusqu'au bout de sa période.
     * Il garde son accès : c'est `current_period_end` qui coupe, pas le clic.
     */
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT subscriptions_status
        CHECK (status IN ('active', 'past_due', 'canceled')),
    CONSTRAINT subscriptions_period
        CHECK (period IN ('free', 'monthly', 'yearly')),
    CONSTRAINT subscriptions_provider
        CHECK (provider IS NULL OR provider IN ('stripe', 'notchpay')),
    /*
     * Le gratuit n'a ni fournisseur ni échéance ; le payant a les deux.
     *
     * Écrit en contrainte et non en commentaire : un abonnement payant sans
     * date de fin n'expirerait jamais, et personne ne s'en apercevrait avant
     * l'audit des recettes.
     */
    CONSTRAINT subscriptions_paid_has_end CHECK (
        (period = 'free'  AND current_period_end IS NULL AND provider IS NULL)
        OR
        (period <> 'free' AND current_period_end IS NOT NULL AND provider IS NOT NULL)
    )
);

CREATE INDEX subscriptions_expiring_idx
    ON subscriptions (current_period_end)
    WHERE current_period_end IS NOT NULL AND status = 'active';

COMMENT ON TABLE subscriptions IS
    'Un abonnement par organisation. current_period_end est la seule date de fin d''accès.';
