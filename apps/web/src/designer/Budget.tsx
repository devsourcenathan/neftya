import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  billOfMaterials,
  costLines,
  drilling,
  nest,
  type Furniture,
} from '@neftya/engine';
import { formatMoney, multiply, sum, type Money } from '@neftya/units';
import { listPrices, useApi, type PriceReference } from '../api/projects.js';

/**
 * Ce que le meuble coûte, pendant qu'on le règle.
 *
 * Celui qui fait son premier meuble ne part pas d'un meuble : il part de « j'ai 150 € ».
 * Le devis existait déjà, mais au bout du parcours — il fallait concevoir, puis ouvrir le
 * dossier de fabrication pour apprendre que c'était trop cher, puis revenir. Le chiffre
 * doit bouger pendant qu'on tire les poignées de cote, sinon il n'aide pas à décider.
 *
 * **Aucun prix n'est inventé, et c'est ce qui rend ce total utilisable.** Les prix sont
 * ceux que l'organisation a saisis ; ceux qui manquent sont comptés, pas estimés. Un total
 * partiel présenté comme un total serait un chiffre faux qu'on relit sans le voir — la même
 * règle que le devis du dossier, appliquée ici.
 *
 * Le calcul est local : `nest`, `billOfMaterials` et `costLines` sont purs et tournent déjà
 * dans le navigateur pour la liste de pièces. Le serveur garde le dernier mot pour ce qui
 * part à l'atelier ; ici, on aide à décider.
 */
export function Budget({ furniture }: { furniture: Furniture }) {
  const { t } = useTranslation();
  const api = useApi();

  const prices = useQuery({
    queryKey: ['prices'],
    queryFn: () => listPrices(api),
    // Les prix de référence changent à la main, rarement : les relire à chaque glissement
    // de curseur coûterait une requête par image pour un chiffre qui ne bouge pas.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const estimate = useMemo(
    () => estimateCost(furniture, prices.data ?? []),
    [furniture, prices.data],
  );

  /*
   * Rien tant qu'on ne sait rien.
   *
   * Un rôle sans droit de lire les coûts reçoit un refus, et une organisation qui n'a saisi
   * aucun prix n'a rien à montrer. Dans les deux cas, un bandeau « total indisponible »
   * occuperait la place d'un réglage pour ne rien apprendre.
   */
  if (prices.isError || !estimate || estimate.lines === 0) return null;

  return (
    <p className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2 text-sm">
      <span className="text-ink-variant">{t('budget.label')}</span>

      {estimate.total ? (
        <span className="technical font-bold text-ink">
          {formatMoney(estimate.total)}
        </span>
      ) : (
        /* Le nombre de prix manquants plutôt qu'un total partiel : il dit quoi faire, et
           combien il reste à faire. */
        <span className="text-xs text-ink-variant">
          {t('budget.missing', { count: estimate.missing })}
        </span>
      )}
    </p>
  );
}

export interface CostEstimate {
  /** Lignes dont le prix n'est pas saisi. */
  missing: number;
  lines: number;
  /** `null` dès qu'un prix manque. Jamais un total partiel. */
  total: Money | null;
}

/**
 * Ce que coûte un meuble, avec les prix qu'on a.
 *
 * Pure, et séparée du composant pour être éprouvée : c'est ici que se joue la seule règle
 * qui compte — **un prix manquant laisse le total à `null`**. Faire comme si la ligne valait
 * zéro produirait un chiffre plus bas que la réalité, affiché avec la même assurance qu'un
 * vrai. Personne ne relit un nombre qui s'affiche, et celui-là ferait acheter un meuble
 * qu'on ne peut pas payer.
 */
export function estimateCost(
  furniture: Furniture,
  prices: readonly PriceReference[],
): CostEstimate | null {
  if (prices.length === 0) return null;

  /*
   * La devise se lit des prix, elle ne se suppose pas.
   *
   * Une organisation en tient une ; la prendre d'un réglage d'affichage aurait permis de
   * montrer « 240 € » sur des prix saisis en francs suisses. Les lignes d'une autre devise
   * sont comptées comme manquantes, ce qu'elles sont : on ne sait pas les additionner.
   */
  const currency = prices[0]?.currency as string;

  const table = new Map<string, Money>(
    prices
      .filter((price) => price.currency === currency)
      .map((price) => [
        price.reference,
        { amount: price.amount_minor, currency: price.currency },
      ]),
  );

  const lines = costLines(
    billOfMaterials(furniture, nest(furniture), drilling(furniture)),
  );

  const priced = lines.map((line) => ({
    line,
    unitPrice: table.get(line.reference) ?? null,
  }));

  const missing = priced.filter((entry) => !entry.unitPrice).length;

  return {
    missing,
    lines: lines.length,
    total:
      missing > 0
        ? null
        : sum(
            priced.map((entry) =>
              multiply(entry.unitPrice as Money, entry.line.quantity),
            ),
            currency,
          ),
  };
}
