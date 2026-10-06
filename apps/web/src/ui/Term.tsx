import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Un mot de métier, et ce qu'il veut dire.
 *
 * L'interface dit *chant*, *délignage*, *taquet d'étagère*, *embase de charnière*. Celui qui
 * fait son premier meuble ne connaît aucun de ces mots, et il doit pourtant les reconnaître
 * dans un rayon — c'est sous ces noms-là que les articles sont vendus.
 *
 * **On ne remplace pas le mot, on l'explique.** Écrire « la bande qui cache la tranche » à la
 * place de « chant » rendrait la phrase lisible et laisserait la personne muette devant le
 * rayon. Le vocabulaire fait partie de ce qu'on apprend en construisant.
 *
 * `<button>` et non `<abbr title>` : une infobulle de navigateur ne s'ouvre pas au doigt, et
 * c'est sur un téléphone qu'on lit le dossier à l'établi. Le même geste pour tout le monde.
 */
export function Term({ term }: { term: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();

  const definition = t(`glossary.${term}`);

  /*
   * Un mot sans définition reste un mot.
   *
   * i18next rend la clé quand elle manque : afficher « glossary.chant » en pointillés
   * promettrait une explication qui n'arrive pas. Mieux vaut le mot nu.
   */
  if (definition === `glossary.${term}`) return <>{t(`glossaryTerm.${term}`)}</>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}
        /*
         * `text-transform: inherit`, qu'un bouton ne prend pas tout seul.
         *
         * Les navigateurs ne font pas hériter la casse aux contrôles de formulaire : dans
         * un libellé en capitales, le mot expliqué s'affichait « rendement » à côté de
         * « PANNEAU ». Forcer les capitales ici aurait cassé l'inverse — le même composant
         * sert dans la liste d'outillage, qui est en casse normale.
         */
        className="cursor-help border-b border-dotted border-outline text-left [text-transform:inherit]"
      >
        {t(`glossaryTerm.${term}`)}
      </button>

      {open && (
        <span
          id={id}
          role="note"
          // `w-64` et non `max-w` : une définition de deux lignes qui se recale à chaque
          // ouverture fait sauter la page sous le doigt.
          className="absolute top-full left-0 z-30 mt-1 block w-64 rounded border border-hairline bg-surface p-2 text-xs leading-relaxed font-normal normal-case text-ink-variant shadow-lg"
        >
          {definition}
        </span>
      )}
    </span>
  );
}
