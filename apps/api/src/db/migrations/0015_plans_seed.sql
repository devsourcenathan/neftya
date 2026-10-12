-- Le catalogue d'offres, et ce qu'on sait d'elles aujourd'hui.
--
-- Les plafonds seulement : les prix vivent dans l'environnement depuis 0016.
-- Une offre sans prix dans une devise ne s'y vend pas, et l'interface le dit
-- plutôt que d'afficher un montant que personne n'a arrêté. C'est la même règle
-- que le devis de fabrication, qui refuse de totaliser tant qu'un prix manque.

INSERT INTO plans (code, projects_max, ai_month_max, members_max, rank) VALUES
    -- Les plafonds du gratuit sont ceux de FREE_TIER, dans apps/api/src/auth/repository.ts.
    -- Un test les compare : deux chiffres pour la même offre finiraient par diverger.
    ('free',          3,    5,    1,    0),
    -- « Projets illimités » est déjà annoncé sur la page d'accueil : NULL le dit.
    ('pro',           NULL, 200,  1,    1),
    ('professional',  NULL, 1000, NULL, 2);

-- Toute organisation existante est au gratuit.
--
-- Sans cette ligne, elle n'aurait pas d'abonnement du tout — un quatrième état
-- entre « gratuit » et « payant » qu'il aurait fallu traiter partout.
INSERT INTO subscriptions (organization_id, plan_code, status, period)
SELECT id, 'free', 'active', 'free' FROM organizations
ON CONFLICT (organization_id) DO NOTHING;
