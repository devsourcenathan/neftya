/**
 * L'offre qu'un visiteur a choisie avant d'avoir un compte.
 *
 * On ne peut pas payer sans compte : le bouton d'une offre payante mène donc à
 * l'inscription. Sans cette mémoire, celui qui a cliqué « Pro » se retrouverait sur la
 * liste de ses projets, à chercher où il avait vu ce prix — et la plupart ne chercheraient
 * pas.
 *
 * **`sessionStorage` et non `localStorage`** : une intention d'achat appartient à la
 * visite qui l'a formée. Retrouvée trois semaines plus tard dans un autre onglet, elle
 * enverrait sur une page de paiement quelqu'un qui venait consulter ses plans.
 *
 * L'intention est **consommée** à la lecture. La laisser en place renverrait vers la
 * facturation à chaque ouverture, ce qui tiendrait moins du raccourci que du harcèlement.
 */

const KEY = 'neftya.intendedPlan';

/**
 * Toute lecture et toute écriture sont protégées.
 *
 * `sessionStorage` lève en navigation privée sur certains navigateurs, et quand les
 * données de site sont bloquées. Une page d'accueil qui tombe parce qu'un stockage a
 * refusé une écriture perdrait le visiteur pour une commodité.
 */
export function rememberIntendedPlan(code: string): void {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    // Tant pis : le visiteur arrivera sur la facturation sans son offre mise en avant.
  }
}

/** Rend l'offre retenue, et l'oublie. */
export function takeIntendedPlan(): string | null {
  try {
    const code = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);

    return code;
  } catch {
    return null;
  }
}

/** Y a-t-il une intention en attente ? Sans la consommer. */
export function hasIntendedPlan(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
