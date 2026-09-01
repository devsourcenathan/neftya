import { useSyncExternalStore } from 'react';

/**
 * Écoute une requête média, du côté du code plutôt que des classes.
 *
 * Certaines décisions ne se prennent pas en CSS : un panneau replié sur grand écran doit
 * redevenir un onglet sur téléphone, et une classe `hidden` ne change pas l'état, elle le
 * cache. Sans cela, un panneau replié la veille sur un ordinateur revient en bandeau
 * illisible sur un mobile.
 *
 * `useSyncExternalStore` plutôt qu'un `useEffect` : la valeur est juste dès le premier
 * rendu, donc aucun clignotement au chargement.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // Au rendu serveur il n'y a pas de fenêtre. Neftya n'en fait pas, mais la valeur de
    // repli doit exister : le grand écran est le cas majoritaire de cet outil.
    () => true,
  );
}
