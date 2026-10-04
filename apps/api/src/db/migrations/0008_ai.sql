-- Générations d'IA locales (chantier E).
--
-- Tant que Sekuu AI servait, la génération vivait chez la plateforme et Neftya
-- ne gardait rien. En local, chaque appel est une ligne : c'est ce qui rend
-- l'idempotence réelle (même clé = même ligne, pas de double facturation) et
-- le quota comptable (les analyses du mois se comptent, elles ne se devinent pas).

CREATE TABLE ai_generations (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL,
    -- `neftya:interpret:{org}:{sha256(texte)}` : l'événement métier, pas du hasard.
    idempotency_key text        NOT NULL,
    status          text        NOT NULL,
    input           text        NOT NULL,
    output          jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ai_generations_status
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    CONSTRAINT ai_generations_idempotency_unique UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX ai_generations_organization_idx ON ai_generations (organization_id, created_at DESC);
