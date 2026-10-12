/**
 * Dans quelle devise montrer un prix.
 *
 * **Le problème que ça règle.** La page d'accueil affichait toutes les devises à la fois :
 * « 29,00 € · 5 000 FCFA » sur chaque carte, soit cinq nombres et deux monnaies pour trois
 * offres. Et la page de facturation, censée ne montrer que la devise de l'organisation,
 * montrait les quatre combinaisons — mensuel et annuel, euros et francs — parce que
 * `organization_settings.currency` est nulle par défaut et que personne ne l'avait jamais
 * renseignée. Huit boutons de paiement, dont la moitié s'adresse à l'autre continent.
 *
 * On montre donc **une** devise, et on laisse en changer. Deviner sans permettre de
 * corriger serait pire que tout afficher : un artisan de Douala en déplacement verrait des
 * euros sans comprendre d'où ils sortent, et n'aurait aucun moyen de revenir.
 *
 * Jamais de conversion : un montant converti au taux du jour est un montant que personne
 * n'a décidé, et c'est celui de l'environnement qui est débité.
 */

/**
 * Les fuseaux de la zone franc CEMAC.
 *
 * Le fuseau plutôt que la langue : `fr-FR` et `fr-CM` se ressemblent trop, et beaucoup de
 * navigateurs camerounais annoncent simplement `fr`. Un fuseau, lui, est posé par le
 * système et désigne un lieu.
 */
const XAF_ZONES = [
  'Africa/Douala',
  'Africa/Bangui',
  'Africa/Ndjamena',
  'Africa/Brazzaville',
  'Africa/Libreville',
  'Africa/Malabo',
];

const KEY = 'neftya.currency';

/**
 * La devise que suggère un fuseau horaire, ou `null`.
 *
 * **`null` est une réponse.** Hors de la zone franc, un fuseau ne dit rien de la devise
 * souhaitée : l'Allemagne, le Canada et le Japon tomberaient tous dans le même « autre »,
 * et répondre « euro » pour eux serait une invention. C'est au catalogue de trancher.
 */
export function currencyFromZone(timeZone: string): string | null {
  return XAF_ZONES.includes(timeZone) ? 'XAF' : null;
}

/**
 * La première devise encaissable parmi des indices, du plus sûr au plus incertain.
 *
 * Le cœur de la décision, et la seule partie qui mérite d'être éprouvée : un indice ne
 * vaut que si le produit sait l'encaisser. Une organisation dont les réglages disent
 * « USD » n'a pas à voir un bouton qui mènerait à un refus.
 *
 * Rend `null` quand il n'y a rien à vendre — et la page dira « bientôt » plutôt que
 * d'afficher un prix qui n'existe pas.
 */
export function pickCurrency(
  available: readonly string[],
  candidates: readonly (string | null)[],
): string | null {
  for (const candidate of candidates) {
    if (candidate !== null && available.includes(candidate)) return candidate;
  }

  return available[0] ?? null;
}

/** Le choix retenu d'une visite précédente. */
export function savedCurrency(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    /*
     * `localStorage` lève en navigation privée sur certains navigateurs, et quand les
     * données de site sont bloquées. Une page de tarifs qui tombe parce qu'un stockage a
     * refusé une lecture perdrait le visiteur pour une commodité.
     */
    return null;
  }
}

/**
 * Retenir le choix du visiteur.
 *
 * `localStorage` et non `sessionStorage` : contrairement à une intention d'achat, qui
 * appartient à la visite qui l'a formée, la devise d'un artisan ne change pas d'une semaine
 * sur l'autre. La lui redemander à chaque visite serait une question dont on connaît déjà
 * la réponse.
 */
export function rememberCurrency(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Tant pis : il recliquera. Mieux vaut ça qu'une page blanche.
  }
}

/**
 * La devise à afficher, tous indices confondus.
 *
 * `organization` est ce que le client a **payé** : une décision, pas une préférence, et
 * elle passe donc devant son choix d'affichage comme devant son fuseau.
 */
export function preferredCurrency(
  available: readonly string[],
  organization: string | null = null,
): string | null {
  let zone: string | null = null;

  try {
    zone = currencyFromZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    // Un navigateur sans fuseau exploitable : le catalogue tranchera.
  }

  return pickCurrency(available, [organization, savedCurrency(), zone]);
}

/** Les devises distinctes d'une liste de prix, dans l'ordre où elles apparaissent. */
export function currenciesOf(
  prices: readonly { currency: string }[],
): readonly string[] {
  return [...new Set(prices.map((price) => price.currency))];
}
