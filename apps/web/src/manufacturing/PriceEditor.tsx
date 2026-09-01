import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { exponentOf, formatMoney, parseMoney, type Money } from '@neftya/units';
import { ApiRequestError } from '../api/client.js';
import { savePrice, useApi, type QuotationLine } from '../api/projects.js';

/**
 * La saisie des prix.
 *
 * Neftya n'invente aucun tarif : le prix d'un panneau varie fortement selon la région et le
 * fournisseur, et un devis chiffré faux est pire qu'un devis vide. Les prix sont donc saisis
 * ici, une fois, et mémorisés par organisation.
 *
 * Le libellé montré à l'utilisateur est traduit ; ce qui est enregistré est la **référence
 * stable** du moteur (`panel:mdf:18`). Un prix accroché à un libellé se perdrait au premier
 * changement de langue.
 *
 * @see docs/MANUFACTURING.md §5
 */
export function PriceEditor({
  lines,
  currency,
  projectId,
}: {
  lines: QuotationLine[];
  currency: string;
  projectId: string;
}) {
  const { t } = useTranslation();

  return (
    <table className="w-full max-w-3xl text-sm">
      <thead>
        <tr className="text-left text-stone-500">
          <th className="py-1">{t('manufacturing.item')}</th>
          <th className="py-1 text-right">{t('manufacturing.quantity')}</th>
          <th className="py-1 text-right">{t('manufacturing.unitPrice')}</th>
          <th className="py-1 text-right">{t('manufacturing.lineTotal')}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <PriceRow
            key={line.reference}
            line={line}
            currency={currency}
            projectId={projectId}
          />
        ))}
      </tbody>
    </table>
  );
}

function PriceRow({
  line,
  currency,
  projectId,
}: {
  line: QuotationLine;
  currency: string;
  projectId: string;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  const save = useMutation({
    mutationFn: (price: Money) =>
      savePrice(api, {
        reference: line.reference,
        amountMinor: price.amount,
        currency: price.currency,
      }),
    onSuccess: async () => {
      // Le devis entier change : un prix saisi peut débloquer le total général.
      await queryClient.invalidateQueries({ queryKey: ['manufacturing', projectId] });
    },
  });

  const commit = (text: string) => {
    setDraft(null);

    // Un champ vidé n'efface pas le prix : il n'y a rien à enregistrer, et effacer par
    // inadvertance un prix saisi serait une mauvaise surprise.
    if (text.trim() === '') {
      setRejected(false);
      return;
    }

    const price = parseMoney(text, currency);

    // Un prix incompris ne devient pas un prix : ni zéro, ni la valeur d'à côté.
    if (!price) {
      setRejected(true);
      return;
    }

    setRejected(false);
    save.mutate(price);
  };

  return (
    <tr className="border-t border-stone-100">
      <td className="py-1">
        <span className="block">{label(line.reference, t)}</span>
        {/* La référence est montrée : c'est elle qui fait foi, et elle aide à comprendre
            pourquoi deux épaisseurs ont deux prix. */}
        <span className="font-mono text-xs text-stone-400">{line.reference}</span>
      </td>

      <td className="py-1 text-right tabular-nums">
        {line.quantity} {t(`unit.${line.unit}`, { count: line.quantity })}
      </td>

      <td className="py-1 text-right">
        <input
          className={`w-28 rounded border px-2 py-1 text-right tabular-nums ${
            rejected ? 'border-red-400' : 'border-stone-300'
          }`}
          value={draft ?? (line.unitPrice ? amount(line.unitPrice) : '')}
          placeholder={t('manufacturing.enterPrice')}
          aria-label={`${t('manufacturing.unitPrice')} — ${line.reference}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {rejected && (
          <p className="text-xs text-red-700">{t('manufacturing.badPrice')}</p>
        )}
        {save.isError && (
          <p className="text-xs text-red-700">
            {save.error instanceof ApiRequestError
              ? save.error.message
              : t('state.error')}
          </p>
        )}
      </td>

      <td className="py-1 text-right tabular-nums">
        {line.total ? formatMoney(line.total, i18n.language) : '—'}
      </td>
    </tr>
  );
}

/**
 * Le libellé traduit d'une référence.
 *
 * `panel:mdf:18` se lit « Panneau MDF 18 mm » ; `accessory:screw_4x50` reprend la clé
 * d'accessoire déjà traduite. Une référence inconnue s'affiche telle quelle plutôt que de
 * disparaître : mieux vaut un code brut qu'une ligne muette dans un devis.
 */
type Translate = ReturnType<typeof useTranslation>['t'];

function label(reference: string, t: Translate): string {
  const [kind, ...rest] = reference.split(':');

  if (kind === 'panel') {
    const [material, thickness] = rest;
    return t('manufacturing.panelPrice', {
      material: t(`material.${material}`),
      thickness,
    });
  }

  if (kind === 'accessory') return t(`accessory.${rest[0]}`);
  if (kind === 'edge_banding') return t('manufacturing.edgeBandingPrice');

  return reference;
}

/**
 * Le montant tel que l'utilisateur l'écrirait — en unités **majeures**.
 *
 * Le stockage est en unités mineures : 1250 pour 12,50 €. Afficher 1250 dans un champ que
 * `parseMoney` relira comme des euros multiplierait le prix par cent à chaque aller-retour.
 * Le nombre de décimales vient de la table ISO, jamais d'une division par cent : le franc
 * CFA n'en a aucune.
 */
function amount(money: Money): string {
  const exponent = exponentOf(money.currency);

  return exponent === 0
    ? String(money.amount)
    : (money.amount / 10 ** exponent).toFixed(exponent);
}
