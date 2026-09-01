import { useCallback, useState } from 'react';

/**
 * Un réglage d'affichage qui survit à la fermeture de l'onglet.
 *
 * Replier un panneau, refermer la barre latérale : ce sont des choix qu'on fait une fois et
 * qu'on ne veut pas refaire chaque matin. Ils vivent dans le navigateur, pas sur le serveur
 * — ils appartiennent au poste de travail, pas à l'organisation, et un menuisier qui règle
 * son écran d'atelier n'impose rien à son collègue.
 *
 * **Tout accès au stockage est tolérant à l'échec.** `localStorage` lève en navigation
 * privée, quand le stockage est refusé, ou dans un contexte qui n'en a pas. Une préférence
 * d'affichage ne vaut pas de faire tomber l'application.
 */
export function usePersisted<T>(
  key: string,
  initial: T,
  /** Valide ce qui a été relu. Rendre `null` retombe sur la valeur initiale. */
  revive: (raw: unknown) => T | null,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initial;

      // Ce qui a été écrit hier peut ne plus avoir la forme d'aujourd'hui : une version
      // précédente, une clé renommée, une main curieuse dans la console.
      return revive(JSON.parse(stored) as unknown) ?? initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);

      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Le choix vaut pour cette session, et c'est déjà l'essentiel.
      }
    },
    [key],
  );

  return [value, update];
}
