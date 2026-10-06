-- Le plafond de membres, et les plafonds du palier gratuit.
--
-- `members` est une clé de la plateforme selon le brief : les utilisateurs d'une
-- organisation sont nommés par Sekuu, et en redéclarer une seconde fois finirait par en dire
-- une autre. Sekuu étant mis de côté, personne ne l'applique — et un quota que personne
-- n'applique est une promesse qu'on ne tient pas, découverte en la dépassant sans effet.
--
-- Décision du 6 octobre 2026 : Neftya l'applique en local, le temps que la plateforme
-- revienne. La réconciliation est le prix assumé de cette décision ; elle est écrite dans le
-- journal, avec sa date.

ALTER TABLE organization_quotas
    ADD COLUMN IF NOT EXISTS members_max integer;

-- Même trois états que les deux autres : pas de ligne = non couvert, `NULL` = illimité,
-- entier = plafond. La contrainte n'interdit donc pas `NULL`, elle interdit l'absurde.
DO $$
BEGIN
    -- `conrelid` filtre la relation, donc le schéma courant.
    --
    -- Sans lui, le test portait sur le nom seul, qui est unique par schéma mais pas dans
    -- `pg_constraint` : dans une base qui porte soixante schémas de test, le premier posait
    -- la contrainte et les cinquante-neuf autres la croyaient déjà là. Elle manquait donc
    -- partout où elle aurait servi.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'organization_quotas_members_max'
          AND conrelid = 'organization_quotas'::regclass
    ) THEN
        ALTER TABLE organization_quotas
            ADD CONSTRAINT organization_quotas_members_max
            CHECK (members_max IS NULL OR members_max >= 1);
    END IF;
END $$;

-- Pourquoi `>= 1` et non `>= 0`.
--
-- Une organisation sans aucun membre n'existe pas : celui qui la crée en est le
-- propriétaire, et un plafond de zéro rendrait invalide l'organisation à l'instant de sa
-- création. Les deux autres quotas acceptent zéro parce que zéro projet et zéro analyse sont
-- des états tenables.
