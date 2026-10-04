-- Notifications sortantes (chantier F).
--
-- Tant que Sekuu Notify servait, l'envoi vivait chez la plateforme. En local,
-- chaque envoi est une ligne : qui, quoi, à qui, et si c'est parti. Pas de
-- file ni de travailleur : l'envoi est synchrone dans la requête, et la ligne
-- dit ce qui s'est passé — y compris l'échec, qui se renvoie à la main.

CREATE TABLE notifications_outbox (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL,
    project_id      uuid        NOT NULL,
    created_by      uuid        NOT NULL,
    to_email        text        NOT NULL,
    subject         text        NOT NULL,
    status          text        NOT NULL,
    error           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz,

    CONSTRAINT notifications_outbox_status CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX notifications_outbox_organization_idx
    ON notifications_outbox (organization_id, created_at DESC);
