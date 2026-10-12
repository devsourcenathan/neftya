-- Le registre des encaissements, et la mémoire des événements reçus.
--
-- Deux tables pour deux questions auxquelles il faut pouvoir répondre des mois
-- plus tard : « ce client a-t-il payé ? » et « ai-je déjà traité ceci ? ».

-- Ce qu'on a demandé, et ce qui est arrivé.
--
-- Une ligne par tentative, créée **avant** de parler au fournisseur. Écrite
-- après, un appel qui aboutit chez lui et échoue chez nous laisserait un
-- encaissement sans trace — un client débité qu'aucune requête ne retrouve.
CREATE TABLE payments (
    id              uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    provider        text NOT NULL,
    /*
     * La référence chez le fournisseur : `cs_...` pour une session Stripe.
     *
     * Nulle à la création — on ne la connaît qu'après l'appel — puis posée.
     * C'est par elle qu'un webhook retrouve sa ligne.
     */
    provider_ref    text,
    plan_code       text NOT NULL REFERENCES plans (code),
    period          text NOT NULL,
    currency        text NOT NULL,
    amount_minor    integer NOT NULL,
    status          text NOT NULL,
    /*
     * La clé d'idempotence, fournie par l'appelant ou tirée de la demande.
     *
     * Unique par organisation : deux clics sur « Payer » ne doivent pas ouvrir
     * deux abonnements. L'unicité est en base parce qu'un contrôle applicatif
     * ne tient pas contre deux requêtes simultanées.
     */
    idempotency_key text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    settled_at      timestamptz,

    CONSTRAINT payments_provider CHECK (provider IN ('stripe', 'notchpay')),
    CONSTRAINT payments_period   CHECK (period IN ('monthly', 'yearly')),
    CONSTRAINT payments_status
        CHECK (status IN ('pending', 'settled', 'failed', 'canceled', 'expired')),
    CONSTRAINT payments_amount   CHECK (amount_minor > 0),
    CONSTRAINT payments_currency CHECK (currency ~ '^[A-Z]{3}$'),
    /* Un paiement réglé porte une date ; un paiement en cours n'en a pas. */
    CONSTRAINT payments_settled_has_date CHECK (
        (status = 'settled' AND settled_at IS NOT NULL)
        OR (status <> 'settled' AND settled_at IS NULL)
    )
);

CREATE UNIQUE INDEX payments_idempotency_idx
    ON payments (organization_id, idempotency_key);

CREATE UNIQUE INDEX payments_provider_ref_idx
    ON payments (provider, provider_ref)
    WHERE provider_ref IS NOT NULL;

CREATE INDEX payments_organization_idx
    ON payments (organization_id, created_at DESC);

-- Les événements déjà vus.
--
-- **Les deux fournisseurs préviennent qu'un même événement peut arriver
-- plusieurs fois.** Sans cette table, un `payment.complete` rejoué prolongerait
-- une seconde fois l'abonnement : le client gagnerait un mois gratuit à chaque
-- réessai du fournisseur, et personne ne le verrait avant l'audit.
--
-- La clé primaire porte la garantie : l'insertion échoue sur un doublon, et
-- c'est l'échec qui fait sauter le traitement. Un `SELECT` préalable ne tiendrait
-- pas contre deux livraisons simultanées.
CREATE TABLE provider_events (
    provider    text NOT NULL,
    event_id    text NOT NULL,
    type        text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (provider, event_id),
    CONSTRAINT provider_events_provider CHECK (provider IN ('stripe', 'notchpay'))
);

-- L'identifiant du client chez le fournisseur, pour le retrouver au
-- renouvellement et pour lui ouvrir son portail de facturation.
ALTER TABLE organizations
    ADD COLUMN stripe_customer_id text;

CREATE UNIQUE INDEX organizations_stripe_customer_idx
    ON organizations (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;
