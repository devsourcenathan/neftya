import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { STORE_MIN_CUT_MM, type CuttingOrder as Order } from '@neftya/engine';
import { Button, SectionTitle } from '../ui/index.js';

/**
 * La fiche de débit du magasin.
 *
 * Elle s'adresse à qui n'a pas de scie à format — c'est-à-dire à presque tout le monde.
 * Le plan de découpe d'à côté montre où poser chaque pièce sur le panneau ; celui-ci ne
 * montre rien et se lit à voix haute au comptoir.
 *
 * **Le texte brut compte autant que le tableau.** Une fiche se transmet par message au
 * magasin, se colle dans un formulaire de commande, s'imprime. Un tableau à l'écran ne
 * fait aucune de ces trois choses.
 */
export function CuttingOrder({ order }: { order: Order }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (order.groups.length === 0) return null;

  const tooSmall = order.smallestSideMm > 0 && order.smallestSideMm < STORE_MIN_CUT_MM;

  const copy = async () => {
    await navigator.clipboard.writeText(asText(order, t));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section>
      <SectionTitle hint={t('cuttingOrder.pieces', { count: order.totalPieces })}>
        {t('cuttingOrder.title')}
      </SectionTitle>

      <p className="mb-4 max-w-prose text-sm text-ink-variant">
        {t('cuttingOrder.lead')}
      </p>

      {tooSmall && (
        /*
         * Dit avant le magasin, pas devant le comptoir.
         *
         * Une pièce sous la centaine de millimètres passerait sous le presseur : l'enseigne
         * refuse, et le projet s'arrête avec des panneaux déjà payés dans le coffre.
         */
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {t('cuttingOrder.tooSmall', {
            size: order.smallestSideMm,
            limit: STORE_MIN_CUT_MM,
          })}
        </p>
      )}

      <ul className="flex flex-col gap-6">
        {order.groups.map((group) => (
          <li key={`${group.material}-${group.thicknessMm}`}>
            <p className="mb-2 font-medium text-ink">
              {t('cuttingOrder.buy', {
                count: group.panels,
                material: t(`material.${group.material}`),
                thickness: group.thicknessMm,
                length: group.format.lengthMm,
                width: group.format.widthMm,
              })}
            </p>

            {/* Deux nombres qui ne disent pas la même chose : ce qu'on emporte, et
                combien de fois le comptoir règle sa butée. */}
            <p className="mb-2 text-sm text-ink-variant">
              {t('cuttingOrder.summary', {
                pieces: group.totalPieces,
                count: group.pieces.length,
              })}
            </p>

            {/* `min-w-0` sur la section parente laisse ce cadre défiler seul : à 375 px la
                quatrième colonne sort, et c'est elle qui doit glisser, pas la page. */}
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-md text-sm">
                <thead>
                  <tr className="text-left text-ink-variant">
                    <th className="py-1 pr-4">{t('cuttingOrder.size')}</th>
                    <th className="py-1 pr-4 text-right">{t('cuttingOrder.count')}</th>
                    <th className="py-1 pr-4">{t('cuttingOrder.grain')}</th>
                    <th className="py-1">{t('cuttingOrder.marks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.pieces.map((piece) => (
                    <tr
                      key={`${piece.lengthMm}x${piece.widthMm}`}
                      className="border-t border-hairline"
                    >
                      <td className="technical py-1.5 pr-4 whitespace-nowrap">
                        {piece.lengthMm} × {piece.widthMm}
                      </td>
                      <td className="technical py-1.5 pr-4 text-right">
                        {piece.quantity}
                      </td>
                      <td className="py-1.5 pr-4 text-ink-variant">
                        {t(
                          piece.grainLocked
                            ? 'cuttingOrder.grainLocked'
                            : 'cuttingOrder.grainFree',
                        )}
                      </td>
                      <td className="technical py-1.5 text-xs whitespace-nowrap text-outline">
                        {piece.ids.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button onClick={() => void copy()}>
          {t(copied ? 'cuttingOrder.copied' : 'cuttingOrder.copy')}
        </Button>
      </div>
    </section>
  );
}

/**
 * La fiche en texte brut.
 *
 * Exportée pour être testée sans navigateur : c'est elle qui part au magasin, et un
 * millimètre perdu ici coûte un panneau.
 */
export function asText(order: Order, t: TFunction): string {
  const lines: string[] = [];

  for (const group of order.groups) {
    lines.push(
      t('cuttingOrder.buy', {
        count: group.panels,
        material: t(`material.${group.material}`),
        thickness: group.thicknessMm,
        length: group.format.lengthMm,
        width: group.format.widthMm,
      }),
    );

    for (const piece of group.pieces) {
      // « 2 × 864 × 450 mm » : la quantité d'abord, comme on la dicte.
      const grain = piece.grainLocked ? `  (${t('cuttingOrder.grainLocked')})` : '';
      lines.push(
        `  ${piece.quantity} × ${piece.lengthMm} × ${piece.widthMm} mm${grain}`,
      );
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
