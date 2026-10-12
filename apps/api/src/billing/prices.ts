import type { BillingPeriod } from '../db/schema.js';

/**
 * Les prix, lus de l'environnement.
 *
 * Ils étaient en base, semés par migration. Changer un tarif demandait alors une migration,
 * donc un déploiement, donc un développeur — pour une décision qui est commerciale et qui
 * se prend un matin. Ils vivent maintenant dans l'environnement, où l'hébergeur les expose
 * et où les changer coûte un redémarrage.
 *
 * Une variable par combinaison, nommée en toutes lettres :
 *
 *     NEFTYA_PRICE_PRO_EUR_MONTHLY=2900
 *     NEFTYA_PRICE_PRO_XAF_YEARLY=190000
 *
 * **Une seule chaîne qui porterait tout** aurait tenu en une variable et se serait lue
 * comme un hiéroglyphe dans le tableau de bord d'un hébergeur ; une virgule de travers y
 * aurait changé un prix sans que rien ne le dise. Huit variables nommées se relisent.
 *
 * Deux règles, et elles ne se confondent pas :
 *
 * - **Absente, l'offre ne se vend pas dans cette combinaison.** C'est une réponse, pas une
 *   panne : tant que le prix en francs CFA n'est pas arrêté, le mobile money ne propose
 *   pas cette offre. Convertir au taux du jour donnerait un montant que personne n'a
 *   décidé et qui bouge tout seul.
 * - **Mal formée, le serveur refuse de démarrer.** `29,00` ou `29.00` n'est pas « pas de
 *   prix » : c'est quelqu'un qui a voulu fixer un prix et s'est trompé d'unité. Le laisser
 *   passer en silence retirerait l'offre de la vente sans que personne ne s'en aperçoive
 *   avant de regarder les recettes.
 */

export const BILLING_CURRENCIES = ['EUR', 'XAF'] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export const BILLING_PERIODS = [
  'monthly',
  'yearly',
] as const satisfies readonly BillingPeriod[];

export interface PriceEntry {
  planCode: string;
  currency: BillingCurrency;
  period: BillingPeriod;
  /**
   * En unité mineure, comme partout ailleurs dans le produit.
   *
   * Le franc CFA n'a pas de décimale : son unité mineure **est** le franc, et 19 000 se
   * saisit `19000`. L'euro en a deux, et 29 € se saisit `2900`. C'est la source d'erreur
   * principale de ce fichier, et la raison du contrôle de vraisemblance plus bas.
   */
  amountMinor: number;
}

/** Le nom de la variable pour une combinaison. Exporté : les messages d'erreur le citent. */
export function priceVariable(
  planCode: string,
  currency: BillingCurrency,
  period: BillingPeriod,
): string {
  return `NEFTYA_PRICE_${planCode.toUpperCase()}_${currency}_${period.toUpperCase()}`;
}

/**
 * Au-dessous, c'est presque sûrement un prix saisi en unité majeure.
 *
 * Personne ne vend un abonnement professionnel 29 centimes. Le piège est d'écrire `29` au
 * lieu de `2900` : le produit encaisserait alors vingt-neuf centimes par mois, et le
 * défaut ne se verrait qu'au relevé bancaire. Le seuil est volontairement bas — il attrape
 * la faute d'unité sans interdire une offre d'appel.
 */
export const MINIMUM_PLAUSIBLE_MINOR = 100;

export function loadPrices(
  env: Record<string, string | undefined>,
  planCodes: readonly string[],
): PriceEntry[] {
  const prices: PriceEntry[] = [];

  for (const planCode of planCodes) {
    for (const currency of BILLING_CURRENCIES) {
      for (const period of BILLING_PERIODS) {
        const name = priceVariable(planCode, currency, period);
        const raw = env[name]?.trim();

        if (raw === undefined || raw === '') continue;

        prices.push({
          planCode,
          currency,
          period,
          amountMinor: parseAmount(raw, name),
        });
      }
    }
  }

  return prices;
}

function parseAmount(raw: string, name: string): number {
  /*
   * Des chiffres, et rien d'autre.
   *
   * `Number('29.00')` vaut 29 et `Number(' 29 ')` aussi : s'en remettre à lui accepterait
   * une saisie en euros comme si elle était en centimes. L'expression refuse tout ce qui
   * n'est pas une suite de chiffres, y compris un séparateur décimal — l'unité mineure
   * n'en a pas.
   */
  if (!/^\d+$/u.test(raw)) {
    throw new Error(
      `${name} doit être un entier en unité mineure, sans séparateur : « ${raw} ». ` +
        '29 € s’écrit 2900 ; 19 000 F CFA s’écrit 19000.',
    );
  }

  const amount = Number(raw);

  if (amount < MINIMUM_PLAUSIBLE_MINOR) {
    throw new Error(
      `${name} vaut ${raw}, soit moins de ${String(MINIMUM_PLAUSIBLE_MINOR)} en unité ` +
        'mineure. C’est presque sûrement un prix saisi en unité majeure : 29 € s’écrit 2900.',
    );
  }

  return amount;
}
